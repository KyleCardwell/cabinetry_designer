import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auto, room as buildRoom, run as buildRun, wall as buildWall } from '../../../test/builders.js';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../constants.js';
import { clipReturnEdge, endEdgeX, frontContour } from '../bandEnds.js';
import { frontDepth } from '../corners.js';
import { furnitureBaseGroups } from '../furnitureBaseGroups.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBandEnds, runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { flattenOutline, outlineBounds } from '../sectionProfileOutline.js';

const { profiles } = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const cr45 = structuredClone(profiles.find(({ id }) => id === 'cr45'));
for (const point of Object.values(cr45.geometry.points)) point[0] *= 1.5;
const settings = { ...DEFAULT_SETTINGS, runFlex: 0,
  defaultProfile: { ...DEFAULT_PROFILE, topMoldProfileId: 'tm3', crownProfileId: 'cr45' },
  sectionProfiles: [profiles.find(({ id }) => id === 'tm3'), cr45] };

function setup({ depth = 13, reach = 16, neighbor = false, recess = false, wing = false,
  left = false, angle = 90, profile = {}, base = false, runProps = {} } = {}, using = settings) {
  const side = left ? 'left' : 'right';
  const x = left ? 0 : 96;
  const a = buildWall({ id: 'A', x2: 96, profile, runs: [buildRun({ id: base ? 'base' : 'upper',
    cabinetTypeId: base ? 1 : 2, heightMode: 'auto', depth, width: 30, ends: {}, autoCount: false,
    items: [auto('box')], x: left ? 0 : 66, anchors: { [side]: true }, ...runProps })] });
  const radians = angle * Math.PI / 180;
  const b = buildWall({ id: 'B', x1: left ? x + reach * Math.cos(radians) : x,
    y1: left ? reach * Math.sin(radians) : 0,
    x2: left ? x : x - reach * Math.cos(radians), y2: left ? 0 : reach * Math.sin(radians),
    runs: neighbor ? [buildRun({ id: 'neighbor', cabinetTypeId: base ? 1 : 2, heightMode: 'auto',
      x: 0, width: 12, depth: 13, ends: {}, autoCount: false, items: [auto('neighbor-box')],
      anchors: { left: true } })] : [],
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
  const room = syncRoom(buildRoom({ id: 'room', name: 'Room',
    profile: base ? { baseKind: 'furniture_base' } : {}, wallOrder: recess ? ['A'] : ['A', 'B'],
    walls: recess ? [a] : [a, b] }), using);
  const wall = resolveWall(room, room.walls[0]);
  const run = wall.runs[0];
  const scene = runScene(room, wall, run, using);
  const bands = runBands(room, wall, run, using, scene);
  const end = (kind) => (bands[kind]?.ends ?? runBandEnds(room, wall, run, using, scene, kind,
    kind === 'countertop' ? run.z + run.height : 0, kind === 'countertop' ? bands.top.height : 4))[left ? 0 : 1];
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

  it('anchor 4: measures recess returns from the wall face and leaves toe kicks square', () => {
    const { room, wall, run, scene, end } = setup({ depth: 12, recess: true });
    expect(frontDepth(run, settings)).toBe(0.875);
    expect(end('crown')).toEqual({ type: 'return', x: 100.75, side: 96, facing: 1, returnLength: 5.625 });
    expect(end('topMold').returnLength).toBe(1.125);
    expect(runBandEnds(room, wall, run, settings, scene, 'toeKick', 0, 4)[1]).toEqual({ type: 'square', x: 96 });
    expect(end('countertop')).toMatchObject({ type: 'return', x: 96.75, side: 96, facing: 1, returnLength: 1.625 });
    expect(end('furnitureBase')).toMatchObject({ type: 'return', x: 96.8125, side: 96, facing: 1, returnLength: 1.6875 });
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

describe('DM5 step b clipped short-wall return profiles', () => {
  const edgeOf = (band, facing = 1) => frontContour(band.outline, facing);
  const expectEdge = (edge, points) => {
    expect(edge).toHaveLength(points.length);
    edge.forEach(([x, z, bulge], index) => {
      expect(x).toBeCloseTo(points[index][0], 10);
      expect(z).toBeCloseTo(points[index][1], 10);
      expect(bulge).toBe(0);
    });
  };

  it('anchor 1: clips at 98 1/8, shifts the kept profile back to the side, and stops elevation lines there', () => {
    const { bands, end } = setup();
    const ref = bands.crown.z + bands.crown.height;
    const edge = edgeOf(bands.crown);
    expectEdge(edge, [[96, ref - 4.5], [96, ref - 3.1],
      [98.625, ref - 1], [98.625, ref]]);
    expect(endEdgeX(edge, ref - 4, 1)).toBe(96);
    expect(endEdgeX(edge, ref - 2, 1)).toBeCloseTo(97.375, 10);
    expect(outlineBounds(bands.crown.outline).maxX).toBeCloseTo(98.625, 10);
    expect(bands.crown.x + bands.crown.width).toBeCloseTo(98.625, 10);
    expect(bands.crown.lines.find(({ z1 }) => z1 === ref - 4).x2).toBe(96);
    expect(end('crown')).toEqual({ type: 'return', x: 100.75, side: 96, facing: 1, returnLength: 2.625 });
    expectEdge(edgeOf(bands.topMold), [[96, bands.topMold.z], [96, bands.topMold.z + bands.topMold.height]]);
  });

  it('anchors 3 and 4: preserves full crown and top mold profiles when the return covers their past', () => {
    for (const options of [{ depth: 24 }, { depth: 12, recess: true }]) {
      const { bands } = setup(options);
      const ref = bands.crown.z + bands.crown.height;
      expectEdge(edgeOf(bands.crown), [[97, ref - 4.5], [97, ref - 4],
        [100.75, ref - 1], [100.75, ref]]);
      const z = bands.topMold.z;
      expectEdge(edgeOf(bands.topMold), [[96.25, z], [96.25, z + 0.75],
        [96.125, z + 0.75], [96.125, z + 3]]);
    }
  });

  it('left mirror: keeps the same cut heights and reflected profile', () => {
    const { bands } = setup({ left: true });
    const ref = bands.crown.z + bands.crown.height;
    const edge = edgeOf(bands.crown, -1);
    expectEdge(edge, [[0, ref - 4.5], [0, ref - 3.1],
      [-2.625, ref - 1], [-2.625, ref]]);
    expect(endEdgeX(edge, ref - 4, -1)).toBe(0);
    expect(endEdgeX(edge, ref - 2, -1)).toBeCloseTo(-1.375, 10);
  });

  it('arc anchor: splits a quarter-circle with the original radius and outward geometry on either side', () => {
    for (const facing of [1, -1]) {
      const original = [[0, 0, facing * Math.tan(Math.PI / 8)], [facing, 1, 0]];
      const saved = structuredClone(original);
      const edge = clipReturnEdge(original, { x: facing, side: 0, facing, returnLength: 0.5 });
      const crossingZ = 1 - Math.sqrt(0.75);
      expect(edge).toHaveLength(3);
      expect(edge[1][0]).toBe(0);
      expect(edge[1][1]).toBeCloseTo(crossingZ, 10);
      expect(edge[1][2]).toBeCloseTo(facing * Math.tan(Math.PI / 12), 10);
      expect(edge[2][0]).toBeCloseTo(facing * 0.5, 10);
      for (const [x, z] of flattenOutline(edge.slice(1))) {
        expect(facing * x).toBeGreaterThanOrEqual(-1e-10);
        expect(Math.abs(Math.hypot(x + facing * 0.5, z - 1) - 1)).toBeLessThan(1e-6);
      }
      expect(original).toEqual(saved);
    }
  });

  it('leaves free ends and full returns unchanged, and shifts arcs wholly outward of the cut back', () => {
    const edge = [[1, 0, Math.tan(Math.PI / 8)], [2, 1, 0]];
    for (const returnLength of [undefined, 2, 3]) {
      expect(clipReturnEdge(edge, { x: 2, side: 0, facing: 1, returnLength })).toBe(edge);
    }
    expect(clipReturnEdge(edge, { x: 2, side: 0, facing: 1, returnLength: 1.5 }))
      .toEqual([[0.5, 0, Math.tan(Math.PI / 8)], [1.5, 1, 0]]);
  });

  it('also clips the top mold when only its frontmost part returns', () => {
    const { bands, end } = setup({ reach: 14.0625 });
    const z = bands.topMold.z;
    expect(end('topMold').returnLength).toBe(0.0625);
    expectEdge(edgeOf(bands.topMold), [[96.0625, z], [96.0625, z + 0.75],
      [96, z + 0.75], [96, z + 3]]);
  });

  it('merges an inward stretch between kept sections and splits both crossings of a single arc', () => {
    const end = { x: 4, side: 0, facing: 1, returnLength: 2 };
    expectEdge(clipReturnEdge([[4, 0], [1, 1], [0, 2], [1, 3], [4, 4]], end),
      [[2, 0], [0, 2 / 3], [0, 10 / 3], [2, 4]]);
    const edge = clipReturnEdge([[0, -1, 1], [0, 1, 0]], { x: 1, side: 0, facing: 1, returnLength: 0.5 });
    expect(edge).toHaveLength(4);
    expect(edge[1][2]).toBeCloseTo(Math.tan(Math.PI / 6), 10);
    for (const [x, z] of flattenOutline([edge[1], [...edge[2].slice(0, 2), 0]])) {
      expect(x).toBeGreaterThanOrEqual(-1e-10);
      expect(Math.abs(Math.hypot(x + 0.5, z) - 1)).toBeLessThan(1e-6);
    }
  });
});

describe('FX2 step a short-wall furniture base and countertop returns', () => {
  it('anchors 1 and 8: draws only the returned base and orders to the wall with scribe', () => {
    const { room, bands, end } = setup({ base: true, depth: 15 });
    expect(end('furnitureBase')).toMatchObject({
      type: 'return', x: 96.8125, side: 96, facing: 1, returnLength: 0.6875,
    });
    expect(bands.furnitureBases[0].x).toBe(65.1875);
    expect(bands.furnitureBases[0].x + bands.furnitureBases[0].width).toBe(96.6875);
    expect(furnitureBaseGroups(room, settings)).toMatchObject([{
      width: 30.8125, orderedWidth: 31.3125, orderedHeight: 4.5,
      steps: [{ x1: 65.1875, x2: 96 }],
    }]);
  });

  it('anchor 2: leaves the furniture base square against a 60-inch wall', () => {
    const { bands, end } = setup({ base: true, depth: 15, reach: 60 });
    expect(end('furnitureBase')).toEqual({ type: 'square', x: 96 });
    expect(bands.furnitureBases[0].x + bands.furnitureBases[0].width).toBe(96);
  });

  it('anchor 3: draws the stone top only 5/8 inch past the wall', () => {
    const { bands, end } = setup({ base: true, depth: 15 });
    expect(end('countertop')).toMatchObject({
      type: 'return', x: 96.75, side: 96, facing: 1, returnLength: 0.625,
    });
    expect(bands.countertop.x + bands.countertop.width).toBe(96.625);
    expect(bands.countertops).toEqual([bands.countertop]);
  });

  it('anchor 4: uses front overhang rather than side overhang to clear the wall', () => {
    const { bands, end } = setup({ base: true, depth: 15, runProps: { topOverhang: { front: 0 } } });
    expect(end('countertop')).toEqual({ type: 'square', x: 96 });
    expect(bands.countertop.x + bands.countertop.width).toBe(96);
  });

  it('anchor 5: preserves the full side overhang when the return is long enough', () => {
    const { bands, end } = setup({ base: true, depth: 24 });
    expect(end('countertop')).toMatchObject({ type: 'return', x: 96.75, returnLength: 9.625 });
    expect(bands.countertop.x + bands.countertop.width).toBe(96.75);
  });

  it('anchor 6: returns furniture base past a short landed wing wall', () => {
    const { bands, end } = setup({ base: true, depth: 15, wing: true });
    expect(end('furnitureBase')).toMatchObject({
      type: 'return', x: 96.8125, side: 96, facing: 1, returnLength: 0.6875,
    });
    expect(bands.furnitureBases[0].x + bands.furnitureBases[0].width).toBe(96.6875);
  });

  it('anchor 7: leaves toe kicks square against a short wall', () => {
    const { bands, end } = setup({ base: true, depth: 15, profile: { baseKind: 'toe_kick' } });
    expect(end('toeKick')).toEqual({ type: 'square', x: 96 });
    expect(bands.toeKicks[0].x + bands.toeKicks[0].width).toBe(96);
  });

  it('mirrors plain returns on the left and measures recess returns from the wall face', () => {
    const { room, bands, end } = setup({ base: true, depth: 15, left: true });
    expect(end('furnitureBase')).toMatchObject({
      type: 'return', x: -0.8125, side: 0, facing: -1, returnLength: 0.6875,
    });
    expect(bands.furnitureBases[0].x).toBe(-0.6875);
    expect(end('countertop')).toMatchObject({
      type: 'return', x: -0.75, side: 0, facing: -1, returnLength: 0.625,
    });
    expect(bands.countertop.x).toBe(-0.625);
    expect(furnitureBaseGroups(room, settings)[0]).toMatchObject({ width: 30.8125, orderedWidth: 31.3125 });
    const recessed = setup({ base: true, depth: 12, recess: true });
    expect(recessed.end('furnitureBase')).toMatchObject({ type: 'return', returnLength: 1.6875 });
    expect(recessed.end('countertop')).toMatchObject({ type: 'return', returnLength: 1.625 });
  });

  it('requires more than 1/64 inch of clearance for both bands', () => {
    for (const [kind, front] of [['furnitureBase', 16.6875], ['countertop', 16.625]]) {
      for (const clearance of [0, 1 / 128, 1 / 64]) {
        expect(setup({ base: true, depth: 15, reach: front - clearance }).end(kind))
          .toEqual({ type: 'square', x: 96 });
      }
      expect(setup({ base: true, depth: 15, reach: front - 1 / 32 }).end(kind).returnLength).toBe(1 / 32);
    }
  });

  it('includes the picked furniture profile and wood nosing projections in the band fronts', () => {
    const geometry = structuredClone(profiles.find(({ id }) => id === 'fb4').geometry);
    for (const point of Object.values(geometry.points)) point[0] += 0.25;
    const using = { ...settings, sectionProfiles: [
      ...settings.sectionProfiles,
      { id: 'projecting-base', kind: 'furniture_base', geometry, drawnPoints: { elevation: [] } },
      { id: 'projecting-nosing', kind: 'nosing', geometry, drawnPoints: { elevation: [] } },
    ] };
    const { end } = setup({ base: true, depth: 15,
      profile: { furnitureBaseProfileId: 'projecting-base', nosingProfileId: 'projecting-nosing' },
      runProps: { top: 'wood', topOverhang: { front: 0.125, right: 2 } },
    }, using);
    expect(end('furnitureBase')).toMatchObject({
      type: 'return', x: 97.0625, side: 96, facing: 1, returnLength: 0.9375,
    });
    expect(end('countertop')).toMatchObject({
      type: 'return', x: 98.25, side: 96, facing: 1, returnLength: 0.25,
    });
  });
});
