import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun } from '../faceLayouts.js';
import { gridFromItems } from '../grid.js';
import { resolveWall } from '../room.js';
import { teeFillers } from '../tees.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });
const cab = (id, width = null, extra = {}) => ({ id, kind: 'cabinet', width, ...extra });

function roomWith(run, style) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
  };
  return {
    id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    ...(style ? { style } : {}),
  };
}

const baseRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 36, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
  tFiller: 'seams',
  grid: gridFromItems('r', [cab('a', 18), cab('b', 18)]),
  ...overrides,
});

function teesOf(run, style) {
  const room = roomWith(run, style);
  const wall = resolveWall(room, room.walls[0]);
  const layout = layoutRun(room, wall, run, S);
  return teeFillers(room, run, cellPieces(run, layout), S);
}

/** Two columns, each split into stacked cells: sizes are the top cell's height (null = the rest). */
function stackedRun(left, right, overrides = {}) {
  const column = (id, top, extra) => ({
    id,
    cols: [{ id: `${id}:c`, size: null, sizeMode: 'auto' }],
    rows: [
      { id: `${id}:t`, size: top, sizeMode: top === null ? 'auto' : 'manual' },
      { id: `${id}:u`, size: null, sizeMode: 'auto' },
    ],
    cells: [cell(0, 0, cab(`${id}1`, null, extra)), cell(0, 1, cab(`${id}2`))],
  });
  return baseRun({
    z: 0, height: 60,
    grid: {
      id: 'r:grid',
      cols: [{ id: 'a:col', size: 18, sizeMode: 'manual' }, { id: 'b:col', size: 18, sizeMode: 'manual' }],
      rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }],
      cells: [cell(0, 0, column('a', left)), cell(1, 0, column('b', right))],
    },
    ...overrides,
  });
}

describe('SPEC-37 T-fillers at seams', () => {
  it('covers a tight seam with a 1 1/2" flat, the return centred', () => {
    const { tees, covers } = teesOf(baseRun());
    expect(tees).toEqual([{
      id: 'tee:a|b', orientation: 'vertical', end: null, pieceId: null,
      x: 41.25, z: 4, width: 1.5, height: 30.5, drop: 0, boxIds: ['a', 'b'],
      ret: { start: 41.625, end: 42.375 },
    }]);
    expect(covers.get('a')).toEqual({ left: 0, right: 0.75, top: 0, bottom: 0 });
    expect(covers.get('b')).toEqual({ left: 0.75, right: 0, top: 0, bottom: 0 });
  });

  it('widens the flat by the gap between spaced boxes', () => {
    const { tees } = teesOf(baseRun({ seamGap: 0.5, _seamGap: 0.5 }));
    expect(tees).toHaveLength(1);
    expect(tees[0]).toMatchObject({ x: 41.25, width: 2, ret: { start: 41.875, end: 42.625 } });
  });

  it('needs the run setting or a cabinet\'s own side, and only on Euro', () => {
    expect(teesOf(baseRun({ tFiller: undefined })).tees).toEqual([]);
    const own = baseRun({
      tFiller: undefined,
      grid: gridFromItems('r', [cab('a', 18, { tFiller: { right: true } }), cab('b', 18)]),
    });
    expect(teesOf(own).tees.map((tee) => tee.id)).toEqual(['tee:a|b']);
    const off = baseRun({
      grid: gridFromItems('r', [cab('a', 18), cab('b', 18, { tFiller: { left: false } })]),
    });
    expect(teesOf(off).tees).toEqual([]);
    const first = baseRun({
      grid: gridFromItems('r', [cab('a', 18, { tFiller: { right: true } }), cab('b', 18, { tFiller: { left: false } })]),
    });
    expect(teesOf(first).tees).toHaveLength(1);
    expect(teesOf(baseRun(), { cabinetStyleId: 14 }).tees).toEqual([]);
    expect(teesOf(baseRun({ style: { cabinetStyleId: 15 } })).tees).toEqual([]);
  });

  it('runs the full length of a seam where the splits line up', () => {
    const { tees, covers } = teesOf(stackedRun(30, 30));
    expect(tees).toEqual([{
      id: 'tee:a2|b2', orientation: 'vertical', end: null, pieceId: null,
      x: 41.25, z: 0, width: 1.5, height: 60, drop: 0, boxIds: ['a2', 'b2', 'a1', 'b1'],
      ret: { start: 41.625, end: 42.375 },
    }]);
    expect(covers.get('a1').right).toBe(0.75);
    expect(covers.get('b2').left).toBe(0.75);
  });

  it('is one T for the whole seam where the splits don\'t line up', () => {
    // Two tall columns of different-height cabinets still have one T between them.
    const { tees, covers } = teesOf(stackedRun(30, 20));
    expect(tees.map((tee) => [tee.id, tee.z, tee.height])).toEqual([['tee:a2|b2', 0, 60]]);
    expect([...tees[0].boxIds].sort()).toEqual(['a1', 'a2', 'b1', 'b2']);
    expect(covers.get('a1').right).toBe(0.75);
    expect(covers.get('b1').left).toBe(0.75);
  });

  it('drops with the run on an upper whose doors overhang', () => {
    const upper = baseRun({ cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30, depth: 12 });
    expect(teesOf(upper).tees[0]).toMatchObject({ z: 53.875, height: 30.125, drop: 0.125 });
  });
});

describe('SPEC-37 T-fillers at run ends', () => {
  const endRun = (overrides = {}) => baseRun({
    width: 42,
    ends: { left: { type: 'filler', width: 3 }, right: { type: 'filler', width: 3 } },
    ...overrides,
  });

  it('stands in for a filler: its visible width plus the cover, the return off-centre', () => {
    const { tees, covers } = teesOf(endRun());
    expect(tees.map((tee) => [tee.id, tee.end, tee.x, tee.width, tee.ret])).toEqual([
      ['r:left', 'left', 24, 3.75, { start: 26.25, end: 27 }],
      ['tee:a|b', null, 44.25, 1.5, { start: 44.625, end: 45.375 }],
      ['r:right', 'right', 62.25, 3.75, { start: 63, end: 63.75 }],
    ]);
    expect(tees[0]).toMatchObject({ pieceId: 'r:left', z: 4, height: 30.5, boxIds: ['a'] });
    expect(covers.get('a')).toEqual({ left: 0.75, right: 0.75, top: 0, bottom: 0 });
    expect(covers.get('b')).toEqual({ left: 0.75, right: 0.75, top: 0, bottom: 0 });
  });

  it('takes its own choice over the run setting, and skips blind ends and other end types', () => {
    const only = endRun({ tFiller: undefined, endFiller: { left: { tFiller: true }, right: null } });
    expect(teesOf(only).tees.map((tee) => tee.id)).toEqual(['r:left']);
    const off = endRun({ endFiller: { left: { tFiller: false }, right: null } });
    expect(teesOf(off).tees.map((tee) => tee.id)).toEqual(['tee:a|b', 'r:right']);
    const panel = endRun({ ends: { left: { type: 'end_panel', width: null }, right: NONE }, width: 36.75 });
    expect(teesOf(panel).tees.map((tee) => tee.id)).toEqual(['tee:a|b']);
  });

  it('covers every box along the filler when a column is split', () => {
    const run = stackedRun(30, 30, {
      width: 39,
      ends: { left: { type: 'filler', width: 3 }, right: NONE },
      grid: {
        id: 'r:grid',
        cols: [{ id: 'a:col', size: 18, sizeMode: 'manual' }, { id: 'b:col', size: 18, sizeMode: 'manual' }],
        rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }],
        cells: [
          cell(0, 0, {
            id: 'a',
            cols: [{ id: 'a:c', size: null, sizeMode: 'auto' }],
            rows: [{ id: 'a:t', size: 30, sizeMode: 'manual' }, { id: 'a:u', size: null, sizeMode: 'auto' }],
            cells: [cell(0, 0, cab('a1')), cell(0, 1, cab('a2'))],
          }),
          cell(1, 0, cab('b')),
        ],
      },
    });
    const { tees } = teesOf(run);
    const left = tees.find((tee) => tee.end === 'left');
    expect(left).toMatchObject({ z: 0, height: 60 });
    expect(left.boxIds.sort()).toEqual(['a1', 'a2']);
  });
});
