import { describe, expect, it } from 'vitest';
import { attach, auto, fixed, line, room, run, wall } from '../../../test/builders.js';
import { cellWidthsBlocker, isWidthFromCells } from '../cellWidths.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun } from '../faceLayouts.js';
import { syncRoom } from '../room.js';
import { isRoom } from '../../store/documentValidation.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const none = { type: 'none', width: null };
const joint = (jointId, offset = 0) => ({ to: 'joint', jointId, offset });

function r1(overrides = {}) {
  return run({
    width: 80, autoCount: false, anchors: { left: true, right: false },
    ends: { left: { type: 'filler', width: null }, right: { type: 'end_panel', width: 0.75 } },
    items: [fixed('A', 30), fixed('B', 24)], widthFrom: 'cells',
    ...overrides,
  });
}

function sync(runs, wallOverrides = {}, options = settings) {
  return syncRoom(room({ walls: [wall({ x2: 120, runs, ...wallOverrides })] }), options);
}

function pieces(synced, runId = 'run-1') {
  const [currentWall] = synced.walls;
  const currentRun = currentWall.runs.find(({ id }) => id === runId);
  return layoutRun(synced, currentWall, currentRun, settings);
}

const span = (synced, runId = 'run-1') => {
  const { x, width } = synced.walls[0].runs.find(({ id }) => id === runId);
  return { x, width };
};

describe('width from cabinets in sync (LL6)', () => {
  it('a left-held run takes its contents width', () => {
    const synced = sync([r1()]);
    expect(span(synced)).toEqual({ x: 0, width: 56.25 });
    const layout = pieces(synced);
    expect(layout.pieces).toMatchObject([
      { role: 'end-left', x: 0, width: 1.5 }, { id: 'A', x: 1.5, width: 30 },
      { id: 'B', x: 31.5, width: 24 }, { role: 'end-right', x: 55.5, width: 0.75 },
    ]);
    expect(layout.errors).toEqual([]);
  });

  it('without the flag nothing changes', () => {
    const plain = r1();
    delete plain.widthFrom;
    expect(span(sync([plain]))).toEqual({ x: 0, width: 80 });
  });

  it('a right-held run keeps its right edge', () => {
    const synced = sync([r1({
      x: 40, anchors: { left: false, right: true },
      ends: { left: { type: 'end_panel', width: 0.75 }, right: { type: 'filler', width: null } },
    })]);
    expect(span(synced)).toEqual({ x: 63.75, width: 56.25 });
  });

  it('both ends free keeps x', () => {
    const synced = sync([r1({ x: 10, anchors: { left: false, right: false }, ends: { left: none, right: none } })]);
    expect(span(synced)).toEqual({ x: 10, width: 54 });
  });

  it('both ends held is blocked', () => {
    const both = r1({ anchors: { left: true, right: true } });
    expect(cellWidthsBlocker(both, wall())).toBe('no-free-end');
    expect(span(sync([both])).width).toBe(120);
  });

  it('an auto cabinet blocks it', () => {
    const withAuto = r1({ items: [fixed('A', 30), auto('B')] });
    expect(cellWidthsBlocker(withAuto, wall())).toBe('auto-item');
    const synced = sync([withAuto]);
    expect(span(synced).width).toBe(80);
    expect(pieces(synced).pieces).toMatchObject([
      { role: 'end-left', width: 1.75 }, { id: 'A', width: 30 }, { id: 'B', width: 47.5 }, { role: 'end-right' },
    ]);
  });

  it('a free run on a line keeps its contents width and slides onto the line', () => {
    const synced = sync([r1({
      x: 10, anchors: { left: false, right: false }, ends: { left: none, right: none }, attach: attach('L1'),
    })], { lines: [line('L1', 60)] });
    expect(span(synced)).toEqual({ x: 33, width: 54 });
  });

  it('a line plus a held end blocks it', () => {
    const lined = r1({ attach: attach('L1', 'left') });
    expect(cellWidthsBlocker(lined, wall({ lines: [line('L1', 20)] }))).toBe('line-sized');
  });

  it('a column on a line blocks it', () => {
    const placed = r1({ items: [{ ...fixed('A', 30), attach: attach('L1') }, fixed('B', 24)] });
    expect(cellWidthsBlocker(placed, wall({ lines: [line('L1', 20)] }))).toBe('placed-column');
    expect(isWidthFromCells(placed, wall({ lines: [line('L1', 20)] }))).toBe(false);
  });

  it('run flex does not move it', () => {
    expect(span(sync([r1()], {}, { ...settings, runFlex: 0.25 }))).toEqual({ x: 0, width: 56.25 });
  });

  it('syncing twice equals once', () => {
    const once = sync([r1()]);
    expect(syncRoom(once, settings)).toEqual(once);
  });

  it('a run joined on its left grows from the joint; the joint stays', () => {
    const synced = sync([
      run({ id: 'L', width: 40, autoCount: false, anchors: { left: true, right: joint('J1') },
        ends: { left: none, right: none }, items: [auto('X')] }),
      r1({ id: 'R', x: 40, anchors: { left: joint('J1'), right: false }, ends: { left: none, right: none } }),
    ], { joints: [{ id: 'J1', x: 40 }] });
    expect(span(synced, 'R')).toEqual({ x: 40, width: 54 });
    expect(span(synced, 'L')).toEqual({ x: 0, width: 40 });
    expect(synced.walls[0].joints[0].x).toBe(40);
  });

  it('validation accepts only cells', () => {
    const good = sync([r1()]);
    expect(isRoom(good)).toBe(true);
    const bad = structuredClone(good);
    bad.walls[0].runs[0].widthFrom = 'run';
    expect(isRoom(bad)).toBe(false);
  });
});
