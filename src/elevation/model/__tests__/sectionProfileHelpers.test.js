import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import {
  PROFILE_SLOTS, filterSectionProfiles, mergeImportedProfiles, newSectionProfile, parseProfileFile, profileFile,
  profileFitsSlot, sectionProfileBounds, sectionProfileSvgPath, sectionProfileUses,
} from '../sectionProfiles.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD, CROWN] = sample.profiles;
/** A 270° arc, clockwise from (1/4, 0) round to (0, 1/4), closed by its chord. */
const THREE_QUARTER = {
  ...COVE,
  id: 'sp-tq',
  geometry: {
    units: 'in',
    points: { u: [0.25, 0], v: [0, 0.25] },
    loops: [{
      id: 'L1',
      closed: true,
      segs: [
        { type: 'arc', from: 'u', to: 'v', center: [0, 0], ccw: false },
        { type: 'line', from: 'v', to: 'u' },
      ],
    }],
  },
  attach: {},
  drawnPoints: { elevation: [] },
};

describe('SPEC-47 section profile helpers', () => {
  it('fits a slot of its own kind once the kind\'s pin points are all set', () => {
    expect(PROFILE_SLOTS).toEqual({
      door_outside: 'door_outside',
      door_inside: 'door_inside',
      door_panel: 'door_panel',
      door_applied: 'applied_molding',
      slab_applied: 'applied_molding',
      crown: 'crown',
      top_mold: 'top_mold',
      furniture_base: 'furniture_base',
      toe_kick: 'toe_kick',
      nosing: 'nosing',
    });
    expect([
      profileFitsSlot(COVE, 'door_inside'),
      profileFitsSlot(BEAD, 'door_applied'),
      profileFitsSlot(BEAD, 'slab_applied'),
      profileFitsSlot(CROWN, 'crown'),
      profileFitsSlot(COVE, 'door_applied'),
      profileFitsSlot(COVE, 'door_outside'),
      profileFitsSlot({ ...COVE, attach: {} }, 'door_inside'),
      profileFitsSlot(CROWN, 'top_mold'),
      profileFitsSlot({ ...CROWN, attach: { box_top: 'c1' } }, 'crown'),
      profileFitsSlot(CROWN, 'sticking'),
      profileFitsSlot({ ...COVE, kind: 'other', attach: {} }, 'door_inside'),
    ]).toEqual([true, true, true, true, false, false, false, false, false, false, false]);
  });

  it('measures a profile, arcs included', () => {
    expect([COVE, BEAD, CROWN, THREE_QUARTER].map((profile) => sectionProfileBounds(profile))).toEqual([
      { minX: 0, minY: -0.8125, maxX: 0.75, maxY: 0 },
      { minX: 0, minY: 0, maxX: 0.5, maxY: 0.25 },
      { minX: 0, minY: 0, maxX: 3, maxY: 4.5 },
      { minX: -0.25, minY: -0.25, maxX: 0.25, maxY: 0.25 },
    ]);
  });

  it('draws a thumbnail path with y flipped for SVG', () => {
    expect([COVE, BEAD, CROWN, THREE_QUARTER].map((profile) => sectionProfileSvgPath(profile))).toEqual([
      'M 0 0 L 0.5 0 A 0.25 0.25 0 0 1 0.75 0.25 L 0.75 0.8125 L 0 0.8125 L 0 0 Z',
      'M 0 0 A 0.25 0.25 0 0 1 0.5 0 L 0 0 Z',
      'M 0 0 L 0 -4.5 L 3 -4.5 L 3 -3.75 L 0.5 0 L 0 0 Z',
      'M 0.25 0 A 0.25 0.25 0 1 1 0 -0.25 L 0.25 0 Z',
    ]);
    const open = {
      ...COVE,
      geometry: {
        units: 'in',
        points: { p: [0.333333, -0.1], q: [1, -0.1], r: [1, 0] },
        loops: [
          { id: 'L1', closed: false, segs: [{ type: 'line', from: 'p', to: 'q' }] },
          { id: 'L2', closed: false, segs: [{ type: 'line', from: 'q', to: 'r' }] },
        ],
      },
      attach: {},
      drawnPoints: { elevation: [] },
    };
    expect(sectionProfileSvgPath(open)).toBe('M 0.3333 0.1 L 1 0.1 M 1 0.1 L 1 0');
  });

  it('makes a new 3/4" square profile or a copy, with the next free name', () => {
    expect(newSectionProfile([], 'sp-1')).toEqual({
      id: 'sp-1',
      name: 'New profile',
      kind: 'other',
      geometry: {
        units: 'in',
        points: { p1: [0, 0], p2: [0.75, 0], p3: [0.75, -0.75], p4: [0, -0.75] },
        loops: [{
          id: 'L1',
          closed: true,
          segs: [
            { type: 'line', from: 'p1', to: 'p2' },
            { type: 'line', from: 'p2', to: 'p3' },
            { type: 'line', from: 'p3', to: 'p4' },
            { type: 'line', from: 'p4', to: 'p1' },
          ],
        }],
      },
      attach: {},
      drawnPoints: { elevation: [] },
      version: 1,
      archived: false,
    });
    const named = [{ ...COVE, name: 'New profile' }, { ...BEAD, name: 'new PROFILE 2' }];
    expect(newSectionProfile(named, 'sp-2').name).toBe('New profile 3');
    const copy = newSectionProfile(sample.profiles, 'sp-3', { ...CROWN, version: 4, archived: true });
    expect(copy).toEqual({ ...CROWN, id: 'sp-3', name: 'Crown 4 1/2 copy', version: 1, archived: false });
    expect([copy.geometry === CROWN.geometry, copy.attach === CROWN.attach]).toEqual([false, false]);
    expect(newSectionProfile([...sample.profiles, { ...COVE, id: 'x', name: 'Crown 4 1/2 COPY' }], 'sp-4', CROWN).name)
      .toBe('Crown 4 1/2 copy 2');
  });

  it('lists the door style slots that use a profile: team default first, then each room\'s styles', () => {
    const team = { ...DEFAULT_DOOR_STYLE, profiles: { outside: null, inside: 'sp-cove', panel: null, applied: 'sp-cove' } };
    const A = { ...DEFAULT_DOOR_STYLE, id: 'ds-a', label: 'A', profiles: { ...DEFAULT_DOOR_STYLE.profiles, applied: 'sp-bead' } };
    const B = { ...DEFAULT_DOOR_STYLE, id: 'ds-b', label: 'B', profiles: { ...DEFAULT_DOOR_STYLE.profiles, inside: 'sp-cove' } };
    const settings = { ...DEFAULT_SETTINGS, teamDoorStyle: team, sectionProfiles: sample.profiles };
    const rooms = [{ id: 'r1', doorStyles: [A, B] }, { id: 'r2' }];
    expect(sectionProfileUses(settings, rooms, 'sp-cove')).toEqual([
      { level: 'team', slot: 'inside' },
      { level: 'team', slot: 'applied' },
      { level: 'room', roomId: 'r1', styleId: 'ds-b', label: 'B', slot: 'inside' },
    ]);
    expect(sectionProfileUses(settings, rooms, 'sp-bead'))
      .toEqual([{ level: 'room', roomId: 'r1', styleId: 'ds-a', label: 'A', slot: 'applied' }]);
    expect(sectionProfileUses(settings, rooms, 'sp-crown')).toEqual([]);
    expect(sectionProfileUses(DEFAULT_SETTINGS, [], 'sp-cove')).toEqual([]);
  });

  it('writes and reads a profiles file, and merges an import by id', () => {
    expect(profileFile([COVE])).toEqual({ kind: 'section-profiles', version: 1, profiles: [COVE] });
    expect(parseProfileFile(JSON.stringify(sample))).toEqual(sample.profiles);
    expect([
      parseProfileFile('nope'),
      parseProfileFile('{"kind":"other","version":1,"profiles":[]}'),
      parseProfileFile('{"kind":"section-profiles","version":2,"profiles":[]}'),
      parseProfileFile('{"kind":"section-profiles","version":1,"profiles":{}}'),
      parseProfileFile('null'),
    ]).toEqual([null, null, null, null, null]);
    const edited = { ...COVE, name: 'Cove 3/8', version: 2 };
    const list = [COVE, BEAD];
    const merged = mergeImportedProfiles(list, [edited, CROWN, { ...BEAD, id: 'sp-bad', version: 0 }]);
    expect(merged).toEqual({ profiles: [edited, BEAD, CROWN], added: 1, replaced: 1, skipped: 1 });
    expect(merged.profiles).not.toBe(list);
    expect(list).toEqual([COVE, BEAD]);
    expect(mergeImportedProfiles([], [CROWN, { ...CROWN, name: 'Crown 2' }]))
      .toEqual({ profiles: [{ ...CROWN, name: 'Crown 2' }], added: 1, replaced: 1, skipped: 0 });
  });

  it('filters by name, kind and archived', () => {
    const list = [COVE, BEAD, { ...CROWN, archived: true }];
    const ids = (options) => filterSectionProfiles(list, options).map(({ id }) => id);
    expect([
      ids(undefined),
      ids({ showArchived: true }),
      ids({ search: '  COVE ' }),
      ids({ search: 'crown' }),
      ids({ search: 'crown', showArchived: true }),
      ids({ kind: 'applied_molding' }),
      ids({ kind: 'crown' }),
      ids({ kind: 'crown', showArchived: true }),
      ids({ kind: 'door_outside' }),
    ]).toEqual([
      ['sp-cove', 'sp-bead'],
      ['sp-cove', 'sp-bead', 'sp-crown'],
      ['sp-cove'],
      [],
      ['sp-crown'],
      ['sp-bead'],
      [],
      ['sp-crown'],
      [],
    ]);
  });
});
