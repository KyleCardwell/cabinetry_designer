import { beforeEach, describe, expect, it } from 'vitest';
import { auto, pin, room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { runItems } from '../grid.js';
import { roomDiagnostics, syncRoom } from '../room.js';
import { pinTargetsForRun, resolvePinnedSpan } from '../runPins.js';
import { runScene } from '../runScene.js';
import { splitRun } from '../splitRun.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
let stored;
let column;

beforeEach(() => {
  stored = room({ walls: [
    wall({ id: 'H', x2: 120, runs: [run({
      id: 'T', cabinetTypeId: CABINET_TYPE_IDS.TALL, autoCount: false,
      ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
      items: [auto('A'), { ...auto('B'), pin: pin(0, {
        from: 'return', wallId: 'W', runId: 'R', edge: 'both', anchor: 'left', valueRight: 0,
      }) }, auto('C')],
    })] }),
    wall({
      id: 'W', x1: 60, y1: 0, x2: 60, y2: 72, thickness: 0,
      landings: {
        start: { wallId: 'H', side: 'front', ref: 'left', to: 'near', offset: 60 },
        end: null,
      },
      runs: [run({ id: 'R', width: 48, items: [auto('desk')],
        anchors: { left: true, right: false } })],
    }),
  ] });
  column = stored.walls[0].runs[0].grid.cols[1];
});

describe('DR3b return pins', () => {
  it.each([
    ['anchor 1: flush on both edges', 'both', 0, 0, 35.125, 24.875, 60],
    ['anchor 2: both edges 1.5 inches out', 'both', 1.5, 1.5, 33.625, 27.875, 61.5],
    ['anchor 3: flush left, retaining pass-1 width', 'left', 0, undefined, 35.125, 40, 75.125],
    ['anchor 4: centered on the return', 'center', 0, undefined, 27.5625, 40, 67.5625],
  ])('%s', (_label, edge, value, valueRight, x, width, cx) => {
    column.pin = { ...column.pin, edge, anchor: edge === 'both' ? 'left' : edge, value };
    if (valueRight === undefined) delete column.pin.valueRight;
    else column.pin.valueRight = valueRight;
    const synced = syncRoom(stored, settings);
    const currentWall = synced.walls[0];
    const currentRun = currentWall.runs[0];
    const scene = runScene(synced, currentWall, currentRun, settings);
    expect(scene.result.pieces.map(({ id, x, width }) => ({ id, x, width }))).toEqual([
      { id: 'A', x: 0, width: x },
      { id: 'B', x, width },
      { id: 'C', x: cx, width: 120 - cx },
    ]);
    if (edge === 'center') expect(x + width / 2).toBe(47.5625);
    expect(scene.result.errors).toEqual([]);
    expect(scene.result.warnings.some(({ code }) => code === 'pin-unreachable')).toBe(false);
    expect(roomDiagnostics(synced, settings).T.warnings.some(({ code }) => code === 'pin-unresolved')).toBe(false);
    expect(runItems(currentRun)[1].pin).toEqual(column.pin);
    expect(syncRoom(synced, settings)).toEqual(synced);
  });

  it('anchor 5: follows a landing moved from 60 to 70', () => {
    const synced = syncRoom(stored, settings);
    synced.walls[1].landings.start.offset = 70;
    const moved = syncRoom(synced, settings);
    expect(runScene(moved, moved.walls[0], moved.walls[0].runs[0], settings).result.pieces[1])
      .toMatchObject({ id: 'B', x: 45.125, width: 24.875 });
  });

  it('anchor 6: keeps the pin and warns when its wall, run, landing, anchor or face disappears', () => {
    const synced = syncRoom(stored, settings);
    for (const missing of ['wall', 'run', 'landing', 'anchor', 'face']) {
      const changed = structuredClone(synced);
      if (missing === 'wall') changed.walls.pop();
      if (missing === 'run') changed.walls[1].runs = [];
      if (missing === 'landing') changed.walls[1].landings.start = null;
      if (missing === 'anchor') changed.walls[1].runs[0].anchors.left = false;
      if (missing === 'face') changed.walls[0].runs[0].wallSide = 'back';
      const next = syncRoom(changed, settings);
      const currentRun = next.walls[0].runs[0];
      expect(currentRun._returnPins).not.toHaveProperty('B');
      expect(pinTargetsForRun(currentRun, next.walls[0], 120, settings)).toEqual({});
      expect(runItems(currentRun)[1].pin).toEqual(column.pin);
      expect(roomDiagnostics(next, settings).T.warnings).toContainEqual({
        code: 'pin-unresolved', pieceId: 'B', message: 'The return this column follows is gone.',
      });
    }
  });

  it('anchor 7: ignores stored return targets and recomputes them before solving', () => {
    stored.walls[0].runs[0]._returnPins = { B: { target: 999, width: 999 }, garbage: null };
    const synced = syncRoom(stored, settings);
    const currentRun = synced.walls[0].runs[0];
    expect(currentRun._returnPins).toEqual({ B: { target: 35.125, width: 24.875 } });
    const deeper = structuredClone(synced);
    deeper.walls[1].runs[0].depth = 30;
    const next = syncRoom(deeper, settings);
    expect(next.walls[0].runs[0]._returnPins).toEqual({ B: { target: 29.125, width: 30.875 } });
    expect(stored.walls[0].runs[0]._returnPins.B.target).toBe(999);
  });

  it('moves single edges outward and centers rightward, retaining typed widths', () => {
    column.size = 30;
    column.sizeMode = 'manual';
    for (const [edge, value, x] of [
      ['left', 1.5, 33.625], ['right', 1.5, 31.5], ['center', 1.5, 34.0625],
      ['left', -1.5, 36.625], ['right', -1.5, 28.5],
    ]) {
      column.pin = { ...column.pin, edge, anchor: edge, value };
      delete column.pin.valueRight;
      const synced = syncRoom(stored, settings);
      expect(runScene(synced, synced.walls[0], synced.walls[0].runs[0], settings).result.pieces[1])
        .toMatchObject({ id: 'B', x, width: 30 });
    }
  });

  it('locks both-edge width ahead of typed and retained widths for growth and clamping', () => {
    const source = stored.walls[0].runs[0];
    column.size = 80;
    column.sizeMode = 'manual';
    source._pinWidths = { B: 100 };
    const synced = syncRoom(stored, settings);
    const currentRun = synced.walls[0].runs[0];
    const targets = pinTargetsForRun(currentRun, synced.walls[0], 120, settings);
    expect(splitRun(currentRun, settings, { pinTargets: targets, pinWidths: { B: 110 } }).pieces[1])
      .toMatchObject({ id: 'B', x: 35.125, width: 24.875 });
    const shortened = { ...currentRun, width: 60 };
    const grown = resolvePinnedSpan(shortened, synced.walls[0], 120, settings, targets);
    expect(grown.width).toBe(69);
    expect(grown._pinWidths.B).toBe(24.875);
    const clamped = splitRun({ ...shortened, anchors: { left: true, right: true } }, settings, { pinTargets: targets });
    expect(clamped.pieces[1]).toMatchObject({ id: 'B', x: 26.125, width: 24.875 });
    expect(clamped.warnings).toContainEqual(expect.objectContaining({ code: 'pin-unreachable', pieceId: 'B' }));
  });
});
