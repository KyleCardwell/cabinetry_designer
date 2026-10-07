import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun } from '../faceLayouts.js';
import { gridFromItems } from '../grid.js';
import { resolveWall } from '../room.js';
import { teeFillers, teeSides } from '../tees.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };
const cab = (id, width = null, extra = {}) => ({ id, kind: 'cabinet', width, ...extra });
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });

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

function contextOf(run, style) {
  const room = roomWith(run, style);
  const wall = resolveWall(room, room.walls[0]);
  const cells = cellPieces(run, layoutRun(room, wall, run, S));
  return { room, cells };
}

const sidesOf = (run, id, style) => {
  const { room, cells } = contextOf(run, style);
  return teeSides(room, run, cells, S, id);
};

describe('SPEC-37 what a box has on each side', () => {
  it('names the neighbour, the box\'s own choice and whether a T is there', () => {
    expect(sidesOf(baseRun(), 'a')).toEqual({
      left: { neighbor: null, own: null, on: false },
      right: { neighbor: 'b', own: null, on: true },
      top: { neighbor: null, own: null, on: false },
      bottom: { neighbor: null, own: null, on: false },
    });
    const off = baseRun({ grid: gridFromItems('r', [cab('a', 18, { tFiller: { right: false } }), cab('b', 18)]) });
    expect(sidesOf(off, 'a').right).toEqual({ neighbor: 'b', own: false, on: false });
    expect(sidesOf(off, 'b').left).toEqual({ neighbor: 'a', own: null, on: false });
    expect(sidesOf(baseRun({ tFiller: undefined }), 'a').right).toEqual({ neighbor: 'b', own: null, on: false });
  });

  it('finds the box above and below in a stack, and the widest neighbour beside a split', () => {
    const column = (id, top) => ({
      id,
      cols: [{ id: `${id}:c`, size: null, sizeMode: 'auto' }],
      rows: [{ id: `${id}:t`, size: top, sizeMode: top === null ? 'auto' : 'manual' }, { id: `${id}:u`, size: null, sizeMode: 'auto' }],
      cells: [cell(0, 0, cab(`${id}1`)), cell(0, 1, cab(`${id}2`))],
    });
    const run = baseRun({
      z: 0, height: 60, tFiller: 'all',
      grid: {
        id: 'r:grid',
        cols: [{ id: 'a:col', size: 18, sizeMode: 'manual' }, { id: 'b:col', size: 18, sizeMode: 'manual' }],
        rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }],
        cells: [cell(0, 0, column('a', 30)), cell(1, 0, column('b', 20))],
      },
    });
    expect(sidesOf(run, 'a1')).toEqual({
      left: { neighbor: null, own: null, on: false },
      right: { neighbor: 'b1', own: null, on: true },
      top: { neighbor: null, own: null, on: false },
      bottom: { neighbor: 'a2', own: null, on: true },
    });
    expect(sidesOf(run, 'b2').top).toEqual({ neighbor: 'b1', own: null, on: true });
  });

  it('is null for a face frame cabinet, a missing id and anything that isn\'t a cabinet', () => {
    expect(sidesOf(baseRun(), 'a', { cabinetStyleId: 14 })).toBeNull();
    expect(sidesOf(baseRun(), 'zz')).toBeNull();
    const withFiller = baseRun({
      width: 39, ends: { left: { type: 'filler', width: 3 }, right: NONE },
    });
    expect(sidesOf(withFiller, 'r:left')).toBeNull();
  });
});

describe('SPEC-37 shop notes where a T drops or sits on a part', () => {
  const below = (doors) => baseRun({ bottom: [{ id: 'rail', kind: 'light_rail', height: 1.5, doors }] });
  const notesOf = (run) => {
    const { room, cells } = contextOf(run);
    const { tees, notes } = teeFillers(room, run, cells, S);
    return { tee: tees[0], notes: notes.get(tees[0].id) };
  };

  it('notes where the return is held up, or a chip detail on a flush part', () => {
    const covered = notesOf(below('cover'));
    expect(covered.notes).toEqual(['T-shape', 'return up 1 5/8"']);
    expect(covered.tee).toMatchObject({ z: 2.375, height: 32.125, drop: 1.625 });
    expect(notesOf(below('flush')).notes).toEqual(['T-shape', 'chip detail bottom 1/8"']);
    expect(notesOf(baseRun()).notes).toEqual(['T-shape']);
  });
});
