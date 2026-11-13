import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { combinedHiddenEdges, combinedSoffitJoins, combinedViewOf } from '../combinedElevations.js';
import { combinedElevationPayload } from '../combinedPayload.js';
import { combinedFaceParts, seamHiddenEdges } from '../combinedSeams.js';
import { combinedCornerShapes } from '../cornerParts.js';
import { toDrawingPayload } from '../drawingPayload.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';
import { run } from '../../store/__tests__/helpers/sliceFixtures.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const settings = { ...document.settings, runFlex: 0 };
const to = (wallId, endpoint) => ({ wallId, endpoint });
const wall = (id, x1, y1, x2, y2, start, end, soffits = [], runs = []) => ({
  id, name: id, x1, y1, x2, y2, height: 96, thickness: 4.5, flipped: false,
  runs, openings: [], recesses: [], soffits, connections: { start, end },
});
const soffit = (overrides = {}) => ({ id: 'S', side: 'front', x: 0, width: 60, bottom: 84, depth: 16, ...overrides });

// C and A at the front with a base run each, B 16" back between them (as in combinedPayload.test.js).
function steppedRoom(soffits, on = true) {
  return syncRoom({
    id: 'room-1', name: 'Stepped room', profile: document.rooms[0].profile,
    wallOrder: ['C', 'K', 'B', 'J', 'A'],
    combinedElevations: [{ id: 'g', on, faces: ['A', 'B', 'C'] }],
    walls: [
      wall('A', 0, 0, 100, 0, null, to('J', 'start'), [], [run({ id: 'a', x: 10, width: 30 })]),
      wall('J', 100, 0, 100, 16, to('A', 'end'), to('B', 'start')),
      wall('B', 100, 16, 160, 16, to('J', 'end'), to('K', 'start'), soffits),
      wall('K', 160, 16, 160, 0, to('B', 'end'), to('C', 'start')),
      wall('C', 160, 0, 240, 0, to('K', 'end'), null, [], [run({ id: 'c', x: 10, width: 30 })]),
    ],
  }, settings);
}
const joinsOf = (soffits) => {
  const room = steppedRoom(soffits);
  return combinedSoffitJoins(room, combinedViewOf(room, 'B', 'front'));
};

describe('combined soffit joins (Kyle 2026-10-23)', () => {
  it('joins a back soffit as deep as the step to the nearer faces on both sides', () => {
    expect(joinsOf([soffit()])).toEqual([
      { key: 'B', soffitId: 'S', side: 'left', nearKey: 'C', bottom: 84, top: 96 },
      { key: 'B', soffitId: 'S', side: 'right', nearKey: 'A', bottom: 84, top: 96 },
    ]);
  });

  it('keeps the seam for another depth, a soffit short of the face end, or a nearer face soffit', () => {
    expect(joinsOf([soffit({ depth: 12 })])).toEqual([]);
    expect(joinsOf([soffit({ x: 1, width: 58 })])).toEqual([]);
    const room = steppedRoom([]);
    room.walls.find(({ id }) => id === 'C').soffits = [soffit({ width: 80, depth: 16 })];
    expect(combinedSoffitJoins(room, combinedViewOf(room, 'B', 'front'))).toEqual([]);
  });

  it('hides the matching edge span on both faces of each join', () => {
    const edges = combinedHiddenEdges(joinsOf([soffit({ x: 30, width: 30 })]));
    expect(Object.fromEntries(edges)).toEqual({
      B: { left: [], right: [{ bottom: 84, top: 96 }] },
      A: { left: [{ bottom: 84, top: 96 }], right: [] },
    });
  });
});

describe('combined payload hidden seam edges (Kyle 2026-10-23)', () => {
  it('opens a joined soffit side and hides both faces\' edges over it', () => {
    const [elevation] = toDrawingPayload(steppedRoom([soffit({ x: 30, width: 30 })]), settings).elevations;
    const byKey = Object.fromEntries(elevation.faces.map((face) => [face.key, face]));
    expect(byKey.B.hiddenEdges).toEqual({ left: [], right: [{ bottom: 84, top: 96 }] });
    expect(byKey.A.hiddenEdges).toEqual({ left: [{ bottom: 84, top: 96 }], right: [] });
    expect(byKey.C.hiddenEdges).toBeUndefined();
    expect(elevation.parts.find(({ id }) => id === 'S')).toMatchObject({ kind: 'soffit', openEdges: ['right'] });
  });

  it('hides a seam wherever a part runs across it, merging overlaps', () => {
    const room = steppedRoom([]);
    const combined = combinedViewOf(room, 'B', 'front');
    const part = (id, x, z, width, height) => ({ id, kind: 'crown', x, z, width, height, back: 0, front: 4 });
    // C is 0–80: crown from C runs 2" past its right end; an end panel just touching the seam doesn't count.
    const faceParts = { C: [part('crown', 0, 90, 82, 4), part('top', 70, 88, 12, 4)], B: [part('panel', 0, 0, 1, 50)], A: [] };
    const payload = combinedElevationPayload(room, combined, settings, (faceWall) => ({
      key: faceWall.id, parts: faceParts[faceWall.id], dimensions: [],
    }));
    const byKey = Object.fromEntries(payload.faces.map((face) => [face.key, face]));
    expect(byKey.C.hiddenEdges).toEqual({ left: [], right: [{ bottom: 88, top: 94 }] });
    expect(byKey.B.hiddenEdges).toEqual({ left: [{ bottom: 88, top: 94 }], right: [] });
    expect(byKey.A.hiddenEdges).toBeUndefined();
  });
});

describe('combined canvas hidden seam edges (Kyle 2026-10-23)', () => {
  it('builds every face\'s parts at the elevation\'s x and hides the same seams as the DXF', () => {
    const room = steppedRoom([soffit({ x: 30, width: 30 })]);
    const combined = combinedViewOf(room, 'B', 'front');
    const parts = combinedFaceParts(room, combined, settings, combinedCornerShapes(room, combined, settings));
    const canvas = seamHiddenEdges(combined, parts, combinedSoffitJoins(room, combined));
    const [elevation] = toDrawingPayload(room, settings).elevations;
    // Each run part sits where the DXF puts it along the elevation.
    const aParts = parts.filter(({ runId }) => runId === 'a');
    expect(aParts.length).toBeGreaterThan(0);
    for (const part of aParts) expect(part.x).toBe(elevation.parts.find(({ id }) => id === part.id).x);
    expect(Object.fromEntries(canvas)).toEqual(Object.fromEntries(elevation.faces
      .filter(({ hiddenEdges }) => hiddenEdges).map(({ key, hiddenEdges }) => [key, hiddenEdges])));
  });
});
