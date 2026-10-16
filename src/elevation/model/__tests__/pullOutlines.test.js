import { describe, expect, it } from 'vitest';
import {
  CABINET_TYPE_IDS, DEFAULT_SETTINGS, elevationParts, elevationPulls, gridFromItems,
  pullOutlines, resolveSettings, resolveWall, runPulls,
} from '../index.js';

const bar = (centers, orientation = 'horizontal') => ({
  kind: 'pull', orientation, along: 4.75, across: 0.375, centers,
});

function fixture() {
  const run = {
    id: 'door-run', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 18, z: 4,
    height: 30.5, depth: 24, ends: { left: { type: 'none' }, right: { type: 'none' } },
    autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
    anchors: { left: true, right: false },
    grid: gridFromItems('door-run', [{ id: 'door', kind: 'cabinet', width: 18,
      face: { type: 'door', hinge: 'left' } }]),
  };
  const drawerRun = {
    ...run, id: 'drawer-run', x: 60,
    grid: gridFromItems('drawer-run', [{ id: 'drawer', kind: 'cabinet', width: 18,
      face: { type: 'drawer_front', pullCount: 3 } }]),
  };
  const wall = {
    id: 'wall', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {},
    runs: [run, drawerRun], openings: [],
  };
  const room = {
    id: 'room', profile: { ...DEFAULT_SETTINGS.defaultProfile }, walls: [wall], wallOrder: [wall.id],
  };
  return { room, wall, run };
}

describe('HP5 step a pull outlines', () => {
  it('anchor 1: draws the vertical base bar with its top at the rail centre', () => {
    expect(pullOutlines(bar([{ x: 23.5, z: 30.125 }], 'vertical'))).toEqual([[
      [23.6875, 27.9375], [23.6875, 32.3125, 1],
      [23.3125, 32.3125], [23.3125, 27.9375, 1],
    ]]);
  });

  it('anchor 2: draws the horizontal drawer bar with outgoing semicircle bulges', () => {
    expect(pullOutlines(bar([{ x: 15, z: 31 }]))).toEqual([[
      [12.8125, 30.8125], [17.1875, 30.8125, 1],
      [17.1875, 31.1875], [12.8125, 31.1875, 1],
    ]]);
  });

  it('anchor 3: draws each drawer centre in centre order', () => {
    expect(pullOutlines(bar([{ x: 7.5, z: 31 }, { x: 22.5, z: 31 }]))).toEqual([
      [[5.3125, 30.8125], [9.6875, 30.8125, 1], [9.6875, 31.1875], [5.3125, 31.1875, 1]],
      [[20.3125, 30.8125], [24.6875, 30.8125, 1], [24.6875, 31.1875], [20.3125, 31.1875, 1]],
    ]);
  });

  it('anchor 4: draws the horizontal corner bar with its outer end at the stile centre', () => {
    expect(pullOutlines(bar([{ x: 21.125, z: 32.5 }]))).toEqual([[
      [18.9375, 32.3125], [23.3125, 32.3125, 1],
      [23.3125, 32.6875], [18.9375, 32.6875, 1],
    ]]);
  });

  it('anchor 5: draws a knob as two semicircles using its along diameter', () => {
    expect(pullOutlines({ kind: 'knob', along: 1.25, across: 1.25,
      centers: [{ x: 23.5, z: 31.875 }] })).toEqual([[
      [24.125, 31.875, 1], [22.875, 31.875, 1],
    ]]);
  });

  it('anchor 6: draws a horizontal tab flush with the front top', () => {
    expect(pullOutlines({ kind: 'tab', orientation: 'vertical', along: 3, across: 0.5,
      centers: [{ x: 15, z: 33.75 }] })).toEqual([[
      [13.5, 33.5], [16.5, 33.5], [16.5, 34], [13.5, 34],
    ]]);
  });

  it('uses a tab rectangle for short bars, keeps equal dimensions rounded, and handles no centres', () => {
    for (const orientation of ['horizontal', 'vertical']) {
      expect(pullOutlines({ kind: 'pull', orientation, along: 1, across: 2,
        centers: [{ x: 0, z: 0 }] })).toEqual([[
        [-0.5, -1], [0.5, -1], [0.5, 1], [-0.5, 1],
      ]]);
    }
    expect(pullOutlines({ kind: 'pull', orientation: 'horizontal', along: 2, across: 2,
      centers: [{ x: 0, z: 0 }] })).toEqual([[[0, -1], [0, -1, 1], [0, 1], [0, 1, 1]]]);
    expect(pullOutlines(bar([]))).toEqual([]);
  });

  it('anchor 8: uses elevation face ids, draws all centres, and respects the switch and none picks', () => {
    const { room, wall } = fixture();
    const before = structuredClone({ room, wall, settings: DEFAULT_SETTINGS });
    const entries = elevationPulls(room, wall, 'front', DEFAULT_SETTINGS);
    const faces = elevationParts(room, wall, 'front', DEFAULT_SETTINGS).filter(({ kind }) => kind === 'face');
    expect(entries.map(({ partId }) => partId)).toEqual(faces.map(({ id }) => id));
    expect(entries.map(({ partId, outlines }) => [partId, outlines.length]))
      .toEqual([['door:r', 1], ['drawer:r', 3]]);
    const view = resolveWall(room, wall, 'front');
    expect(entries).toEqual(view.runs.flatMap((run) => runPulls(room, view, run, DEFAULT_SETTINGS).pulls
      .map((entry) => ({ partId: entry.partId, outlines: pullOutlines(entry) }))));
    for (const swingMarks of [true, false]) {
      expect(elevationPulls({ ...room, doorDetails: false, swingMarks }, wall, 'front', DEFAULT_SETTINGS))
        .toEqual(entries);
    }
    expect(elevationPulls({ ...room, showPulls: false }, wall, 'front', DEFAULT_SETTINGS)).toEqual([]);
    const noDoorPull = { ...room, settingsOverrides: { doorPullId: 'none' } };
    const settings = resolveSettings([
      { level: 'team', values: DEFAULT_SETTINGS },
      { level: 'room', values: noDoorPull.settingsOverrides },
    ]);
    expect(elevationPulls(noDoorPull, wall, 'front', settings)).toEqual(entries.slice(1));
    expect({ room, wall, settings: DEFAULT_SETTINGS }).toEqual(before);
  });

  it('resolves both wall faces, includes every run, filters exact ids, and omits faces without centres', () => {
    const { room, wall, run } = fixture();
    wall.runs.push({
      ...run, id: 'back-run', wallSide: 'back', x: 100,
      grid: gridFromItems('back-run', [{ id: 'pair', kind: 'cabinet', width: 18,
        face: { type: 'pair_door' } }]),
    }, {
      ...run, id: 'sliding-run', x: 90,
      grid: gridFromItems('sliding-run', [{ id: 'sliding', kind: 'cabinet', width: 18,
        face: { type: 'door', action: 'sliding' } }]),
    });
    for (const side of ['front', 'back']) {
      const entries = elevationPulls(room, wall, side, DEFAULT_SETTINGS);
      expect(entries.map(({ partId }) => partId)).toEqual(side === 'front'
        ? ['door:r', 'drawer:r'] : ['pair:rleft', 'pair:rright']);
      const faces = elevationParts(room, wall, side, DEFAULT_SETTINGS).filter(({ kind }) => kind === 'face');
      expect(entries.every(({ partId }) => faces.some(({ id }) => id === partId))).toBe(true);
      expect(elevationPulls(room, wall, side, DEFAULT_SETTINGS, new Set([entries.at(-1).partId, 'missing'])))
        .toEqual(entries.slice(-1));
      expect(elevationPulls(room, wall, side, DEFAULT_SETTINGS, new Set())).toEqual([]);
    }
  });
});
