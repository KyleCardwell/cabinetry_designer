import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { frameBottomParts, runBelowBox, runBottomParts } from '../bottoms.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { cabinetReveals, frameDrop } from '../styles.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const S = DEFAULT_SETTINGS;
const { BASE, UPPER } = CABINET_TYPE_IDS;
const INSET = { cabinetStyleId: 14, beadWidth: 0.25, profiledEdge: false };
const BEADED = { cabinetStyleId: 15, beadWidth: 0.25, profiledEdge: false };
const DOOR = { type: 'door', size: null };
const RAIL = { id: 'rail', kind: 'light_rail', height: 1.5, doors: 'cover' };
const TROUGH = { id: 'trough', kind: 'light_trough', height: 3, doors: 'flush' };
const PANEL = { id: 'panel', kind: 'panel', height: 0.75, doors: 'flush' };
const CAP = { id: 'cap', kind: 'bottom_cap', height: 1.5, doors: 'visible' };
const CORBELS = { id: 'corbels', kind: 'corbels', height: 6, doors: 'visible' };
const upper = (bottom, extra = {}) => ({ cabinetTypeId: UPPER, bottom, ...extra });

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const G2_UPPER = 'ab0981ca-8621-45ba-a924-dbe318646f67';
const G2_CAB = '2db19921-bc7f-4f28-9610-0d0f46729a46';

/** G2's face frame upper with `bottom` below it: box, first face, frame bottom and parts below. */
function g2Upper(bottom) {
  const room = structuredClone(document.rooms.find((candidate) => candidate.name === 'G2 Face frame kitchen'));
  room.walls.flatMap((wall) => wall.runs).find((run) => run.id === G2_UPPER).bottom = bottom;
  const synced = syncRoom(room, document.settings);
  const view = resolveWall(synced, synced.walls[0], 'front');
  const run = view.runs.find((candidate) => candidate.id === G2_UPPER);
  const scene = runScene(synced, view, run, document.settings);
  const face = scene.faceLayouts.get(G2_CAB).faces[0];
  return {
    box: [run.z, run.height],
    face: [face.z, face.height],
    frameBottom: Math.min(...scene.frames.regions.map((region) => region.z)),
    parts: runBands(synced, view, run, document.settings, scene).bottomParts
      .map(({ kind, z, height, behind }) => [kind, z, height, behind === true]),
  };
}

describe('SPEC-46.2.1 a face frame upper\'s bottom rail is its light rail or trough', () => {
  it('takes an upper\'s leading covered or flush parts as the frame', () => {
    expect([
      frameBottomParts(upper([])),
      frameBottomParts({ cabinetTypeId: UPPER }),
      frameBottomParts(upper([RAIL])),
      frameBottomParts(upper([TROUGH, CAP])),
      frameBottomParts(upper([RAIL, PANEL])),
      frameBottomParts(upper([{ ...CAP, doors: 'flush' }])),
      frameBottomParts(upper([{ ...RAIL, doors: 'visible' }, PANEL])),
      frameBottomParts({ cabinetTypeId: BASE, bottom: [RAIL] }),
    ]).toEqual([
      { height: 0, doors: null, count: 0 },
      { height: 0, doors: null, count: 0 },
      { height: 1.5, doors: 'cover', count: 1 },
      { height: 3, doors: 'flush', count: 1 },
      { height: 2.25, doors: 'cover', count: 2 },
      { height: 0, doors: null, count: 0 },
      { height: 0, doors: null, count: 0 },
      { height: 0, doors: null, count: 0 },
    ]);
  });

  it('drops the frame by those parts, else as today', () => {
    expect([
      frameDrop(upper([RAIL]), S),
      frameDrop(upper([TROUGH]), S),
      frameDrop(upper([CORBELS]), S),
      frameDrop(upper([], { upperBottom: 'counter' }), S),
      frameDrop(upper([RAIL], { upperBottom: 'counter' }), S),
      frameDrop({ cabinetTypeId: BASE, bottom: [RAIL] }, S),
    ]).toEqual([1.5, 3, 0.75, 0, 1.5, 0]);
  });

  it('hangs the other parts below the frame, marks the ones behind it, and measures the drop below the box', () => {
    const placed = (run) => runBottomParts(run).map(({ id, z, behind }) => [id, z, behind === true]);
    expect(placed(upper([CORBELS], { z: 54.75, _frame: { drop: 0.75 } }))).toEqual([['corbels', 48, false]]);
    expect(placed(upper([RAIL, CORBELS], { z: 55.5, _frame: { drop: 1.5 } })))
      .toEqual([['rail', 54, true], ['corbels', 48, false]]);
    expect(placed(upper([RAIL, CAP], { z: 54 }))).toEqual([['rail', 52.5, false], ['cap', 51, false]]);
    expect([
      runBelowBox(upper([RAIL], { z: 54 })),
      runBelowBox(upper([], { z: 54.75, _frame: { drop: 0.75 } })),
      runBelowBox(upper([RAIL], { z: 55.5, _frame: { drop: 1.5 } })),
      runBelowBox(upper([CORBELS], { z: 54.75, _frame: { drop: 0.75 } })),
      runBelowBox({ cabinetTypeId: BASE, z: 4 }),
    ]).toEqual([1.5, 0.75, 1.5, 6.75, 0]);
  });

  it('gives the boxes the normal bottom reveal over a rail, and 0" plus the bead over a frame hung for a trough', () => {
    const bottom = (style, run) => {
      const { values, sources } = cabinetReveals({ style, cabinetTypeId: UPPER, run, face: DOOR, settings: S });
      return [values.bottom, sources.bottom];
    };
    expect([
      bottom(INSET, upper([RAIL])),
      bottom(INSET, upper([TROUGH])),
      bottom(BEADED, upper([TROUGH])),
      bottom(BEADED, upper([RAIL])),
      bottom(INSET, upper([CORBELS])),
      bottom(INSET, upper([RAIL], { upperBottom: 'counter' })),
    ]).toEqual([
      [0.75, 'rule:below-run'],
      [0, 'rule:below-run'],
      [0.25, 'rule:below-run'],
      [1, 'rule:below-run'],
      [0.75, 'style'],
      [0.75, 'rule:below-run'],
    ]);
  });

  it('raises G2\'s face frame upper by a covered rail or a flush trough; the frame keeps its bottom at 54"', () => {
    expect(g2Upper([])).toEqual({ box: [54.75, 35.25], face: [55.75, 32.5], frameBottom: 54, parts: [] });
    expect(g2Upper([RAIL])).toEqual({
      box: [55.5, 34.5], face: [56.5, 31.75], frameBottom: 54, parts: [['light_rail', 54, 1.5, true]],
    });
    expect(g2Upper([TROUGH])).toEqual({
      box: [57, 33], face: [57.25, 31], frameBottom: 54, parts: [['light_trough', 54, 3, true]],
    });
  });
});
