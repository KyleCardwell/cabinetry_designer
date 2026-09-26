import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { frontDepth } from '../corners.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { runFootprint } from '../footprints.js';
import { planRunPieces } from '../planPieces.js';
import { syncRoom } from '../room.js';
import { wallSideFrame } from '../wallSides.js';

const S = DEFAULT_SETTINGS;

function outsetRoom(outset) {
  return syncRoom({
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['A'],
    walls: [{
      id: 'A', name: '', numberOverride: null, x1: 0, y1: 0, x2: 120, y2: 0,
      height: 96, thickness: 4.5, flipped: false,
      connections: { start: null, end: null }, profile: {}, openings: [],
      runs: [{
        id: 'B', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 10, width: 30, z: 4, height: 30.5, depth: 24,
        ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
        autoCount: false, maxCabinetWidth: null,
        items: [{ id: 'B-cabinet', kind: 'cabinet', width: null }],
        heightMode: 'auto', overrides: {}, anchors: { left: false, right: false },
        ...(outset === undefined ? {} : { outset }),
      }],
    }],
  }, S);
}

describe('SPEC-35 outset', () => {
  it('measures the front from the wall and sets the footprint back', () => {
    expect(frontDepth({ depth: 24 }, S)).toBe(24.875);
    expect(frontDepth({ depth: 24, outset: 2 }, S)).toBe(26.875);
    const room = outsetRoom(3);
    const wall = room.walls[0];
    expect(runFootprint(wallSideFrame(room, wall, 'front'), wall.runs[0], S)).toEqual([
      { x: 10, y: 3 }, { x: 40, y: 3 }, { x: 40, y: 27.875 }, { x: 10, y: 27.875 },
    ]);
  });

  it('moves plan boxes and faces out by the outset', () => {
    const planOf = (room) => {
      const wall = room.walls[0];
      const run = wall.runs[0];
      const layout = layoutRun(room, wall, run, S);
      return planRunPieces(room, wall, run, S, layout, runFaceLayouts(room, wall, run, S, layout));
    };
    expect(planOf(outsetRoom()).boxes).toEqual([{ key: 'B-cabinet', start: 10, end: 40, back: 0, front: 24 }]);
    const pieces = planOf(outsetRoom(3));
    expect(pieces.boxes).toEqual([{ key: 'B-cabinet', start: 10, end: 40, back: 3, front: 27 }]);
    expect(pieces.faces.map(({ back, front }) => [back, front])).toEqual([[27.0625, 27.875], [27.0625, 27.875]]);
    expect(pieces.span).toEqual({ start: 10, end: 40 });
  });
});
