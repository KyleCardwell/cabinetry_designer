import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
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

describe('SPEC-37 T-fillers between stacked boxes', () => {
  const summary = (tees) => tees.map((tee) => [tee.id, tee.x, tee.z, tee.width, tee.height]);

  it('takes the run setting "all", butts into the vertical T, and leaves that T whole', () => {
    const { tees, covers } = teesOf(stackedRun(30, 30, { tFiller: 'all' }));
    expect(summary(tees)).toEqual([
      ['tee:h:a1|a2', 24, 29.25, 17.25, 1.5],
      ['tee:a2|b2', 41.25, 0, 1.5, 60],
      ['tee:h:b1|b2', 42.75, 29.25, 17.25, 1.5],
    ]);
    expect(tees[0].ret).toEqual({ start: 29.625, end: 30.375 });
    expect(tees[0].boxIds).toEqual(['a1', 'a2']);
    expect(covers.get('a1')).toEqual({ left: 0, right: 0.75, top: 0, bottom: 0.75 });
    expect(covers.get('a2')).toEqual({ left: 0, right: 0.75, top: 0.75, bottom: 0 });
  });

  it('leaves a horizontal seam alone on "seams"', () => {
    expect(summary(teesOf(stackedRun(30, 30)).tees)).toEqual([['tee:a2|b2', 41.25, 0, 1.5, 60]]);
  });

  it('takes one cabinet\'s own bottom, which butts into the vertical T', () => {
    const run = stackedRun(30, 30, {});
    run.grid.cells[0].node.cells[0].node.tFiller = { bottom: true };
    expect(summary(teesOf(run).tees)).toEqual([
      ['tee:h:a1|a2', 24, 29.25, 17.25, 1.5],
      ['tee:a2|b2', 41.25, 0, 1.5, 60],
    ]);
  });

  it('runs one flat across columns when no vertical T meets it', () => {
    const run = stackedRun(30, 30, { tFiller: undefined });
    run.grid.cells[0].node.cells[0].node.tFiller = { bottom: true };
    run.grid.cells[1].node.cells[0].node.tFiller = { bottom: true };
    const { tees, covers } = teesOf(run);
    expect(summary(tees)).toEqual([['tee:h:a1|a2', 24, 29.25, 36, 1.5]]);
    expect(tees[0].boxIds).toEqual(['a1', 'a2', 'b1', 'b2']);
    expect(covers.get('b2')).toEqual({ left: 0, right: 0, top: 0.75, bottom: 0 });
  });

  it('keeps one vertical T where the splits don\'t line up, each horizontal butting into it', () => {
    const run = stackedRun(30, 20, { tFiller: 'all' });
    const { tees } = teesOf(run);
    expect(tees.filter((tee) => tee.orientation === 'vertical').map((tee) => [tee.id, tee.z, tee.height])).toEqual([
      ['tee:a2|b2', 0, 60],
    ]);
    expect(tees.filter((tee) => tee.orientation === 'horizontal').map((tee) => [tee.id, tee.x, tee.z, tee.width])).toEqual([
      ['tee:h:a1|a2', 24, 29.25, 17.25],
      ['tee:h:b1|b2', 42.75, 39.25, 17.25],
    ]);
  });

  it('widens the flat by the gap between spaced boxes', () => {
    const run = baseRun({
      tFiller: undefined, width: 18, z: 0, height: 60,
      grid: {
        id: 'r:grid',
        cols: [{ id: 'a:col', size: null, sizeMode: 'auto' }],
        rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }],
        cells: [cell(0, 0, {
          id: 'a',
          cols: [{ id: 'a:c', size: null, sizeMode: 'auto' }],
          rows: [{ id: 'a:t', size: 30, gap: 0.5, sizeMode: 'manual' }, { id: 'a:u', size: null, sizeMode: 'auto' }],
          cells: [cell(0, 0, cab('a1', null, { tFiller: { bottom: true } })), cell(0, 1, cab('a2'))],
        })],
      },
    });
    const { tees } = teesOf(run);
    expect(summary(tees)).toEqual([['tee:h:a1|a2', 24, 28.75, 18, 2]]);
    expect(tees[0].ret).toEqual({ start: 29.375, end: 30.125 });
  });
});

describe('SPEC-37 T-fillers and the faces beside them', () => {
  function facesOf(run) {
    const room = roomWith(run);
    const wall = resolveWall(room, room.walls[0]);
    return runFaceLayouts(room, wall, run, S, layoutRun(room, wall, run, S));
  }

  it('sets the reveal at a covered edge to the cover plus the usual one (REV-005)', () => {
    const faces = facesOf(baseRun());
    const a = faces.get('a');
    expect(a.reveals.values).toMatchObject({ left: 0.0625, right: 0.8125 });
    expect(a.reveals.sources.right).toBe('rule:t-filler');
    expect(a.reveals.sources.left).toBe('style');
    expect(a.faces).toEqual([{ path: 'r', type: 'door', x: 24.0625, z: 4.125, width: 17.125, height: 30.125 }]);
    expect(faces.get('b').faces[0]).toMatchObject({ x: 42.8125, width: 17.125 });
  });

  it('gives a single door between two T-fillers 27/32 each side (REV-006)', () => {
    const run = baseRun({ width: 36, grid: gridFromItems('r', [cab('a', 12), cab('b', 12), cab('c', 12)]) });
    const b = facesOf(run).get('b');
    expect(b.reveals.values).toMatchObject({ left: 0.84375, right: 0.84375 });
    expect(b.faces[0]).toMatchObject({ x: 36.84375, width: 10.3125 });
  });

  it('gives a pair of doors between end T-fillers 13/16 each side (REV-005)', () => {
    const run = baseRun({
      width: 42, tFiller: 'seams',
      ends: { left: { type: 'filler', width: 3 }, right: { type: 'filler', width: 3 } },
      grid: gridFromItems('r', [cab('a', 36)]),
    });
    const a = facesOf(run).get('a');
    expect(a.reveals.values).toMatchObject({ left: 0.8125, right: 0.8125 });
    expect(a.faces.map((face) => [face.half, face.x, face.width])).toEqual([
      ['left', 27.8125, 17.125], ['right', 45.0625, 17.125],
    ]);
  });

  it('puts 13/16 between stacked boxes either side of a horizontal T', () => {
    const faces = facesOf(stackedRun(30, 30, { tFiller: 'all' }));
    expect(faces.get('a1').reveals.values.bottom).toBe(0.8125);
    expect(faces.get('a2').reveals.values.top).toBe(0.8125);
    expect(faces.get('a1').reveals.sources.bottom).toBe('rule:t-filler');
  });

  it('leaves a manual reveal in charge, and runs without T-fillers alone', () => {
    const run = baseRun({
      grid: gridFromItems('r', [cab('a', 18, { reveals: { right: 0.5 } }), cab('b', 18)]),
    });
    expect(facesOf(run).get('a').reveals.values.right).toBe(0.5);
    const plain = facesOf(baseRun({ tFiller: undefined })).get('a');
    expect(plain.reveals.values).toMatchObject({ left: 0.0625, right: 0.0625 });
  });
});
