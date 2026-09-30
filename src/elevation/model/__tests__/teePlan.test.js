import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { gridFromItems } from '../grid.js';
import { planRunPieces } from '../planPieces.js';
import { resolveWall } from '../room.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };
const cab = (id, width = null) => ({ id, kind: 'cabinet', width });

function roomWith(run) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
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

function planOf(run) {
  const room = roomWith(run);
  const wall = resolveWall(room, room.walls[0]);
  const layout = layoutRun(room, wall, run, S);
  return planRunPieces(room, wall, run, S, layout, runFaceLayouts(room, wall, run, S, layout));
}

describe('SPEC-37 T-fillers in plan', () => {
  it('draws a seam T as a flat with a centred return', () => {
    const { faces, returns } = planOf(baseRun());
    expect(faces).toEqual([
      { key: 'a:r', kind: 'face', start: 24.0625, end: 41.1875, back: 24.0625, front: 24.875 },
      { key: 'b:r', kind: 'face', start: 42.8125, end: 59.9375, back: 24.0625, front: 24.875 },
      // Hardwood, 13/16" thick from the box face (24"); the return is 3/4" x 2 1/2" behind it.
      { key: 'tee:a|b', kind: 'filler', start: 41.25, end: 42.75, back: 24, front: 24.8125 },
    ]);
    expect(returns).toEqual([
      { key: 'tee:a|b:return', start: 41.625, end: 42.375, back: 21.5, front: 24 },
    ]);
  });

  it('widens the flat over spaced boxes', () => {
    const { faces, returns } = planOf(baseRun({ width: 36.5, seamGap: 0.5 }));
    expect(faces.find((face) => face.key === 'tee:a|b')).toMatchObject({ start: 41.25, end: 43.25 });
    expect(returns[0]).toMatchObject({ start: 41.875, end: 42.625 });
  });

  it('draws an end T over its box, with the filler\'s own return off-centre', () => {
    const run = baseRun({
      width: 42, tFiller: undefined,
      ends: { left: { type: 'filler', width: 3 }, right: { type: 'filler', width: 3 } },
      endFiller: { left: { tFiller: true }, right: { tFiller: true } },
    });
    const { faces, returns } = planOf(run);
    expect(faces.filter((face) => face.key.startsWith('r:'))).toEqual([
      { key: 'r:left', kind: 'filler', start: 24, end: 27.75, back: 24, front: 24.8125 },
      { key: 'r:right', kind: 'filler', start: 62.25, end: 66, back: 24, front: 24.8125 },
    ]);
    expect(returns).toEqual([
      { key: 'r:left:right', start: 26.25, end: 27, back: 21.5, front: 24 },
      { key: 'r:right:left', start: 63, end: 63.75, back: 21.5, front: 24 },
    ]);
  });

  it('keeps an ordered filler width, and adds the cover toward the box', () => {
    const run = baseRun({
      width: 39, tFiller: undefined,
      ends: { left: { type: 'filler', width: 3 }, right: NONE },
      endFiller: { left: { width: 6, returnDepth: 4, tFiller: true }, right: null },
    });
    const { faces, returns } = planOf(run);
    expect(faces.find((face) => face.key === 'r:left')).toMatchObject({ start: 21, end: 27.75 });
    expect(returns).toEqual([{ key: 'r:left:right', start: 26.25, end: 27, back: 20, front: 24 }]);
  });

  it('draws nothing more without T-fillers, and pushes T-fillers out by the outset', () => {
    expect(planOf(baseRun({ tFiller: undefined })).faces.map((face) => face.key)).toEqual(['a:r', 'b:r']);
    const { faces, returns } = planOf(baseRun({ outset: 2 }));
    expect(faces.find((face) => face.key === 'tee:a|b')).toMatchObject({ back: 26, front: 26.8125 });
    expect(returns[0]).toMatchObject({ back: 23.5, front: 26 });
  });
});
