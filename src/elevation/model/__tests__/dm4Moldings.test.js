import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../constants.js';
import { bandParts } from '../bandParts.js';
import { frontDepth } from '../corners.js';
import { stackChain, verticalChains } from '../dimensions.js';
import { gridFromItems } from '../grid.js';
import { MOLDING_NOTES } from '../heightBands.js';
import { moldingPast, moldingProfiles } from '../moldingProfiles.js';
import { partNumbers, wallMoldingBadges } from '../partNumbers.js';
import { boxTopOf, resolveProfile } from '../profile.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { runSide } from '../runSide.js';
import { runMoldings, runTop } from '../tops.js';
import { shippingList } from '../../../reports/shippingList.js';

const { profiles } = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const cr45 = structuredClone(profiles.find(({ id }) => id === 'cr45'));
for (const point of Object.values(cr45.geometry.points)) point[0] *= 1.5;
const settings = { ...DEFAULT_SETTINGS, sectionProfiles: [profiles.find(({ id }) => id === 'tm3'), cr45] };

function setup(crownProfileId, topMoldProfileId, { shop = {}, roomProfile, wallProfile = {}, top } = {}) {
  const using = { ...settings, defaultProfile: { ...DEFAULT_PROFILE, crownProfileId, topMoldProfileId, ...shop } };
  const room = syncRoom({ id: 'room', name: 'Room', profile: roomProfile ?? {}, wallOrder: ['wall'], walls: [{
    id: 'wall', x1: 0, y1: 0, x2: 120, y2: 0, height: 96, thickness: 4.5,
    connections: { start: null, end: null }, profile: wallProfile, openings: [], runs: [{
      id: 'upper', cabinetTypeId: 2, heightMode: 'auto', x: 20, width: 60, depth: 12,
      overrides: {}, anchors: {}, ends: {}, top,
      autoCount: false, grid: gridFromItems('upper', [{ id: 'box', kind: 'cabinet', width: null }]),
    }],
  }] }, using);
  const wall = resolveWall(room, room.walls[0]);
  const run = wall.runs[0];
  const profile = resolveProfile(using, room, wall);
  expect(run.z + run.height).toBe(90);
  expect(boxTopOf(profile)).toBe(90);
  expect(runTop(wall, run, profile).height).toBe(top === 'topMold' ? 3 : 6);
  const bands = runBands(room, wall, run, using, runScene(room, wall, run, using));
  const numbers = partNumbers(room, using);
  return { room, wall, run, profile, using, bands, numbers,
    resolved: moldingProfiles(profile, using),
    parts: bandParts(room, room.walls[0], 'front', using),
    side: runSide(room, wall, run, using).filter(({ piece }) => ['top_mold', 'crown'].includes(piece)),
    badges: wallMoldingBadges(room, wall, using, numbers.byKey),
    shipping: shippingList(room, using),
    chains: [stackChain(room, wall, [run], using), verticalChains(room, wall, { upperRun: run }, using)],
  };
}
const codes = ({ resolved }) => resolved.warnings.map(({ code }) => code);
const moldingNames = ({ numbers }) => numbers.parts.filter(({ kind }) => kind === 'molding').map(({ molding }) => molding);
const shippingNames = ({ shipping }) => shipping.rows.filter(({ kind }) => kind === 'molding').map(({ key }) => key);
const segments = ({ chains }) => chains.map(({ inner }) => inner.filter(({ kind }) => kind === 'molding')
  .map(({ start, end }) => [start, end]));

describe('DM4 step a crown and top mold picks', () => {
  it('anchor 1: draws both picked moldings at the original heights without warnings', () => {
    const result = setup('cr45', 'tm3');
    expect(result.bands.topMold).toMatchObject({ z: 90, height: 3 });
    expect(result.bands.crown).toMatchObject({ z: 91.5, height: 4.5 });
    expect(codes(result)).toEqual([]);
    expect(result.resolved.picked).toEqual({ topMold: 'profile', crown: 'profile' });
    expect(moldingNames(result)).toEqual(['topMold', 'crown']);
    expect(segments(result)).toEqual([[[90, 96]], [[90, 96]]]);
  });

  it('anchor 2: crown None draws only top mold and warns about the three-inch gap', () => {
    const result = setup('none', 'tm3');
    expect(result.bands.crown).toBeNull();
    expect(result.bands.topMold).toMatchObject({ z: 90, height: 3 });
    expect(result.side.map(({ piece }) => piece)).toEqual(['top_mold']);
    expect(codes(result)).toEqual(['top-mold-gap']);
    expect(MOLDING_NOTES['top-mold-gap'](result.resolved.warnings[0]))
      .toBe('Top mold stops 3" below the top of crown.');
    expect(moldingNames(result)).toEqual(['topMold']);
    expect(shippingNames(result)).toEqual(['molding:topMold']);
    expect(result.badges.map(({ molding }) => molding)).toEqual(['topMold']);
    expect(segments(result)).toEqual([[[90, 93]], [[90, 93]]]);
    for (const gap of [0, 1 / 64]) {
      expect(codes(setup('none', 'tm3', { shop: { topMoldHeight: 6 - gap } }))).toEqual([]);
    }
  });

  it('anchor 3: top mold None puts crown on the faces with no top mold number', () => {
    const result = setup('cr45', 'none');
    expect(result.bands.topMold).toBeNull();
    expect(result.bands.crown).toMatchObject({ x: 15.5, z: 91.5, height: 4.5, width: 69 });
    expect(result.side[0]).toMatchObject({ piece: 'crown', z: 91.5, height: 4.5,
      back: frontDepth(result.run, result.using), front: frontDepth(result.run, result.using) + 4.5 });
    expect(moldingPast(result.resolved, 'crown', result.using)).toBe(4.5);
    expect(result.parts[0].front).toBe(frontDepth(result.run, result.using) + 4.5);
    expect(codes(result)).toEqual(['crown-gap']);
    expect(moldingNames(result)).toEqual(['crown']);
    expect(shippingNames(result)).toEqual(['molding:crown']);
    expect(result.badges.map(({ molding }) => molding)).toEqual(['crown']);
    expect(segments(result)).toEqual([[[90, 96]], [[90, 96]]]);
  });

  it('anchor 4: both None omit bands, parts, numbers, shipping lines and molding warnings', () => {
    const result = setup('none', 'none');
    expect(result.bands.topMold).toBeNull();
    expect(result.bands.crown).toBeNull();
    expect(result.side).toEqual([]);
    expect(result.parts).toEqual([]);
    expect(moldingNames(result)).toEqual([]);
    expect(result.badges).toEqual([]);
    expect(shippingNames(result)).toEqual([]);
    expect(codes(result)).toEqual([]);
    expect(segments(result)).toEqual([[], []]);
  });

  it('anchor 5: unpicked shop values inherit, warn and leave the box unchanged without drawing bands', () => {
    for (const value of [null, undefined]) {
      const result = setup(value, value);
      expect(result.resolved.picked).toEqual({ crown: 'unpicked', topMold: 'unpicked' });
      expect(result.bands.crown).toBeNull();
      expect(result.bands.topMold).toBeNull();
      expect(result.parts).toEqual([]);
      expect(result.side).toEqual([]);
      expect(shippingNames(result)).toEqual([]);
      expect(moldingNames(result)).toEqual([]);
      expect(codes(result)).toEqual(['crown-unpicked', 'top-mold-unpicked']);
      expect(segments(result)).toEqual([[], []]);
    }
  });

  it('anchor 6: stored room/wall null inherits shop picks; topMold tops never draw crown', () => {
    const result = setup('cr45', 'tm3', { roomProfile: { crownProfileId: null, topMoldProfileId: null },
      wallProfile: { crownProfileId: null, topMoldProfileId: null } });
    expect(result.profile).toMatchObject({ crownProfileId: 'cr45', topMoldProfileId: 'tm3' });
    expect(codes(result)).toEqual([]);
    const none = setup('cr45', 'tm3', { roomProfile: { crownProfileId: 'none', topMoldProfileId: 'none' } });
    expect(none.resolved.picked).toEqual({ crown: 'none', topMold: 'none' });
    expect(none.parts).toEqual([]);
    const tallTop = setup('cr45', 'tm3', { shop: { topMoldHeight: 7 } });
    expect(codes(tallTop)).toEqual(['top-mold-above-crown']);
    expect(segments(tallTop)).toEqual([[[90, 97]], [[90, 97]]]);
    const missing = setup('none', 'missing');
    expect(missing.side[0]).toMatchObject({ piece: 'top_mold', z: 90, height: 3 });
    const topMold = setup('cr45', 'tm3', { top: 'topMold' });
    expect(topMold.bands.crown).toBeNull();
    expect(runMoldings(topMold.wall, topMold.run, topMold.profile, topMold.using))
      .toEqual({ topMold: true, crown: false });
    for (const top of ['none', 'stone', 'wood']) {
      expect(runMoldings(result.wall, { ...result.run, top }, result.profile, result.using))
        .toEqual({ topMold: false, crown: false });
    }
  });
});
