import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS } from '../constants.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import elevationReducer, { setRunBottom } from '../../store/elevationSlice.js';
import { normalizeElevationDocument } from '../../store/persistence.js';
import { auto, currentRun, run, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const RAIL = { id: 'rail', kind: 'light_rail', height: 1.5, doors: 'cover' };
const CORBELS = { id: 'corbels', kind: 'corbels', height: 6, doors: 'visible' };
const G1_UPPER = '434f1164-3b6b-4a97-89e7-1c6438c4d95a';
const G2_UPPER = 'ab0981ca-8621-45ba-a924-dbe318646f67';

/** A golden upper with `bottom` below it: its box, each cabinet's first face, the parts below and the frame bottom. */
function upperWith(name, runId, bottom) {
  const room = structuredClone(document.rooms.find((candidate) => candidate.name === name));
  room.walls.flatMap((wall) => wall.runs).find((candidate) => candidate.id === runId).bottom = bottom;
  const synced = syncRoom(room, settings);
  const wall = synced.walls.find((candidate) => candidate.runs.some((entry) => entry.id === runId));
  const view = resolveWall(synced, wall, 'front');
  const upper = view.runs.find((candidate) => candidate.id === runId);
  const scene = runScene(synced, view, upper, settings);
  return {
    box: [upper.z, upper.height],
    faces: [...scene.faceLayouts.values()].map((layout) => [layout.faces[0].z, layout.faces[0].height]),
    parts: runBands(synced, view, upper, settings, scene).bottomParts.map(({ kind, z, height }) => [kind, z, height]),
    frameBottom: scene.frames.regions.length ? Math.min(...scene.frames.regions.map((region) => region.z)) : null,
  };
}

describe('SPEC-46.2.1 an upper\'s clearance runs to the bottom of the parts below it', () => {
  it('shrinks a Euro upper by the light rail below it; the doors stay put (G1)', () => {
    expect(upperWith('G1 Euro kitchen', G1_UPPER, [])).toEqual({
      box: [54, 36], faces: [[53.875, 36], [53.875, 36]], parts: [], frameBottom: null,
    });
    expect(upperWith('G1 Euro kitchen', G1_UPPER, [RAIL])).toEqual({
      box: [55.5, 34.5], faces: [[53.875, 36], [53.875, 36]], parts: [['light_rail', 54, 1.5]], frameBottom: null,
    });
  });

  it('hangs corbels below a face frame upper\'s frame, with their bottom 18" over the counter (G2)', () => {
    expect(upperWith('G2 Face frame kitchen', G2_UPPER, [CORBELS])).toEqual({
      box: [60.75, 29.25],
      faces: [[61.75, 26.5], [61.75, 26.5], [61.75, 26.5]],
      parts: [['corbels', 54, 6]],
      frameBottom: 60,
    });
  });

  it('keeps a manual upper\'s parts where its box bottom was; the box gets shorter', () => {
    const at = { wallId: 'wall-1', runId: 'run-1' };
    const state = stateWithRun(run({
      cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 36, depth: 12, autoCount: false, items: [auto('a')],
    }));
    const added = elevationReducer(state, setRunBottom({ ...at, bottom: [RAIL] }));
    expect([currentRun(added).heightMode, currentRun(added).z, currentRun(added).height]).toEqual(['manual', 55.5, 34.5]);
    const removed = elevationReducer(added, setRunBottom({ ...at, bottom: [] }));
    expect([currentRun(removed).z, currentRun(removed).height]).toEqual([54, 36]);
  });
});
