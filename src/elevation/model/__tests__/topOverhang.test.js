import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { topOverhangs } from '../topOverhang.js';

const nz1 = {
  id: 'nz1', name: 'Chamfer nosing', kind: 'nosing',
  geometry: {
    units: 'in', points: { a: [0, 0], b: [0.25, 0], c: [0.5, -0.25], d: [0.5, -1.5], e: [0, -1.5] },
    loops: [{ id: 'L1', closed: true, segs: ['a', 'b', 'c', 'd', 'e'].map((from, i, ids) => ({
      type: 'line', from, to: ids[(i + 1) % ids.length],
    })) }],
  },
  drawnPoints: { elevation: ['c'] },
};
const settings = { ...DEFAULT_SETTINGS, sectionProfiles: [nz1] };
const room = { profile: { nosingProfileId: 'nz1' } };
const wall = { profile: {} };
const run = { cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 30, width: 36, depth: 24, z: 4, height: 30.5,
  style: 'euro', ends: { left: { type: 'none' }, right: { type: 'none' } },
  top: 'wood', overrides: { countertopThickness: 1.5 } };
const plain = { front: 0.75, back: 0, left: 0.75, right: 0.75 };
const nosed = { front: 0, back: 0, left: 0, right: 0 };

describe('SPEC-50.9 step 501 top overhang defaults', () => {
  it('defaults stone and wood without a closed nosing to the shop overhang (anchor 1)', () => {
    expect(topOverhangs(room, wall, { ...run, top: 'stone' }, settings)).toEqual(plain);
    expect(topOverhangs(room, wall, { ...run, top: undefined }, settings)).toEqual(plain);
    for (const nosingProfileId of [null, 'missing']) {
      expect(topOverhangs(room, wall, { ...run, overrides: { nosingProfileId } }, settings)).toEqual(plain);
    }
    const open = structuredClone(settings);
    open.sectionProfiles[0].geometry.loops[0].closed = false;
    expect(topOverhangs(room, wall, run, open)).toEqual(plain);
    const custom = { ...settings, bandDepths: { countertopOverhang: 1.25 } };
    expect(topOverhangs(room, wall, { ...run, top: 'stone', topOverhang: { front: 0 } }, custom))
      .toEqual({ front: 0, back: 0, left: 1.25, right: 1.25 });
  });

  it('defaults nosed wood to zero and retains explicit sides through pick changes (anchors 2–3)', () => {
    expect(topOverhangs(room, wall, run, settings)).toEqual(nosed);
    expect(topOverhangs(room, wall, { ...run, topOverhang: { front: 0.5, left: 12 } }, settings))
      .toEqual({ front: 0.5, back: 0, left: 12, right: 0 });
    const typed = { ...run, topOverhang: { front: 0, back: 2, left: 12, right: 0.5 } };
    expect(topOverhangs(room, wall, typed, settings)).toEqual(typed.topOverhang);
    expect(topOverhangs(room, wall, { ...typed, overrides: { nosingProfileId: null } }, settings))
      .toEqual(typed.topOverhang);
    expect(topOverhangs({}, { profile: { nosingProfileId: 'nz1' } }, run, settings)).toEqual(nosed);
    expect(topOverhangs({}, wall, { ...run, overrides: { nosingProfileId: 'nz1' } }, settings)).toEqual(nosed);
    // A closed nosing still replaces the core edge when its forward projection is zero.
    const zeroProjection = structuredClone(settings);
    for (const point of Object.values(zeroProjection.sectionProfiles[0].geometry.points)) point[0] -= 0.5;
    expect(topOverhangs(room, wall, run, zeroProjection)).toEqual(nosed);
  });
});
