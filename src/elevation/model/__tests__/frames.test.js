import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { frameRegions } from '../frames.js';
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

const baseRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 36, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
  grid: gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: 18 }, { id: 'b', kind: 'cabinet', width: 18 }]),
  ...overrides,
});

function framesOf(run, style = INSET) {
  const room = roomWith(run, style);
  const wall = resolveWall(room, room.walls[0]);
  const layout = layoutRun(room, wall, run, S);
  return {
    frames: frameRegions(room, run, cellPieces(run, layout), S),
    faces: runFaceLayouts(room, wall, run, S, layout),
  };
}

describe('SPEC-36 frame regions', () => {
  it('frames two inset cabinets: run-end sides are not free and the boxes keep their full width', () => {
    const { frames, faces } = framesOf(baseRun());
    expect(frames.regions).toEqual([{
      id: 'frame:a', x: 24, z: 4, width: 36, height: 30.5, cabinetIds: ['a', 'b'], fillerIds: [], panelIds: [],
    }]);
    expect(frames.freeSides.get('a')).toEqual({ left: false, right: false });
    expect(frames.freeSides.get('b')).toEqual({ left: false, right: false });
    expect(frames.warnings).toEqual([]);

    const a = faces.get('a');
    expect([a.box.x, a.box.width]).toEqual([24, 18]);
    expect(a.faces).toEqual([{ path: 'r', type: 'door', x: 24.75, z: 5.5, width: 16.5, height: 27.5 }]);
    expect(a.openings).toEqual([{ path: 'r', x: 24.75, z: 5.5, width: 16.5, height: 27.5 }]);
    expect(faces.get('b').openings).toEqual([{ path: 'r', x: 42.75, z: 5.5, width: 16.5, height: 27.5 }]);

    expect(framesOf(baseRun(), null).frames.regions).toEqual([]);
  });

  it('covers an end panel and a filler, and the seam gap widens the stile', () => {
    const run = baseRun({
      width: 40,
      seamGap: 0.5,
      ends: { left: { type: 'end_panel', width: null }, right: { type: 'filler', width: 2 } },
      grid: gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: 18 }, { id: 'b', kind: 'cabinet', width: null }]),
    });
    const { frames, faces } = framesOf(run, { cabinetStyleId: 15 });
    expect(frames.regions).toEqual([{
      id: 'frame:a', x: 24, z: 4, width: 40, height: 30.5,
      cabinetIds: ['a', 'b'], fillerIds: ['r:right'], panelIds: ['r:left'],
    }]);
    expect([...frames.fillerIds]).toEqual(['r:right']);
    expect(frames.freeSides.get('a')).toEqual({ left: false, right: false });
    expect(frames.freeSides.get('b')).toEqual({ left: false, right: false });
    expect(faces.get('a').openings).toEqual([{ path: 'r', x: 25.5, z: 5.75, width: 16.5, height: 27 }]);
    expect(faces.get('b').openings).toEqual([{ path: 'r', x: 44, z: 5.75, width: 17.25, height: 27 }]);
  });

  it('drops the frame under an upper and warns when it isn\'t a rectangle', () => {
    const run = baseRun({
      cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30, depth: 12,
      grid: {
        id: 'r:grid',
        cols: [{ id: 's:col', size: 18, sizeMode: 'manual' }, { id: 'b:col', size: 18, sizeMode: 'manual' }],
        rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }],
        cells: [
          cell(0, 0, {
            id: 's',
            cols: [{ id: 's:c', size: null, sizeMode: 'auto' }],
            rows: [{ id: 's:t', size: null, sizeMode: 'auto' }, { id: 's:v', size: 12, sizeMode: 'manual' }],
            cells: [cell(0, 0, { id: 't', kind: 'cabinet' }), cell(0, 1, { id: 'v', kind: 'void' })],
          }),
          cell(1, 0, { id: 'b', kind: 'cabinet' }),
        ],
      },
    });
    const { frames } = framesOf(run);
    expect(frames.regions).toEqual([{
      id: 'frame:t', x: 24, z: 53.25, width: 36, height: 30.75, cabinetIds: ['t', 'b'], fillerIds: [], panelIds: [],
    }]);
    expect(frames.freeSides.get('t')).toEqual({ left: false, right: false });
    expect(frames.warnings.map(({ code, pieceId }) => [code, pieceId])).toEqual([['frame-not-rectangle', 't']]);
  });
});
