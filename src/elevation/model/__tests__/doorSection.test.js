import { LEGACY_DOOR_DESIGNS as DOOR_DESIGNS } from './fixtures/legacyDoorDesigns.js';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { doorSection, doorSectionDimensions } from '../doorSection.js';
import { profileDoorGhost } from '../profileGhost.js';
import { isProfileGeometry } from '../sectionProfiles.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [, BEAD, CROWN] = sample.profiles;
const [FIVE, SLAB, SLAB_AM] = DOOR_DESIGNS;
const line = (from, to) => ({ type: 'line', from, to });
const ROUND = {
  id: 'sp-round', name: 'Round 1/4', kind: 'door_outside', version: 1, archived: false, drawnPoints: { elevation: [] },
  geometry: {
    units: 'in',
    points: { a: [0.25, 0], b: [0, -0.25], c: [0, -0.8125] },
    loops: [{ id: 'L1', closed: false, segs: [{ type: 'arc', from: 'a', to: 'b', center: [0.25, -0.25], ccw: true }, line('b', 'c')] }],
  },
};
const STEP = {
  id: 'sp-step', name: 'Step', kind: 'door_inside', version: 1, archived: true, drawnPoints: { elevation: [] },
  geometry: {
    units: 'in',
    points: { p: [-0.25, 0], q: [-0.25, -0.125], r: [0, -0.125] },
    loops: [{ id: 'L1', closed: false, segs: [line('p', 'q'), line('q', 'r')] }],
  },
};
const BEAD5 = {
  id: 'sp-bead5', name: 'Flush bead 5/16', kind: 'door_outside', stretch: { y: -0.25 },
  geometry: {
    units: 'in',
    points: { a: [-0.3125, 0], q: [-0.0625, 0], b: [0, 0], c: [0, -0.8125], d: [-0.3125, -0.8125] },
    loops: [{ id: 'L1', closed: true, segs: [line('a', 'q'), line('q', 'b'), line('b', 'c'), line('c', 'd'), line('d', 'a')] }],
  },
};
const STICK2 = {
  id: 'sp-stick2', name: 'Stick 1/4', kind: 'door_inside', stretch: { y: -0.28125 },
  geometry: {
    units: 'in', points: { s1: [-0.25, 0], s2: [0, -0.25], s3: [0, -0.3125] },
    loops: [{ id: 'L1', closed: false, segs: [line('s1', 's2'), line('s2', 's3')] }],
  },
};
const AM = {
  id: 'sp-am', name: 'Applied 1', kind: 'applied_molding',
  geometry: {
    units: 'in',
    points: { u: [-0.25, 0], v: [0.75, 0], w: [0.75, 0.375], k: [-0.25, 0.375] },
    loops: [{ id: 'L1', closed: true, segs: [line('u', 'v'), line('v', 'w'), line('w', 'k'), line('k', 'u')] }],
  },
};
const LIBRARY = [ROUND, STEP, BEAD, CROWN];
const picks = ({ applied = null, ...profiles }) => ({
  ...DEFAULT_DOOR_STYLE, profiles: { ...DEFAULT_DOOR_STYLE.profiles, ...profiles },
  appliedMoldings: applied === null ? [] : [{ profileId: applied, offset: 0 }],
});

describe('SPEC-48.4 the door style half section', () => {
  it('is the outside-edge door ghost for a 5-piece style with nothing picked', () => {
    expect(doorSection(DEFAULT_DOOR_STYLE, FIVE, LIBRARY)).toEqual({
      units: 'in', body: profileDoorGhost('door_outside', DEFAULT_DOOR_STYLE), placed: [], cuts: [], skipped: [],
    });
  });

  it('stretches outside to the back and inside to the panel face, then cuts the stretched geometry', () => {
    const style = { ...picks({ outside: BEAD5.id, inside: STICK2.id }), thickness: 1, panel: { thickness: 0.25 } };
    const section = doorSection(style, FIVE, [BEAD5, STICK2]);
    expect(section.placed[0].geometry.points).toEqual({
      a: [-0.3125, 0], q: [-0.0625, 0], b: [0, 0], c: [0, -1], d: [-0.3125, -1],
    });
    expect(section.placed[1].geometry.points).toEqual({ s1: [2.75, 0], s2: [3, -0.25], s3: [3, -0.75] });
    expect(section.cuts).toEqual([{ slot: 'inside', geometry: {
      units: 'in', points: { s1: [2.75, 0], s2: [3, -0.25], s3: [3, -0.75], _e: [3, 0] },
      loops: [{ id: 'L1', closed: true, segs: [line('s1', 's2'), line('s2', 's3'), line('s3', '_e'), line('_e', 's1')] }],
    } }]);
    const panel = { ...STICK2, id: 'panel', kind: 'door_panel' };
    const applied = { ...STICK2, id: 'applied', kind: 'applied_molding' };
    const all = doorSection({ ...style, profiles: { ...style.profiles, panel: panel.id }, appliedMoldings: [{ profileId: applied.id, offset: 0 }] }, FIVE,
      [BEAD5, STICK2, panel, applied]);
    expect(all.placed.map(({ geometry }) => Object.values(geometry.points).at(-1)[1])).toEqual([-1, -0.75, -1, -1]);
    const shifted = doorSection({ ...style, profiles: { ...style.profiles, panel: panel.id }, appliedMoldings: [
      { profileId: applied.id, offset: -0.5 }, { profileId: 'gone', offset: 1 },
    ] }, FIVE, [BEAD5, STICK2, panel, applied]);
    expect(shifted.placed.at(-1)).toMatchObject({ slot: 'applied', index: 0,
      geometry: { points: { s1: [2.25, 0], s2: [2.5, -0.25], s3: [2.5, -1] } } });
    expect(shifted.cuts.at(-1)).toMatchObject({ slot: 'applied', index: 0,
      geometry: { points: { s1: [2.25, 0], _e: [2.5, 0] } } });
    expect(shifted.skipped).toEqual(['applied']);
    expect(doorSection({ ...style, thickness: 0.75 }, FIVE, [BEAD5, STICK2]).placed[0].geometry.points.c).toEqual([0, -0.75]);
    expect(BEAD5.geometry.points.c).toEqual([0, -0.8125]);
    expect(STICK2.geometry.points.s3).toEqual([0, -0.3125]);
  });

  it('keeps the default inside depth and places too-thin profiles and their cuts unstretched', () => {
    const style = picks({ inside: STICK2.id });
    expect(doorSection(style, FIVE, [STICK2]).placed[0].geometry.points.s3).toEqual([3, -0.3125]);
    const thin = doorSection({ ...style, thickness: 0.75 }, FIVE, [STICK2]);
    expect(thin.placed[0].geometry.points).toEqual({ s1: [2.75, 0], s2: [3, -0.25], s3: [3, -0.3125] });
    expect(thin.cuts[0].geometry.points.s3).toEqual([3, -0.3125]);
    const outside = doorSection({ ...picks({ outside: BEAD5.id }), thickness: 0.25 }, SLAB, [BEAD5]);
    expect(outside.placed[0].geometry).toEqual(BEAD5.geometry);
  });

  it('places each pick on its line, cuts open lines back to the face, and skips picks that don\'t fit', () => {
    const section = doorSection(picks({ outside: 'sp-round', inside: 'sp-step', panel: 'gone', applied: 'sp-bead' }), FIVE, LIBRARY);
    expect(section.placed).toEqual([
      { slot: 'outside', profileId: 'sp-round', name: 'Round 1/4', geometry: ROUND.geometry },
      {
        slot: 'inside', profileId: 'sp-step', name: 'Step',
        geometry: { ...STEP.geometry, points: { p: [2.75, 0], q: [2.75, -0.125], r: [3, -0.125] } },
      },
      {
        slot: 'applied', index: 0, profileId: 'sp-bead', name: 'Half bead',
        geometry: {
          units: 'in',
          points: { s: [3, 0], t: [3.5, 0] },
          loops: [{ id: 'L1', closed: true, segs: [{ type: 'arc', from: 's', to: 't', center: [3.25, 0], ccw: false }, line('t', 's')] }],
        },
      },
    ]);
    expect(section.cuts).toEqual([
      {
        slot: 'outside',
        geometry: {
          units: 'in',
          points: { a: [0.25, 0], b: [0, -0.25], c: [0, -0.8125], _e: [0, 0] },
          loops: [{
            id: 'L1', closed: true,
            segs: [{ type: 'arc', from: 'a', to: 'b', center: [0.25, -0.25], ccw: true }, line('b', 'c'), line('c', '_e'), line('_e', 'a')],
          }],
        },
      },
      {
        slot: 'inside',
        geometry: {
          units: 'in',
          points: { p: [2.75, 0], q: [2.75, -0.125], r: [3, -0.125], _e: [3, 0] },
          loops: [{ id: 'L1', closed: true, segs: [line('p', 'q'), line('q', 'r'), line('r', '_e'), line('_e', 'p')] }],
        },
      },
    ]);
    expect(section.cuts.map(({ geometry }) => isProfileGeometry(geometry))).toEqual([true, true]);
    expect(section.skipped).toEqual(['panel']);
    expect(doorSection(picks({ inside: 'sp-crown', applied: 'sp-round' }), FIVE, LIBRARY).skipped).toEqual(['inside', 'applied']);
    expect(STEP.geometry.points.p).toEqual([-0.25, 0]);
  });

  it('draws a slab, puts slab-applied molding at the edge, and has no section when it can\'t draw one', () => {
    const slab = doorSection(picks({ outside: 'sp-round', inside: 'sp-step', applied: 'sp-bead' }), SLAB, LIBRARY);
    expect(slab.body).toEqual({
      units: 'in',
      points: { b1: [0, 0], b2: [3, 0], b3: [3, -0.8125], b4: [0, -0.8125] },
      loops: [{ id: 'slab', closed: true, segs: [line('b1', 'b2'), line('b2', 'b3'), line('b3', 'b4'), line('b4', 'b1')] }],
    });
    expect([slab.placed.map(({ slot }) => slot), slab.cuts.map(({ slot }) => slot), slab.skipped]).toEqual([['outside'], ['outside'], []]);
    const molded = doorSection({ ...picks({ applied: 'sp-bead' }), thickness: 0.75, stiles: { left: 2, right: 2 } }, SLAB_AM, LIBRARY);
    expect([molded.body.points.b2, molded.body.points.b3, molded.placed[0].geometry.points, molded.placed[0].geometry.loops[0].segs[0].center])
      .toEqual([[3, 0], [3, -0.75], { s: [0, 0], t: [0.5, 0] }, [0.25, 0]]);
    expect([
      doorSection({ ...DEFAULT_DOOR_STYLE, thickness: 0.5 }, FIVE, LIBRARY),
      doorSection({ ...DEFAULT_DOOR_STYLE, thickness: 0 }, SLAB, LIBRARY),
      doorSection(DEFAULT_DOOR_STYLE, null, LIBRARY),
    ]).toEqual([null, null, null]);
  });
});

describe('Step 494.4 Slab AM half section from the door edge', () => {
  const am1 = sample.profiles.find(({ id }) => id === 'am1');
  const in58 = sample.profiles.find(({ id }) => id === 'in58');
  const style = { ...DEFAULT_DOOR_STYLE, appliedMoldings: [
    { profileId: 'am1', offset: 1 }, { profileId: 'am1', offset: 2.5 },
  ] };
  const dim = (label, from, to) => ({ label, from, to, value: to - from });

  it('matches anchor 1: extends the slab body and places both moldings at their offsets', () => {
    const section = doorSection(style, SLAB_AM, sample.profiles);
    expect(section.body.points.b2).toEqual([4.5, 0]);
    expect(section.body.points.b3).toEqual([4.5, -0.8125]);
    expect(section.placed.map(({ slot, index, geometry }) => ({ slot, index, u: geometry.points.u })))
      .toEqual([{ slot: 'applied', index: 0, u: [1, 0] }, { slot: 'applied', index: 1, u: [2.5, 0] }]);
    expect(am1.geometry.points.u).toEqual([-0.25, 0]);
  });

  it('matches anchor 2: dimensions both spans and the gap between them', () => {
    expect(doorSectionDimensions(style, SLAB_AM, sample.profiles)).toEqual({
      left: [dim('thickness', -0.8125, 0)], below: [dim('offset', 0, 1)],
      above: [dim('flat', 0, 1), dim('profile', 1, 2),
        dim('flat', 2, 2.5), dim('profile', 2.5, 3.5)],
    });
  });

  it('matches anchor 3: normalizes a molding drawn off zero', () => {
    const shifted = { ...style, appliedMoldings: [{ profileId: 'am2', offset: 2 }] };
    const section = doorSection(shifted, SLAB_AM, sample.profiles);
    expect(section.body.points.b2).toEqual([3.75, 0]);
    expect(section.placed[0].geometry.points).toEqual({
      a: [2, 0], b: [2.75, 0], c: [2.75, 0.5], d: [2, 0.5],
    });
    expect(doorSectionDimensions(shifted, SLAB_AM, sample.profiles)).toEqual({
      left: [dim('thickness', -0.8125, 0)], below: [dim('offset', 0, 2)],
      above: [dim('flat', 0, 2), dim('profile', 2, 2.75)],
    });
    expect(sample.profiles.find(({ id }) => id === 'am2').geometry.points.a).toEqual([1, 0]);
  });

  it('matches anchor 4: draws without moldings or stiles and counts plain offsets in body width', () => {
    for (const stiles of [{ left: 0, right: 0 }, undefined]) {
      const bare = { ...style, stiles, appliedMoldings: [] };
      expect(doorSection(bare, SLAB_AM, sample.profiles).body.points.b2).toEqual([3, 0]);
      expect(doorSectionDimensions(bare, SLAB_AM, sample.profiles)).toEqual({
        left: [dim('thickness', -0.8125, 0)], below: [], above: [],
      });
      const plain = { ...bare, appliedMoldings: [{ profileId: null, offset: 4 }] };
      const section = doorSection(plain, SLAB_AM, sample.profiles);
      expect(section.body.points.b2).toEqual([5, 0]);
      expect(section.placed).toEqual([]);
      expect(doorSectionDimensions(plain, SLAB_AM, sample.profiles)).toEqual({
        left: [dim('thickness', -0.8125, 0)], below: [dim('offset', 0, 4)], above: [],
      });
    }
  });

  it('places moldings from the true outside edge and starts flats after the outside reach', () => {
    const outside = { ...ROUND, geometry: {
      ...ROUND.geometry, points: { ...ROUND.geometry.points, e: [-0.5, 0] },
      loops: [{ ...ROUND.geometry.loops[0], segs: [line('e', 'a'), ...ROUND.geometry.loops[0].segs] }],
    } };
    const edged = { ...picks({ outside: outside.id }), stiles: undefined, appliedMoldings: [
      { profileId: am1.id, offset: 2 }, { profileId: am1.id, offset: 1 },
      { profileId: null, offset: 0.75 },
    ] };
    const library = [...sample.profiles, outside];
    const section = doorSection(edged, SLAB_AM, library);
    expect(section.body.points.b2).toEqual([4, 0]);
    expect(section.placed.filter(({ slot }) => slot === 'applied').map(({ geometry }) => geometry.points.u))
      .toEqual([[1.5, 0], [0.5, 0]]);
    expect(doorSectionDimensions(edged, SLAB_AM, library)).toEqual({
      left: [dim('thickness', -0.8125, 0)],
      below: [dim('molding', -0.5, 0), dim('offset', -0.5, 0.25)],
      above: [dim('outside', -0.5, 0.25), dim('flat', 0.25, 0.5), dim('profile', 0.5, 2.5)],
    });
  });

  it('matches anchor 5 (Step 482 case 3): keeps overlapping 5-piece spans unchanged', () => {
    const five = { ...style, profiles: { ...style.profiles, inside: in58.id },
      appliedMoldings: [{ profileId: am1.id, offset: 0 }] };
    expect(doorSectionDimensions(five, FIVE, sample.profiles).above)
      .toEqual([dim('flat', 0, 2.375), dim('profile', 2.375, 3.75)]);
  });

  it('sorts and merges touching spans, keeps original indices, and skips plain or invalid profiles', () => {
    const mixed = { ...style, appliedMoldings: [
      { profileId: null, offset: 0 }, { profileId: 'gone', offset: 100 },
      { profileId: in58.id, offset: 100 }, { profileId: am1.id, offset: 1 },
      { profileId: am1.id, offset: 0 }, { profileId: am1.id, offset: 2 },
    ] };
    const section = doorSection(mixed, SLAB_AM, sample.profiles);
    expect(section.body.points.b2).toEqual([4, 0]);
    expect(section.placed.map(({ index, geometry }) => [index, geometry.points.u[0]]))
      .toEqual([[3, 1], [4, 0], [5, 2]]);
    expect(section.skipped).toEqual(['applied', 'applied']);
    expect(doorSectionDimensions(mixed, SLAB_AM, sample.profiles).above)
      .toEqual([dim('profile', 0, 3)]);
  });
});

describe('SPEC-50.1 door section dimension chains', () => {
  const dim = (label, from, to, value = to - from) => ({ label, from, to, value });
  const left = [dim('thickness', -0.8125, 0)];
  const profiles = [...LIBRARY, BEAD5, AM];

  it.each([
    ['unprofiled 5-piece', picks({}), FIVE,
      [dim('stile', 0, 3)], [dim('flat', 0, 3)]],
    ['outside bead and applied molding', picks({ outside: BEAD5.id, applied: AM.id }), FIVE,
      [dim('molding', -0.3125, 0), dim('stile', 0, 3)],
      [dim('outside', -0.3125, 0), dim('flat', 0, 2.75), dim('profile', 2.75, 3.75, 1)]],
    ['outside round and inside step', picks({ outside: ROUND.id, inside: STEP.id }), FIVE,
      [dim('stile', 0, 3)],
      [dim('outside', 0, 0.25), dim('flat', 0.25, 2.75), dim('profile', 2.75, 3, 0.25)]],
    ['slab with outside bead', picks({ outside: BEAD5.id }), SLAB,
      [dim('molding', -0.3125, 0)], [dim('outside', -0.3125, 0)]],
  ])('matches the anchor for %s', (_name, style, design, below, above) => {
    expect(doorSectionDimensions(style, design, profiles)).toEqual({ left, below, above });
  });

  it('uses the larger inside and applied reaches independently and ignores the panel reach', () => {
    const inside = { ...AM, id: 'wide-inside', kind: 'door_inside', geometry: {
      ...AM.geometry, points: { u: [-0.5, 0], v: [0.25, 0], w: [0.25, 0.375], k: [-0.5, 0.375] },
    } };
    const panel = { ...AM, id: 'panel', kind: 'door_panel', geometry: {
      ...AM.geometry, points: { u: [-2, 0], v: [2, 0], w: [2, 0.375], k: [-2, 0.375] },
    } };
    expect(doorSectionDimensions(picks({ inside: inside.id, applied: AM.id, panel: panel.id }), FIVE,
      [inside, AM, panel])).toEqual({
      left, below: [dim('stile', 0, 3)], above: [dim('flat', 0, 2.5), dim('profile', 2.5, 3.75)],
    });
    expect(doorSectionDimensions(picks({ inside: 'gone', applied: ROUND.id }), FIVE, profiles)).toEqual({
      left, below: [dim('stile', 0, 3)], above: [dim('flat', 0, 3)],
    });
  });

  it('dimensions slab-applied offsets from the outside edge and keeps reaches unchanged by stretch', () => {
    const style = { ...picks({ outside: BEAD5.id }), thickness: 1,
      appliedMoldings: [{ profileId: AM.id, offset: 1 }] };
    expect(doorSectionDimensions(style, SLAB_AM, profiles)).toEqual({
      left: [dim('thickness', -1, 0)],
      below: [dim('molding', -0.3125, 0), dim('offset', -0.3125, 0.6875)],
      above: [dim('outside', -0.3125, 0), dim('flat', 0, 0.6875), dim('profile', 0.6875, 1.6875)],
    });
  });

  it('rounds to six decimals, normalizes negative zero, and omits segments at or below EPS', () => {
    const style = { ...picks({ outside: ROUND.id, inside: STEP.id }),
      thickness: 0.8125004, stiles: { left: 0.500001, right: 3 } };
    expect(doorSectionDimensions(style, FIVE, profiles)).toEqual({
      left, below: [dim('stile', 0, 0.500001)],
      above: [dim('outside', 0, 0.25), dim('profile', 0.250001, 0.500001, 0.25)],
    });
    expect(doorSectionDimensions({ ...DEFAULT_DOOR_STYLE, thickness: 0.000001 }, SLAB, profiles))
      .toEqual({ left: [], below: [], above: [] });
    const appliedStep = { ...STEP, kind: 'applied_molding' };
    const slabStyle = { ...picks({ outside: ROUND.id }),
      appliedMoldings: [{ profileId: STEP.id, offset: 0.25 }], stiles: { left: 0.5, right: 3 } };
    expect(doorSectionDimensions(slabStyle, SLAB_AM, [ROUND, appliedStep]).above)
      .toEqual([dim('outside', 0, 0.25), dim('profile', 0.25, 0.5)]);
    expect(doorSectionDimensions({ ...slabStyle, appliedMoldings: [{ profileId: STEP.id, offset: 0 }] }, SLAB_AM,
      [ROUND, appliedStep]).above).toEqual([dim('outside', 0, 0.25), dim('profile', 0, 0.25)]);
  });

  it('returns null exactly when the half section cannot be drawn', () => {
    for (const [style, design] of [
      [{ ...DEFAULT_DOOR_STYLE, thickness: 0.5 }, FIVE],
      [{ ...DEFAULT_DOOR_STYLE, panel: { thickness: 0 } }, FIVE],
      [{ ...DEFAULT_DOOR_STYLE, thickness: 0 }, SLAB],
      [DEFAULT_DOOR_STYLE, null],
      [DEFAULT_DOOR_STYLE, { construction: 'unknown' }],
    ]) {
      expect(doorSection(style, design, profiles)).toBeNull();
      expect(doorSectionDimensions(style, design, profiles)).toBeNull();
    }
  });
});
