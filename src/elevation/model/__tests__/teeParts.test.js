import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun } from '../faceLayouts.js';
import { gridFromItems } from '../grid.js';
import { partNumbers, wallBadgeGroups } from '../partNumbers.js';
import { resolveWall } from '../room.js';
import { rabbetNote, teeFillers } from '../tees.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };
const cab = (id, width = null, extra = {}) => ({ id, kind: 'cabinet', width, ...extra });
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });

function roomWith(run) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
    joints: [], endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits: [],
  };
  return { id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'] };
}

const baseRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 36, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
  tFiller: 'seams',
  grid: gridFromItems('r', [cab('a', 18), cab('b', 18)]),
  ...overrides,
});

const endRun = (overrides = {}) => baseRun({
  width: 42,
  ends: { left: { type: 'filler', width: 3 }, right: { type: 'filler', width: 3 } },
  ...overrides,
});

const STACKED = baseRun({
  z: 0, height: 60, width: 18,
  grid: {
    id: 'r:grid',
    cols: [{ id: 'a:col', size: null, sizeMode: 'auto' }],
    rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }],
    cells: [cell(0, 0, {
      id: 'a',
      cols: [{ id: 'a:c', size: null, sizeMode: 'auto' }],
      rows: [{ id: 'a:t', size: 30, sizeMode: 'manual' }, { id: 'a:u', size: null, sizeMode: 'auto' }],
      cells: [cell(0, 0, cab('a1', null, { tFiller: { bottom: true } })), cell(0, 1, cab('a2'))],
    })],
  },
});

function context(run) {
  const room = roomWith(run);
  const wall = resolveWall(room, room.walls[0]);
  const layout = layoutRun(room, wall, run, S);
  return { room, wall, result: teeFillers(room, run, cellPieces(run, layout), S) };
}

describe('SPEC-37 rabbet notes (FILL-007)', () => {
  it('names the sides a T-filler covers', () => {
    const covers = (left, right, top, bottom) => ({ left, right, top, bottom });
    expect(rabbetNote(covers(0.75, 0.75, 0, 0))).toBe('FF to rabbet sides for T-filler');
    expect(rabbetNote(covers(0, 0.75, 0, 0))).toBe('FF to rabbet right side for T-filler');
    expect(rabbetNote(covers(0.75, 0, 0, 0))).toBe('FF to rabbet left side for T-filler');
    expect(rabbetNote(covers(0, 0, 0.75, 0.75))).toBe('FF to rabbet top and bottom for T-filler');
    expect(rabbetNote(covers(0.75, 0, 0.75, 0))).toBe('FF to rabbet left side and top for T-filler');
    expect(rabbetNote(covers(0.75, 0.75, 0, 0.75))).toBe('FF to rabbet sides and bottom for T-filler');
  });

  it('notes every covered box, end and seam, vertical and horizontal', () => {
    const { rabbets } = context(endRun()).result;
    expect([...rabbets]).toEqual([
      ['a', 'FF to rabbet sides for T-filler'],
      ['b', 'FF to rabbet sides for T-filler'],
    ]);
    expect([...context(baseRun()).result.rabbets]).toEqual([
      ['a', 'FF to rabbet right side for T-filler'],
      ['b', 'FF to rabbet left side for T-filler'],
    ]);
    expect([...context(STACKED).result.rabbets]).toEqual([
      ['a1', 'FF to rabbet bottom for T-filler'],
      ['a2', 'FF to rabbet top for T-filler'],
    ]);
  });
});

describe('SPEC-37 T-shape and filler notes', () => {
  it('notes each T as a T-shape, with the filler notes where the flat drops', () => {
    const { notes } = context(endRun()).result;
    expect([...notes]).toEqual([
      ['r:left', ['T-shape']], ['tee:a|b', ['T-shape']], ['r:right', ['T-shape']],
    ]);
    const upper = baseRun({ cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30, depth: 12 });
    expect([...context(upper).result.notes]).toEqual([['tee:a|b', ['T-shape', 'return up 1/8"']]]);
  });
});

describe('SPEC-37 T-fillers in the part list', () => {
  it('numbers a seam T between its cabinets, and an end T in its filler\'s place', () => {
    const parts = partNumbers(roomWith(endRun()), S).parts.filter((part) => part.kind !== 'molding');
    expect(parts.map((part) => [part.number, part.key, part.kind, part.width])).toEqual([
      [1, 'r:left', 'filler', 3.75],
      [2, 'a', 'cabinet', 18],
      [3, 'tee:a|b', 'filler', 1.5],
      [4, 'b', 'cabinet', 18],
      [5, 'r:right', 'filler', 3.75],
    ]);
    expect(parts[2]).toMatchObject({ runId: 'r', pieceId: 'tee:a|b', wallId: 'wall-1' });
  });

  it('orders an end T at the width ordered for the filler, plus the cover', () => {
    const run = endRun({ endFiller: { left: { width: 6, returnDepth: null }, right: null } });
    const { parts } = partNumbers(roomWith(run), S);
    expect(parts.find((part) => part.key === 'r:left').width).toBe(6.75);
  });

  it('gives a horizontal T its flat height as its width, and leaves other runs alone', () => {
    const parts = (run) => partNumbers(roomWith(run), S).parts.filter((part) => part.kind !== 'molding');
    expect(parts(baseRun({ tFiller: undefined })).map((part) => part.key)).toEqual(['a', 'b']);
    expect(parts(STACKED).map((part) => [part.key, part.width])).toEqual([
      ['a2', 18], ['tee:h:a1|a2', 1.5], ['a1', 18],
    ]);
  });

  it('badges a seam T one level up, and not an end T', () => {
    const room = roomWith(endRun());
    const groups = wallBadgeGroups(room, resolveWall(room, room.walls[0]), S);
    expect(groups.map((group) => [group.key, group.lift])).toEqual([['run:r', 0], ['tees:r', 1]]);
    expect(groups[1].pieces).toEqual([{ id: 'tee:a|b', x: 44.25, z: 4, width: 1.5, height: 30.5 }]);
  });

  it('numbers each T between the cabinets of its seam in stacked columns (SPEC-37.3)', () => {
    const column = (id, top) => ({
      id,
      cols: [{ id: `${id}:c`, size: null, sizeMode: 'auto' }],
      rows: [{ id: `${id}:t`, size: top, sizeMode: 'manual' }, { id: `${id}:u`, size: null, sizeMode: 'auto' }],
      cells: [cell(0, 0, cab(`${id}1`)), cell(0, 1, cab(`${id}2`))],
    });
    const columns = (left, right, tFiller) => baseRun({
      z: 0, height: 60, tFiller,
      grid: {
        id: 'r:grid',
        cols: [{ id: 'a:col', size: 18, sizeMode: 'manual' }, { id: 'b:col', size: 18, sizeMode: 'manual' }],
        rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }],
        cells: [cell(0, 0, column('a', left)), cell(1, 0, column('b', right))],
      },
    });
    const keys = (run) => partNumbers(roomWith(run), S).parts
      .filter((part) => part.kind !== 'molding')
      .map((part) => part.key);
    expect(keys(columns(30, 30, 'all'))).toEqual([
      'a2', 'tee:h:a1|a2', 'a1', 'tee:a2|b2', 'b2', 'tee:h:b1|b2', 'b1',
    ]);
    expect(keys(columns(30, 20, 'seams'))).toEqual(['a2', 'a1', 'tee:a2|b2', 'b2', 'b1']);
  });
});
