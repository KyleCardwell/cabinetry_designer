import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import {
  PROFILE_KINDS, isProfileGeometry, isSectionProfile, isSectionProfileList,
} from '../sectionProfiles.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD, CROWN] = sample.profiles;
const segs = COVE.geometry.loops[0].segs;
const geometry = (patch) => ({ ...COVE.geometry, ...patch });
const loop = (patch) => geometry({ loops: [{ ...COVE.geometry.loops[0], ...patch }] });
const withSegs = (...list) => loop({ segs: list });

describe('SPEC-47 the section profile shape', () => {
  it('starts with an empty library and names the kinds', () => {
    expect(DEFAULT_SETTINGS.sectionProfiles).toEqual([]);
    expect(Object.keys(PROFILE_KINDS)).toHaveLength(10);
    expect([COVE, BEAD, CROWN].map((profile) => isSectionProfile(profile))).toEqual([true, true, true]);
    expect([COVE.kind, BEAD.kind, CROWN.kind]).toEqual(['door_inside', 'applied_molding', 'crown']);
  });

  it('checks the geometry: named points, chained segments, loops that close, arcs with one radius', () => {
    expect([
      isProfileGeometry(COVE.geometry),
      isProfileGeometry(BEAD.geometry),
      isProfileGeometry(geometry({ points: { ...COVE.geometry.points, z: [9, 9] } })),
      isProfileGeometry(loop({ closed: false, segs: segs.slice(0, 4) })),
      isProfileGeometry(geometry({ units: 'mm' })),
      isProfileGeometry(geometry({ points: { ...COVE.geometry.points, a: [0, 'x'] } })),
      isProfileGeometry(geometry({ points: { ...COVE.geometry.points, a: [0, 0, 0] } })),
      isProfileGeometry(geometry({ loops: [] })),
      isProfileGeometry(geometry({ loops: [COVE.geometry.loops[0], COVE.geometry.loops[0]] })),
      isProfileGeometry(loop({ segs: segs.slice(0, 4) })),
      isProfileGeometry(loop({ closed: false })),
      isProfileGeometry(withSegs(segs[0], ...segs.slice(2))),
      isProfileGeometry(withSegs(segs[0], { ...segs[1], to: 'q' }, ...segs.slice(2))),
      isProfileGeometry(withSegs(segs[0], { ...segs[1], center: [0.5, -0.3] }, ...segs.slice(2))),
      isProfileGeometry(withSegs(segs[0], { ...segs[1], ccw: 'no' }, ...segs.slice(2))),
      isProfileGeometry(withSegs(segs[0], { ...segs[1], type: 'spline' }, ...segs.slice(2))),
      isProfileGeometry(withSegs({ ...segs[0], ccw: true }, ...segs.slice(1))),
      isProfileGeometry(withSegs({ type: 'line', from: 'a', to: 'b' }, { type: 'line', from: 'b', to: 'a' })),
      isProfileGeometry(loop({ closed: false, segs: [{ type: 'line', from: 'a', to: 'a' }] })),
      isProfileGeometry(null),
    ]).toEqual([
      true, true, true, true,
      false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
    ]);
  });

  it('checks the profile: name, kind, drawn points name real points, version and archived; no pins', () => {
    expect([
      isSectionProfile({ ...COVE, kind: 'other' }),
      isSectionProfile({ ...COVE, drawnPoints: { elevation: [] } }),
      isSectionProfile({ ...COVE, drawnPoints: { elevation: ['b'], plan: ['c'] } }),
      isSectionProfile({ ...COVE, name: '' }),
      isSectionProfile({ ...COVE, name: ' Cove' }),
      isSectionProfile({ ...COVE, kind: 'Door inside' }),
      isSectionProfile({ ...COVE, kind: undefined }),
      isSectionProfile({ ...COVE, tags: ['door_inside'] }),
      isSectionProfile({ ...COVE, attach: {} }),
      isSectionProfile({ ...COVE, attach: { frame_edge: 'a' } }),
      isSectionProfile({ ...COVE, drawnPoints: { plan: ['c'] } }),
      isSectionProfile({ ...COVE, drawnPoints: { elevation: ['b', 'b'] } }),
      isSectionProfile({ ...COVE, drawnPoints: { elevation: ['q'] } }),
      isSectionProfile({ ...COVE, version: 0 }),
      isSectionProfile({ ...COVE, version: 1.5 }),
      isSectionProfile({ ...COVE, archived: 'no' }),
      isSectionProfile({ ...COVE, thumbnail: 'M 0 0' }),
      isSectionProfile({ ...COVE, id: '' }),
    ]).toEqual([
      true, true, true,
      false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
    ]);
  });

  it('accepts a list with unique ids; names may repeat', () => {
    expect([
      isSectionProfileList(sample.profiles),
      isSectionProfileList([]),
      isSectionProfileList([COVE, { ...BEAD, name: COVE.name }]),
      isSectionProfileList([COVE, { ...BEAD, id: COVE.id }]),
      isSectionProfileList([COVE, { ...BEAD, version: 0 }]),
      isSectionProfileList(undefined),
      isSectionProfileList({}),
    ]).toEqual([true, true, true, false, false, false, false]);
  });
});
