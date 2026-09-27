import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { gridFromItems, replaceRootItems, rootItems, updateRootItem } from '../grid.js';
import { syncRoom } from '../room.js';
import { runSeamGap } from '../styles.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };
const cab = (id, width = null, extra = {}) => ({ id, kind: 'cabinet', width, ...extra });
const makeRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 60.5, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
  ...overrides,
});
const withItems = (items, overrides = {}) => makeRun({ grid: gridFromItems('r', items), ...overrides });

function roomWith(run, style) {
  return {
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['w'],
    ...(style ? { style } : {}),
    walls: [{
      id: 'w', name: '', numberOverride: null, elevationForced: false,
      x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5, flipped: false,
      connections: { start: null, end: null }, profile: {}, openings: [], joints: [], runs: [run],
      endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits: [],
    }],
  };
}

describe('SPEC-36 gap shape', () => {
  it('carries a column gap between the grid and its items', () => {
    const grid = gridFromItems('r', [
      cab('a', null, { gap: 0.5 }),
      { id: 'p', kind: 'panel', width: 0.75, gap: 1 },
      cab('b'),
    ]);
    expect(grid.cols.map((col) => col.gap)).toEqual([0.5, 1, undefined]);
    expect(grid.cells.map((cell) => 'gap' in cell.node)).toEqual([false, false, false]);
    expect(rootItems(grid).map((item) => item.gap)).toEqual([0.5, 1, undefined]);
    expect(replaceRootItems(grid, rootItems(grid))).toEqual(grid);
    expect(updateRootItem(grid, 'a', { gap: undefined }).cols[0])
      .toEqual({ id: 'a:col', size: null, sizeMode: 'auto' });
    expect(updateRootItem(grid, 'b', { gap: 0.25 }).cols[2].gap).toBe(0.25);
  });

  it('defaults the seam gap to twice the bead on beaded inset runs', () => {
    const run = withItems([cab('a'), cab('b')]);
    const BEADED = { cabinetStyleId: 15 };
    expect(runSeamGap(roomWith(run), run, S)).toBe(0);
    expect(runSeamGap(roomWith(run, BEADED), run, S)).toBe(0.5);
    expect(runSeamGap(roomWith(run, BEADED), { ...run, style: { beadWidth: 0.375 } }, S)).toBe(0.75);
    expect(runSeamGap(roomWith(run, BEADED), { ...run, seamGap: 0 }, S)).toBe(0);
    expect(runSeamGap(roomWith(run, { cabinetStyleId: 14 }), { ...run, seamGap: 0.25 }, S)).toBe(0.25);

    expect(syncRoom(roomWith(run, BEADED), S).walls[0].runs[0]._seamGap).toBe(0.5);
    expect('_seamGap' in syncRoom(roomWith(run), S).walls[0].runs[0]).toBe(false);
    expect('_seamGap' in syncRoom(roomWith({ ...run, _seamGap: 0.5 }), S).walls[0].runs[0]).toBe(false);
  });
});
