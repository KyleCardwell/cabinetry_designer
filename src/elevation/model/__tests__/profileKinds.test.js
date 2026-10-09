import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PROFILE_KINDS, isProfileKind, isSectionProfile, migrateSectionProfile, profileKindLabel, profileKindOptions,
} from '../sectionProfiles.js';
import { setProfileKind } from '../profileEditing.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD, CROWN] = sample.profiles;
const geometry = {
  units: 'in',
  points: { a: [0, 0], b: [0.5, 0], c: [0.5, -0.5] },
  loops: [{
    id: 'L1',
    closed: true,
    segs: [
      { type: 'line', from: 'a', to: 'b' },
      { type: 'line', from: 'b', to: 'c' },
      { type: 'line', from: 'c', to: 'a' },
    ],
  }],
};
const base = { id: 'sp-1', name: 'One', geometry, drawnPoints: { elevation: [] }, version: 1, archived: false };
const moved = (points) => ({ ...geometry, points });

describe('SPEC-48.2 profile kinds; 0, 0 is the pin', () => {
  it('names one kind per profile, each with its axes and what 0, 0 means, and no pins', () => {
    expect(Object.keys(PROFILE_KINDS)).toEqual([
      'door_outside', 'door_inside', 'door_panel', 'applied_molding', 'crown', 'top_mold',
      'furniture_base', 'toe_kick', 'nosing', 'other',
    ]);
    expect(Object.values(PROFILE_KINDS).map((kind) => Object.keys(kind)))
      .toEqual(Array(10).fill(['label', 'axes', 'origin']));
    expect(Object.values(PROFILE_KINDS).map(({ axes }) => axes))
      .toEqual(['door', 'door', 'door', 'door', 'run', 'run', 'run', 'run', 'run', 'free']);
    expect([profileKindLabel('door_inside'), profileKindLabel('door_panel'), profileKindLabel('other'), profileKindLabel('shop_x')])
      .toEqual(['Door inside profile', 'Raised panel', 'Other', 'shop_x']);
    expect([
      isProfileKind('crown'), isProfileKind('other'), isProfileKind('Crown'),
      isProfileKind('door_applied'), isProfileKind(undefined), isProfileKind('toString'),
    ]).toEqual([true, true, false, false, false, false]);
    expect([COVE, BEAD, CROWN].map((profile) => [isSectionProfile(profile), 'attach' in profile]))
      .toEqual([[true, false], [true, false], [true, false]]);
  });

  it('lists the kinds a library uses, and changes a profile\'s kind and nothing else', () => {
    const list = [
      { ...base, kind: 'nosing' },
      { ...base, id: 'sp-2', kind: 'door_inside' },
      { ...base, id: 'sp-3', kind: 'nosing', archived: true },
      { ...base, id: 'sp-4', kind: 'crown' },
    ];
    expect([profileKindOptions(list), profileKindOptions([])]).toEqual([['door_inside', 'crown', 'nosing'], []]);
    expect(setProfileKind(COVE, 'door_outside')).toEqual({ ...COVE, kind: 'door_outside' });
    expect(setProfileKind(CROWN, 'top_mold')).toEqual({ ...CROWN, kind: 'top_mold' });
    expect(setProfileKind(BEAD, 'other')).toEqual({ ...BEAD, kind: 'other' });
    expect(setProfileKind(COVE, 'door_inside')).toEqual(COVE);
    expect([setProfileKind(COVE, 'door_applied'), setProfileKind(COVE, ''), setProfileKind(COVE, undefined)])
      .toEqual([null, null, null]);
    expect(COVE.kind).toBe('door_inside');
  });

  it('turns older tags into one kind, moves the old pin to 0, 0 and drops the pins', () => {
    const old = (tags, attach) => ({ ...base, tags, attach });
    expect(migrateSectionProfile(old(['door_inside'], { frame_edge: 'a' }))).toEqual({ ...base, kind: 'door_inside' });
    expect(migrateSectionProfile(old(['shop_ogee', 'crown', 'door_inside'], { box_top: 'a', box_front: 'a', frame_edge: 'b' })))
      .toEqual({ ...base, kind: 'crown' });
    expect(migrateSectionProfile(old(['slab_applied'], {}))).toEqual({ ...base, kind: 'applied_molding' });
    expect(migrateSectionProfile(old(['countertop_edge', 'light_rail'], { door_edge: 'b' }))).toEqual({ ...base, kind: 'other' });
    expect(migrateSectionProfile({ ...base, tags: ['door_inside'] })).toEqual({ ...base, kind: 'door_inside' });
    expect(migrateSectionProfile({ ...base, kind: 'door_outside', attach: { door_edge: 'b' } }))
      .toEqual({ ...base, kind: 'door_outside', geometry: moved({ a: [-0.5, 0], b: [0, 0], c: [0, -0.5] }) });
    expect(migrateSectionProfile({ ...base, kind: 'nosing', attach: { edge_top: 'c', edge_face: 'b' } }))
      .toEqual({ ...base, kind: 'nosing', geometry: moved({ a: [-0.5, 0.5], b: [0, 0.5], c: [0, 0] }) });
    expect(migrateSectionProfile({ ...base, kind: 'crown', attach: { box_front: 'c' } }))
      .toEqual({ ...base, kind: 'crown', geometry: moved({ a: [-0.5, 0], b: [0, 0], c: [0, -0.5] }) });
    expect(migrateSectionProfile({ ...base, kind: 'door_inside', attach: { frame_edge: 'q' } })).toEqual({ ...base, kind: 'door_inside' });
    const bead = migrateSectionProfile({ ...BEAD, attach: { apply_point: 't' } });
    expect([bead.geometry.points, bead.geometry.loops[0].segs[0].center, 'attach' in bead, isSectionProfile(bead)])
      .toEqual([{ s: [-0.5, 0], t: [0, 0] }, [-0.25, 0], false, true]);
    expect(migrateSectionProfile(COVE)).toBe(COVE);
    expect([migrateSectionProfile(null), migrateSectionProfile('x')]).toEqual([null, 'x']);
    const input = { ...base, kind: 'door_outside', attach: { door_edge: 'b' } };
    migrateSectionProfile(input);
    expect([input.attach, input.geometry.points.b]).toEqual([{ door_edge: 'b' }, [0.5, 0]]);
  });
});
