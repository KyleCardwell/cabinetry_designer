import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { elevationParts } from '../elevationParts.js';
import { resolveFaces } from '../faces.js';
import { gridFromItems } from '../grid.js';
import { resolveWall } from '../room.js';
import { runScene } from '../runScene.js';
import { elevationSwingMarks, runSwingMarks, swingMarkLines } from '../index.js';

const rect = { x: 1, z: 4, width: 16, height: 24 };
const door = { ...rect, type: 'door', path: 'r' };
const left = [
  { x1: 1, z1: 16, x2: 17, z2: 28 },
  { x1: 1, z1: 16, x2: 17, z2: 4 },
];
const right = [
  { x1: 17, z1: 16, x2: 1, z2: 28 },
  { x1: 17, z1: 16, x2: 1, z2: 4 },
];
const pair = resolveFaces({ type: 'pair_door' }, rect, {
  left: 0, right: 0, top: 0, bottom: 0, pair: 1 / 16,
}).faces;
const pairLines = [
  [{ x1: 1, z1: 16, x2: 8.96875, z2: 28 }, { x1: 1, z1: 16, x2: 8.96875, z2: 4 }],
  [{ x1: 17, z1: 16, x2: 9.03125, z2: 28 }, { x1: 17, z1: 16, x2: 9.03125, z2: 4 }],
];

function fixture() {
  const run = {
    id: 'run-1', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 18, z: 4,
    height: 30.5, depth: 24, ends: { left: { type: 'none' }, right: { type: 'none' } },
    autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
    anchors: { left: true, right: false },
    grid: gridFromItems('run-1', [{ id: 'cab-1', kind: 'cabinet', width: 18 }]),
  };
  const wall = {
    id: 'wall-1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
  };
  const room = {
    id: 'room-1', profile: { ...DEFAULT_SETTINGS.defaultProfile }, walls: [wall], wallOrder: [wall.id],
  };
  return { room, wall, run };
}

describe('HP2 step a swing marks', () => {
  it('anchor 1: points to the middle of the left hinge edge', () => {
    expect(swingMarkLines({ ...door, hinge: 'left' })).toEqual(left);
  });

  it('anchor 2: points to the middle of the right hinge edge', () => {
    expect(swingMarkLines({ ...door, hinge: 'right' })).toEqual(right);
  });

  it('anchor 3: orders top and bottom hinge lines toward the left then right corner', () => {
    expect(swingMarkLines({ ...door, hinge: 'top' })).toEqual([
      { x1: 9, z1: 28, x2: 1, z2: 4 }, { x1: 9, z1: 28, x2: 17, z2: 4 },
    ]);
    expect(swingMarkLines({ ...door, hinge: 'bottom' })).toEqual([
      { x1: 9, z1: 4, x2: 1, z2: 28 }, { x1: 9, z1: 4, x2: 17, z2: 28 },
    ]);
  });

  it('anchor 4: includes swing, flipper and pocket doors; skips sliding, pullout and missing hinges', () => {
    for (const action of ['swing', 'flipper', 'pocket']) {
      expect(swingMarkLines({ ...door, hinge: 'left', action })).toEqual(left);
    }
    for (const action of ['sliding', 'pullout']) {
      expect(swingMarkLines({ ...door, action })).toEqual([]);
      expect(swingMarkLines({ ...door, action, hinge: 'left' })).toEqual([]);
    }
    expect(swingMarkLines(door)).toEqual([]);
  });

  it('anchor 5: hinges the resolved pair halves outward across the 1/16 inch gap', () => {
    expect(pair.map(({ x, width, half }) => ({ x, width, half }))).toEqual([
      { x: 1, width: 7.96875, half: 'left' }, { x: 9.03125, width: 7.96875, half: 'right' },
    ]);
    expect(pair.map(swingMarkLines)).toEqual(pairLines);
    for (const action of ['swing', 'flipper', 'pocket']) {
      expect(pair.map((face) => swingMarkLines({ ...face, action }))).toEqual(pairLines);
    }
    expect(pair.map((face) => swingMarkLines({ ...face, action: 'sliding' }))).toEqual([[], []]);
  });

  it('anchor 6: ignores stray hinges on drawer fronts and all other face types', () => {
    for (const type of ['drawer_front', 'false_front', 'open', 'panel', 'other']) {
      expect(swingMarkLines({ ...door, type, hinge: 'left' })).toEqual([]);
    }
  });

  it('collects every marked face in map order with paths, nullable halves and elevation part ids', () => {
    const layouts = new Map([
      ['cab-1', { faces: [{ ...door, hinge: 'left' }, { ...door, type: 'open' }] }],
      ['cab-2', { faces: pair.map((face) => ({ ...face, path: 'r.1' })) }],
      ['cab-3', { faces: [{ ...door, action: 'sliding' }] }],
    ]);
    expect(runSwingMarks(layouts)).toEqual([
      { pieceId: 'cab-1', path: 'r', half: null, partId: 'cab-1:r', lines: left },
      { pieceId: 'cab-2', path: 'r.1', half: 'left', partId: 'cab-2:r.1left', lines: pairLines[0] },
      { pieceId: 'cab-2', path: 'r.1', half: 'right', partId: 'cab-2:r.1right', lines: pairLines[1] },
    ]);
    expect(runSwingMarks(new Map())).toEqual([]);
  });

  it('anchor 8: defaults off and uses the outer rectangle and part id of an 18 inch single base door', () => {
    const { room, wall } = fixture();
    expect(elevationSwingMarks(room, wall, 'front', DEFAULT_SETTINGS)).toEqual([]);
    const on = { ...room, swingMarks: true, doorDetails: false };
    const parts = elevationParts(on, wall, 'front', DEFAULT_SETTINGS).filter(({ kind }) => kind === 'face');
    expect(parts).toHaveLength(1);
    const { id, x, z, width, height } = parts[0];
    expect(id).toBe('cab-1:r');
    expect(elevationSwingMarks(on, wall, 'front', DEFAULT_SETTINGS)).toEqual([{
      partId: id,
      lines: [
        { x1: x, z1: z + height / 2, x2: x + width, z2: z + height },
        { x1: x, z1: z + height / 2, x2: x + width, z2: z },
      ],
    }]);
    const view = resolveWall(on, wall, 'front');
    const face = runScene(on, view, view.runs[0], DEFAULT_SETTINGS).faceLayouts.get('cab-1').faces[0];
    expect(face.hinge).toBe('left');
  });

  it('resolves wall sides, includes every run, and filters by exact elevation part ids', () => {
    const { room, wall, run } = fixture();
    room.swingMarks = true;
    wall.runs.push({
      ...run, id: 'run-2', x: 70,
      grid: gridFromItems('run-2', [{ id: 'cab-2', kind: 'cabinet', width: 18, face: { type: 'pair_door' } }]),
    }, {
      ...run, id: 'run-back', wallSide: 'back', x: 100,
      grid: gridFromItems('run-back', [{ id: 'cab-back', kind: 'cabinet', width: 18 }]),
    });
    for (const side of ['front', 'back']) {
      const entries = elevationSwingMarks(room, wall, side, DEFAULT_SETTINGS);
      const faceIds = elevationParts(room, wall, side, DEFAULT_SETTINGS)
        .filter(({ kind }) => kind === 'face').map(({ id }) => id);
      expect(entries.map(({ partId }) => partId)).toEqual(faceIds);
      expect(faceIds).toEqual(side === 'front' ? ['cab-1:r', 'cab-2:rleft', 'cab-2:rright'] : ['cab-back:r']);
      const ids = new Set([faceIds.at(-1), 'missing']);
      expect(elevationSwingMarks(room, wall, side, DEFAULT_SETTINGS, ids)).toEqual(entries.slice(-1));
      expect(elevationSwingMarks(room, wall, side, DEFAULT_SETTINGS, new Set())).toEqual([]);
    }
  });
});
