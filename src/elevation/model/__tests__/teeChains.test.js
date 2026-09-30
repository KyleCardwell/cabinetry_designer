import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { horizontalChains, verticalChains } from '../dimensions.js';
import { gridFromItems } from '../grid.js';
import { resolveWall } from '../room.js';

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

const column = (id, top) => ({
  id,
  cols: [{ id: `${id}:c`, size: null, sizeMode: 'auto' }],
  rows: [{ id: `${id}:t`, size: top, sizeMode: 'manual' }, { id: `${id}:u`, size: null, sizeMode: 'auto' }],
  cells: [cell(0, 0, cab(`${id}1`)), cell(0, 1, cab(`${id}2`))],
});

const stackedRun = (overrides = {}) => baseRun({
  z: 0, height: 60, tFiller: 'all',
  grid: {
    id: 'r:grid',
    cols: [{ id: 'a:col', size: 18, sizeMode: 'manual' }, { id: 'b:col', size: 18, sizeMode: 'manual' }],
    rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }],
    cells: [cell(0, 0, column('a', 30)), cell(1, 0, column('b', 30))],
  },
  ...overrides,
});

const inner = (run) => {
  const room = roomWith(run);
  return horizontalChains(room, resolveWall(room, room.walls[0]), 'lower', S).inner
    .filter(({ kind }) => kind !== 'open');
};
const up = (run, edge) => {
  const room = roomWith(run);
  const wall = resolveWall(room, room.walls[0]);
  return verticalChains(room, wall, { lowerRun: room.walls[0].runs[0], upperRun: null }, S, edge).inner;
};

describe('SPEC-37 T-fillers on the horizontal chain', () => {
  it('shows a seam T as its own segment, and the boxes less what it covers', () => {
    expect(inner(baseRun()).map(({ start, end, kind, pieceId }) => [start, end, kind, pieceId])).toEqual([
      [24, 41.25, 'piece', 'a'],
      [41.25, 42.75, 't-filler', 'tee:a|b'],
      [42.75, 60, 'piece', 'b'],
    ]);
  });

  it('counts the gap between spaced boxes in the T', () => {
    expect(inner(baseRun({ width: 36.5, seamGap: 0.5 })).map(({ start, end, kind }) => [start, end, kind])).toEqual([
      [24, 41.25, 'piece'], [41.25, 43.25, 't-filler'], [43.25, 60.5, 'piece'],
    ]);
  });

  it('shows an end T for its filler, with the flat reaching over the box', () => {
    const run = baseRun({
      width: 42,
      ends: { left: { type: 'filler', width: 3 }, right: { type: 'filler', width: 3 } },
    });
    expect(inner(run).map(({ start, end, kind, pieceId }) => [start, end, kind, pieceId])).toEqual([
      [24, 27.75, 't-filler', 'r:left'],
      [27.75, 44.25, 'piece', 'a'],
      [44.25, 45.75, 't-filler', 'tee:a|b'],
      [45.75, 62.25, 'piece', 'b'],
      [62.25, 66, 't-filler', 'r:right'],
    ]);
  });

  it('leaves a column of stacked boxes, and runs without T-fillers, as they were', () => {
    expect(inner(baseRun({ tFiller: undefined })).map(({ start, end, kind }) => [start, end, kind])).toEqual([
      [24, 42, 'piece'], [42, 60, 'piece'],
    ]);
    expect(inner(stackedRun({ tFiller: 'seams' })).map(({ start, end, kind, pieceId }) => [start, end, kind, pieceId])).toEqual([
      [24, 41.25, 'piece', 'a'], [41.25, 42.75, 't-filler', 'tee:a2|b2'], [42.75, 60, 'piece', 'b'],
    ]);
  });
});

describe('SPEC-37 T-fillers on the vertical chain', () => {
  it('splits the box around a horizontal T in the column at the chain\'s edge', () => {
    const summary = (chain) => chain.filter(({ kind }) => ['box', 't-filler'].includes(kind))
      .map(({ start, end, kind }) => [start, end, kind]);
    for (const edge of ['left', 'right']) {
      expect(summary(up(stackedRun(), edge))).toEqual([[0, 29.25, 'box'], [29.25, 30.75, 't-filler'], [30.75, 60, 'box']]);
    }
    expect(summary(up(stackedRun({ tFiller: 'seams' }), 'left'))).toEqual([[0, 60, 'box']]);
    expect(summary(up(baseRun(), 'left'))).toEqual([[4, 34.5, 'box']]);
  });
});
