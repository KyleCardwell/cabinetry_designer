import { describe, expect, it } from 'vitest';
import {
  ATTACH_POINTS, PIN_LABELS, PROFILE_KINDS, isProfileKind, migrateSectionProfile, profileKindLabel,
  profileKindOptions, profileMissingPins,
} from '../sectionProfiles.js';

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

describe('SPEC-48.1.1 profile kinds and pin points', () => {
  it('names one kind per profile, each with its axes and the pin points it needs', () => {
    expect(Object.keys(PROFILE_KINDS)).toEqual([
      'door_outside', 'door_inside', 'door_panel', 'applied_molding', 'crown', 'top_mold',
      'furniture_base', 'toe_kick', 'nosing', 'other',
    ]);
    expect(Object.fromEntries(Object.entries(PROFILE_KINDS).map(([kind, { pins }]) => [kind, pins]))).toEqual({
      door_outside: ['door_edge'],
      door_inside: ['frame_edge'],
      door_panel: ['panel_edge'],
      applied_molding: ['apply_point'],
      crown: ['box_top', 'box_front'],
      top_mold: ['box_top', 'box_front'],
      furniture_base: ['floor', 'box_front'],
      toe_kick: ['floor', 'box_front'],
      nosing: ['edge_top', 'edge_face'],
      other: [],
    });
    expect(Object.values(PROFILE_KINDS).map(({ axes }) => axes))
      .toEqual(['door', 'door', 'door', 'door', 'run', 'run', 'run', 'run', 'run', 'free']);
    expect([profileKindLabel('door_inside'), profileKindLabel('door_panel'), profileKindLabel('other'), profileKindLabel('shop_x')])
      .toEqual(['Door inside profile', 'Raised panel', 'Other', 'shop_x']);
    expect(Object.keys(PIN_LABELS)).toEqual(ATTACH_POINTS);
    expect([PIN_LABELS.frame_edge, PIN_LABELS.apply_point, PIN_LABELS.box_front])
      .toEqual(['Panel opening edge', 'Molding line', 'Box face']);
    expect([
      isProfileKind('crown'), isProfileKind('other'), isProfileKind('Crown'),
      isProfileKind('door_applied'), isProfileKind(undefined), isProfileKind('toString'),
    ]).toEqual([true, true, false, false, false, false]);
  });

  it('lists the pin points still missing, and the kinds a library uses', () => {
    expect([
      profileMissingPins({ ...base, kind: 'door_inside', attach: { frame_edge: 'a' } }),
      profileMissingPins({ ...base, kind: 'door_inside', attach: {} }),
      profileMissingPins({ ...base, kind: 'crown', attach: { box_front: 'a' } }),
      profileMissingPins({ ...base, kind: 'toe_kick', attach: { box_top: 'a' } }),
      profileMissingPins({ ...base, kind: 'other', attach: {} }),
      profileMissingPins({ ...base, kind: 'bogus', attach: {} }),
    ]).toEqual([[], ['frame_edge'], ['box_top'], ['floor', 'box_front'], [], []]);
    const list = [
      { ...base, kind: 'nosing' },
      { ...base, id: 'sp-2', kind: 'door_inside' },
      { ...base, id: 'sp-3', kind: 'nosing', archived: true },
      { ...base, id: 'sp-4', kind: 'crown' },
    ];
    expect([profileKindOptions(list), profileKindOptions([])]).toEqual([['door_inside', 'crown', 'nosing'], []]);
  });

  it('turns an older profile\'s tags into one kind and keeps only that kind\'s pins', () => {
    const old = (tags, attach) => ({ ...base, tags, attach });
    expect(migrateSectionProfile(old(['door_inside'], { frame_edge: 'a' })))
      .toEqual({ ...base, kind: 'door_inside', attach: { frame_edge: 'a' } });
    expect(migrateSectionProfile(old(['applied_molding'], { frame_edge: 'a', apply_point: 'b' })))
      .toEqual({ ...base, kind: 'applied_molding', attach: { apply_point: 'b' } });
    expect(migrateSectionProfile(old(['shop_ogee', 'crown', 'door_inside'], { box_top: 'a', box_front: 'a', frame_edge: 'b' })))
      .toEqual({ ...base, kind: 'crown', attach: { box_top: 'a', box_front: 'a' } });
    expect(migrateSectionProfile(old(['slab_applied'], {}))).toEqual({ ...base, kind: 'applied_molding', attach: {} });
    expect(migrateSectionProfile(old(['countertop_edge', 'light_rail'], { door_edge: 'a' })))
      .toEqual({ ...base, kind: 'other', attach: {} });
    expect(migrateSectionProfile(old([], {}))).toEqual({ ...base, kind: 'other', attach: {} });
    expect('tags' in migrateSectionProfile(old(['door_inside'], {}))).toBe(false);
    const current = { ...base, kind: 'crown', attach: { frame_edge: 'a' } };
    expect(migrateSectionProfile(current)).toBe(current);
    expect([migrateSectionProfile(null), migrateSectionProfile('x')]).toEqual([null, 'x']);
    const input = old(['door_inside'], { frame_edge: 'a', door_edge: 'b' });
    migrateSectionProfile(input);
    expect([input.tags, input.attach]).toEqual([['door_inside'], { frame_edge: 'a', door_edge: 'b' }]);
  });
});
