import { describe, expect, it } from 'vitest';
import { cellPieces, gapReach, stackedSides } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { gridFromItems, replaceRootItems, rootItems, updateRootItem } from '../grid.js';
import { syncRoom } from '../room.js';
import { runWidthRange, splitRun } from '../splitRun.js';
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
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });
const nestedRun = (node, overrides = {}) => makeRun({
  width: 36.5, z: 0, height: 60,
  grid: {
    id: 'r:grid', cols: [{ id: `${node.id}:col`, size: null, sizeMode: 'auto' }],
    rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }], cells: [cell(0, 0, node)],
  },
  ...overrides,
});

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

describe('SPEC-36 root gaps', () => {
  const at = (layout) => layout.pieces.map(({ id, x, width }) => [id, x, width]);

  it('leaves the seam gap between cabinet columns and a column gap where set', () => {
    const run = withItems([cab('a'), cab('b'), { id: 'f', kind: 'filler', width: 3 }, cab('d')], { _seamGap: 0.5 });
    expect(at(splitRun(run, S))).toEqual([['a', 0, 19], ['b', 19.5, 19], ['f', 38.5, 3], ['d', 41.5, 19]]);
    expect(runWidthRange(run, S).min).toBe(30.5);

    const own = withItems([cab('a', null, { gap: 1 }), cab('b')], { width: 37, _seamGap: 0.5 });
    expect(at(splitRun(own, S))).toEqual([['a', 0, 18], ['b', 19, 18]]);
    const none = withItems([cab('a', null, { gap: 0 }), cab('b')], { width: 37, _seamGap: 0.5 });
    expect(at(splitRun(none, S))).toEqual([['a', 0, 18.5], ['b', 18.5, 18.5]]);
  });

  it('keeps the gaps either side of a pinned cabinet', () => {
    const pin = { anchor: 'left', from: 'left', openingId: null, openingAnchor: 'center', value: 25 };
    const run = withItems([cab('a'), cab('b', 20, { pin }), cab('c')], { width: 60, _seamGap: 0.5 });
    expect(at(splitRun(run, S, { pinTargets: { b: 25 } })))
      .toEqual([['a', 0, 24.5], ['b', 25, 20], ['c', 45.5, 14.5]]);
  });
});

describe('SPEC-36 nested gaps', () => {
  const SIDE_BY_SIDE = {
    id: 'n',
    cols: [{ id: 'n:a', size: null, sizeMode: 'auto' }, { id: 'n:b', size: null, sizeMode: 'auto' }],
    rows: [{ id: 'n:r', size: null, sizeMode: 'auto' }],
    cells: [cell(0, 0, { id: 'x', kind: 'cabinet' }), cell(1, 0, { id: 'y', kind: 'cabinet' })],
  };

  it('leaves the seam gap between side-by-side cabinet cells', () => {
    const run = nestedRun(SIDE_BY_SIDE, { _seamGap: 0.5 });
    const cells = cellPieces(run, splitRun(run, S));
    expect(cells.pieces.map(({ id, x, width }) => [id, x, width])).toEqual([['x', 0, 18], ['y', 18.5, 18]]);
    expect(cells.gaps).toEqual([{ x: 18, z: 0, width: 0.5, height: 60 }]);
    expect(cells.grids[0].tracks.map(({ start, end }) => [start, end])).toEqual([[0, 18], [18.5, 36.5]]);

    const panel = { ...SIDE_BY_SIDE, cells: [SIDE_BY_SIDE.cells[0], cell(1, 0, { id: 'y', kind: 'panel' })] };
    const panelRun = nestedRun(panel, { _seamGap: 0.5 });
    expect(cellPieces(panelRun, splitRun(panelRun, S)).gaps).toEqual([]);
  });

  it('stacks across a row gap and reports gaps between top-level pieces', () => {
    const stack = {
      id: 'm',
      cols: [{ id: 'm:c', size: null, sizeMode: 'auto' }],
      rows: [{ id: 'm:t', size: null, sizeMode: 'auto', gap: 1 }, { id: 'm:b', size: 30, sizeMode: 'manual' }],
      cells: [cell(0, 0, { id: 't', kind: 'cabinet' }), cell(0, 1, { id: 'b', kind: 'cabinet' })],
    };
    const run = nestedRun(stack, { width: 20 });
    const cells = cellPieces(run, splitRun(run, S));
    expect(cells.pieces.map(({ id, z, height }) => [id, z, height])).toEqual([['b', 0, 30], ['t', 31, 29]]);
    expect(cells.gaps).toEqual([{ x: 0, z: 30, width: 20, height: 1 }]);
    expect(stackedSides(cells.pieces, 'b')).toEqual({ top: false, bottom: false });
    expect(stackedSides(cells.pieces, 'b', gapReach(cells.gaps))).toEqual({ top: true, bottom: false });

    const root = withItems([cab('a'), cab('b')], { width: 36.5, _seamGap: 0.5 });
    expect(cellPieces(root, splitRun(root, S)).gaps).toEqual([{ x: 18, z: 4, width: 0.5, height: 30.5 }]);
  });
});
