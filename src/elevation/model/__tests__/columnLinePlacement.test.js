import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { attach, auto, fixed, line, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun } from '../faceLayouts.js';
import { splitOptionsForRun } from '../placement.js';
import { resolveWall, syncRoom } from '../room.js';
import { pinTargetsForRun, resolvePinnedSpan } from '../runPins.js';
import { runFlexNeeds, splitRun } from '../splitRun.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
let r;
let w;
let stored;

beforeEach(() => {
  r = run({
    width: 100, autoCount: false, anchors: { left: true, right: true },
    ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
    items: [auto('A'), { ...fixed('B', 30), attach: attach('line-1', 'left') }, auto('C')],
  });
  w = wall({ x2: 100, lines: [line('line-1', 65, { label: 'L1' })], runs: [r] });
  stored = room({ walls: [w] });
});

describe('LL4 d layout lines win for columns', () => {
  it('anchor 1: places B at 65 and gives C the remaining five inches', () => {
    const opts = splitOptionsForRun(stored, w, r, settings);
    expect(opts.lineLabels).toEqual({ B: 'L1' });
    const result = splitRun(r, settings, opts);
    expect(result.pieces).toMatchObject([
      { id: 'A', x: 0, width: 65 },
      { id: 'B', x: 65, width: 30 },
      { id: 'C', x: 95, width: 5 },
    ]);
    expect(result.warnings).toContainEqual({
      code: 'line-squeeze', pieceId: 'B',
      message: 'Cabinets beside it are below minimum width because of line L1.',
    });
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'narrow-cabinet', pieceId: 'C' }));
    expect(result.warnings.some(({ code }) => code === 'pin-unreachable')).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('anchor 4: keeps the drawn right span when an auto cabinet or void follows B', () => {
    r.anchors.right = false;
    r.grid.cols[1].attach.at = 'right';
    w.lines[0].value = 60;
    for (const kind of ['cabinet', 'void']) {
      r.grid.cells[2].node.kind = kind;
      const synced = syncRoom(stored, settings);
      const currentWall = synced.walls[0];
      const currentRun = currentWall.runs[0];
      expect(currentRun.width).toBe(100);
      expect(layoutRun(synced, currentWall, currentRun, settings).pieces.find(({ id }) => id === 'B'))
        .toMatchObject({ x: 30, width: 30 });
      expect(syncRoom(synced, settings)).toEqual(synced);
    }
  });

  it('anchor 5: shrinks the right free end exactly, including a typed outer column', () => {
    for (const trailing of [[], [fixed('C', 12)]]) {
      const source = run({
        ...r, anchors: { left: true, right: false },
        items: [auto('A'), { ...fixed('B', 30), gap: 2, attach: attach('line-1', 'right') }, ...trailing],
      });
      w.runs = [source];
      w.lines[0].value = 60;
      const synced = syncRoom(stored, settings);
      const currentRun = synced.walls[0].runs[0];
      expect(currentRun).toMatchObject({ x: 0, width: trailing.length ? 74 : 60 });
      const result = layoutRun(synced, synced.walls[0], currentRun, settings);
      expect(result.pieces.find(({ id }) => id === 'B')).toMatchObject({ x: 30, width: 30 });
      expect(result.errors).toEqual([]);
      expect(syncRoom(synced, settings)).toEqual(synced);
    }
  });

  it('resizes the left free end exactly for a split column, but preserves an outer auto void', () => {
    for (const leading of [[], [{ ...auto('A'), kind: 'void' }]]) {
      const source = run({
        ...r, anchors: { left: false, right: true },
        items: [...leading, {
          ...fixed('B', 30), attach: attach('line-1', 'center', 5),
          grid: { ...run({ id: 'nested', items: [auto('nested-A'), auto('nested-B')] }).grid, id: 'B' },
        }, auto('C')],
      });
      w.runs = [source];
      w.lines[0].value = 40;
      const synced = syncRoom(stored, settings);
      const currentRun = synced.walls[0].runs[0];
      expect(currentRun).toMatchObject(leading.length ? { x: 0, width: 100 } : { x: 30, width: 70 });
      expect(layoutRun(synced, synced.walls[0], currentRun, settings).pieces.find(({ id }) => id === 'B'))
        .toMatchObject({ x: 30, width: 30 });
      expect(syncRoom(synced, settings)).toEqual(synced);
    }
  });

  it('keeps outer and crossed middle segments nonnegative while columns stay on their lines', () => {
    for (const value of [-40, 130]) {
      w.lines[0].value = value;
      const result = splitRun(r, settings, splitOptionsForRun(stored, w, r, settings));
      expect(result.pieces.find(({ id }) => id === 'B')).toMatchObject({ x: value, width: 30 });
      expect(result.pieces.find(({ id }) => id === (value < 0 ? 'A' : 'C')).width).toBe(0);
      expect(result.pieces.every(({ width }) => width >= 0)).toBe(true);
      expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'line-squeeze', pieceId: 'B' }));
    }
    const source = run({
      ...r, items: [auto('A'), { ...fixed('B', 30), attach: attach('line-1', 'left') },
        auto('C'), { ...fixed('D', 30), attach: attach('line-2', 'left') }, auto('E')],
    });
    w.runs = [source];
    w.lines = [line('line-1', 70, { label: 'L1' }), line('line-2', 60, { label: 'L2' })];
    const result = splitRun(source, settings, splitOptionsForRun(stored, w, source, settings));
    expect(result.pieces).toMatchObject([
      { id: 'A', width: 70 }, { id: 'B', x: 70, width: 30 }, { id: 'C', width: 0 },
      { id: 'D', x: 60, width: 30 }, { id: 'E', width: 10 },
    ]);
    expect(result.warnings.filter(({ code }) => code === 'line-squeeze').map(({ pieceId }) => pieceId))
      .toEqual(['B', 'D']);
    expect(runFlexNeeds(source, settings, splitOptionsForRun(stored, w, source, settings)).map(({ key }) => key))
      .toEqual(['left', 'right']);
  });

  it('anchor 6: Room 9b still clamps an unreachable return pin', () => {
    const source = JSON.parse(readFileSync(new URL('./fixtures/room9b.json', import.meta.url), 'utf8'));
    const sourceWall = source.walls.find((w) => w.runs.some((r) => r.grid.cols.some((col) => col.pin?.from === 'return')));
    const sourceRun = sourceWall.runs.find((r) => r.grid.cols.some((col) => col.pin?.from === 'return'));
    sourceRun.grid.cols.find((col) => col.pin?.from === 'return').pin.value = 1000;
    const currentSettings = { ...DEFAULT_SETTINGS, ...source.settingsOverrides };
    const synced = syncRoom(source, currentSettings);
    const currentWall = resolveWall(synced, synced.walls.find(({ id }) => id === sourceWall.id), 'front');
    const currentRun = currentWall.runs.find(({ id }) => id === sourceRun.id);
    const result = layoutRun(synced, currentWall, currentRun, currentSettings);
    const pieceId = 'a897bd8e-9e38-434d-8196-24bfe01189b6';
    expect(result.pieces.find(({ id }) => id === pieceId)).toMatchObject({ x: 18.75, width: 30.875 });
    expect(result.warnings).toContainEqual({
      code: 'pin-unreachable', pieceId,
      message: 'Pin requested -936.375 inches but was clamped to 18.75 inches.',
    });
    expect(result.warnings.some(({ code }) => code === 'line-squeeze')).toBe(false);
    expect(resolvePinnedSpan(currentRun, currentWall, currentWall.length, currentSettings,
      pinTargetsForRun(currentRun, currentWall, currentWall.length))).toMatchObject({
      x: currentRun.x, width: currentRun.width,
    });
  });
});
