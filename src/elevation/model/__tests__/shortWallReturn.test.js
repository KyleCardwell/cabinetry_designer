import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../constants.js';
import { frontDepth } from '../corners.js';
import { gridFromItems } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBandEnds, runBands } from '../runBands.js';
import { runScene } from '../runScene.js';

const { profiles } = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const cr45 = structuredClone(profiles.find(({ id }) => id === 'cr45'));
for (const point of Object.values(cr45.geometry.points)) point[0] *= 1.5;
const settings = { ...DEFAULT_SETTINGS, runFlex: 0,
  defaultProfile: { ...DEFAULT_PROFILE, topMoldProfileId: 'tm3', crownProfileId: 'cr45' },
  sectionProfiles: [profiles.find(({ id }) => id === 'tm3'), cr45] };

const makeRun = (id, extra = {}) => ({
  id, cabinetTypeId: 2, heightMode: 'auto', x: 66, width: 30, depth: 13,
  overrides: {}, anchors: { right: true }, ends: {}, autoCount: false,
  grid: gridFromItems(id, [{ id: `${id}-box`, kind: 'cabinet', width: null }]), ...extra,
});
const makeWall = (id, extra = {}) => ({
  id, x1: 0, y1: 0, x2: 96, y2: 0, height: 96, thickness: 4.5,
  connections: { start: null, end: null }, profile: {}, openings: [], joints: [], runs: [], ...extra,
});

function setup({ depth = 13, reach = 16, neighbor = false, recess = false, wing = false,
  left = false, angle = 90, profile = {} } = {}) {
  const side = left ? 'left' : 'right';
  const x = left ? 0 : 96;
  const a = makeWall('A', { profile, runs: [makeRun('upper', { depth,
    x: left ? 0 : 66, anchors: { [side]: true } })] });
  const radians = angle * Math.PI / 180;
  const b = makeWall('B', { x1: left ? x + reach * Math.cos(radians) : x,
    y1: left ? reach * Math.sin(radians) : 0,
    x2: left ? x : x - reach * Math.cos(radians), y2: left ? 0 : reach * Math.sin(radians),
    runs: neighbor ? [makeRun('neighbor', { x: 0, width: 12, anchors: { left: true } })] : [],
  });
  if (recess) {
    a.recesses = [{ id: 'R', kind: 'recess', wallSide: 'front', offsetFrom: 'left', offsetAnchor: 'edge',
      offset: 48, width: 48, bottom: 0, height: 96, depth: 12, molding: 'crown' }];
    a.runs[0].recessId = 'R';
    a.runs[0].anchors = { right: { to: 'recess', recessId: 'R', edge: 'right' } };
  } else if (wing) {
    b.landings = { start: { wallId: 'A', side: 'front', ref: 'left', to: 'near', offset: 96 }, end: null };
    a.runs[0].anchors = { right: { to: 'wall', wallId: 'B' } };
  } else {
    a.connections[left ? 'start' : 'end'] = { wallId: 'B', endpoint: left ? 'end' : 'start' };
    b.connections[left ? 'end' : 'start'] = { wallId: 'A', endpoint: left ? 'start' : 'end' };
  }
  const room = syncRoom({ id: 'room', name: 'Room', profile: {}, wallOrder: recess ? ['A'] : ['A', 'B'],
    walls: recess ? [a] : [a, b] }, settings);
  const wall = resolveWall(room, room.walls[0]);
  const run = wall.runs[0];
  const scene = runScene(room, wall, run, settings);
  const bands = runBands(room, wall, run, settings, scene);
  const end = (kind) => bands[kind].ends[left ? 0 : 1];
  return { room, wall, run, scene, bands, end };
}

describe('DM5 step a short-wall molding returns', () => {
  it('anchor 1: returns crown past a 16-inch wall while top mold stays square', () => {
    const { run, end } = setup();
    expect(frontDepth(run, settings)).toBe(13.875);
    expect(end('crown')).toEqual({ type: 'return', x: 100.75, side: 96, facing: 1, returnLength: 2.625 });
    expect(end('topMold')).toEqual({ type: 'square', x: 96 });
  });

  it('anchor 2: keeps both moldings square against a 60-inch wall', () => {
    const { end } = setup({ reach: 60 });
    for (const kind of ['topMold', 'crown']) expect(end(kind)).toEqual({ type: 'square', x: 96 });
  });

  it('anchor 3: returns both moldings on a 24-inch-deep run past a 16-inch wall', () => {
    const { end } = setup({ depth: 24 });
    expect(end('topMold')).toEqual({ type: 'return', x: 96.25, side: 96, facing: 1, returnLength: 9.125 });
    expect(end('crown')).toEqual({ type: 'return', x: 100.75, side: 96, facing: 1, returnLength: 13.625 });
  });

  it('anchor 4: measures recess returns from the wall face and leaves other bands square', () => {
    const { room, wall, run, scene, end } = setup({ depth: 12, recess: true });
    expect(frontDepth(run, settings)).toBe(0.875);
    expect(end('crown')).toEqual({ type: 'return', x: 100.75, side: 96, facing: 1, returnLength: 5.625 });
    expect(end('topMold').returnLength).toBe(1.125);
    for (const kind of ['toeKick', 'countertop', 'furnitureBase']) {
      expect(runBandEnds(room, wall, run, settings, scene, kind, 0, 4)[1]).toEqual({ type: 'square', x: 96 });
    }
  });

  it('anchor 5: gives a matching corner crown return precedence over a short wall', () => {
    expect(setup({ neighbor: true }).end('crown').type).toBe('cope');
  });

  it('mirrors left returns and projects angled wall lengths toward the room', () => {
    expect(setup({ left: true }).end('crown'))
      .toEqual({ type: 'return', x: -4.75, side: 0, facing: -1, returnLength: 2.625 });
    const end = setup({ reach: 20, angle: 60 }).end('crown');
    expect(end).toMatchObject({ type: 'return', x: 100.75, side: 96, facing: 1 });
    expect(end.returnLength).toBeCloseTo(18.625 - 20 * Math.sin(Math.PI / 3), 10);
  });

  it('returns past landed wing walls only when their reach is short enough', () => {
    expect(setup({ wing: true }).end('crown'))
      .toEqual({ type: 'return', x: 100.75, side: 96, facing: 1, returnLength: 2.625 });
    expect(setup({ wing: true, reach: 60 }).end('crown')).toEqual({ type: 'square', x: 96 });
  });

  it('requires more than 1/64 inch of clearance and applies DM4 crown overhang rules', () => {
    for (const reach of [18.625, 18.625 - 1 / 128, 18.625 - 1 / 64]) {
      expect(setup({ reach }).end('crown')).toEqual({ type: 'square', x: 96 });
    }
    expect(setup({ reach: 18.625 - 1 / 32 }).end('crown').returnLength).toBe(1 / 32);
    expect(setup({ profile: { topMoldProfileId: 'none' } }).end('crown'))
      .toEqual({ type: 'return', x: 100.5, side: 96, facing: 1, returnLength: 2.375 });
  });
});
