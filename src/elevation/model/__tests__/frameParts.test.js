import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun } from '../faceLayouts.js';
import { boxInsets, frameRegions } from '../frames.js';
import { gridFromItems } from '../grid.js';
import { resolveWall } from '../room.js';

const S = DEFAULT_SETTINGS;
const INSET = { cabinetStyleId: 14 };
const NONE = { type: 'none', width: null };
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

/** SPEC-36.2 BW: an inset base in a 48" space, no end pieces, two auto cabinets. */
const baseRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 48, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
  grid: gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: null }, { id: 'b', kind: 'cabinet', width: null }]),
  ...overrides,
});

function framed(run, style = INSET) {
  const room = roomWith(run, style);
  const wall = resolveWall(room, room.walls[0]);
  const cells = cellPieces(run, layoutRun(room, wall, run, S));
  return { room, wall, cells, frames: frameRegions(room, run, cells, S) };
}

describe('SPEC-36.2 box widths', () => {
  it('makes a framed box its slot less the stile overhang at each free side', () => {
    const { cells, frames } = framed(baseRun());
    expect(cells.pieces.map(({ id, width }) => [id, width])).toEqual([['a', 24], ['b', 24]]);
    const insets = boxInsets(frames, cells, S);
    expect(insets.get('a')).toEqual({ left: 0.75, right: 0 });
    expect(insets.get('b')).toEqual({ left: 0, right: 0.75 });
    expect(boxInsets(framed(baseRun(), null).frames, cells, S).size).toBe(0);

    const split = framed(baseRun({
      grid: {
        id: 'r:grid',
        cols: [{ id: 's:col', size: null, sizeMode: 'auto' }, { id: 'b:col', size: null, sizeMode: 'auto' }],
        rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }],
        cells: [
          cell(0, 0, {
            id: 's',
            cols: [{ id: 's:c', size: null, sizeMode: 'auto' }],
            rows: [{ id: 's:t', size: null, sizeMode: 'auto' }, { id: 's:u', size: null, sizeMode: 'auto' }],
            cells: [cell(0, 0, { id: 't', kind: 'cabinet' }), cell(0, 1, { id: 'u', kind: 'cabinet' })],
          }),
          cell(1, 0, { id: 'b', kind: 'cabinet' }),
        ],
      },
    }));
    const stacked = boxInsets(split.frames, split.cells, S);
    expect(['t', 'u', 's', 'b'].map((id) => stacked.get(id))).toEqual([
      { left: 0.75, right: 0 }, { left: 0.75, right: 0 }, { left: 0.75, right: 0 }, { left: 0, right: 0.75 },
    ]);
  });
});
