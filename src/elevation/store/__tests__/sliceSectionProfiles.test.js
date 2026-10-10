import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../../model/doorStyles.js';
import { setProfileKind, setProfileStretch } from '../../model/profileEditing.js';
import elevationReducer, {
  addSectionProfile, deleteSectionProfile, importSectionProfiles, setSectionProfileArchived, setTeamDoorStyle,
  updateSectionProfile,
} from '../elevationSlice.js';
import { stateWithRun } from './helpers/sliceFixtures.js';

const sample = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD, CROWN] = sample.profiles;
const apply = (state, ...actions) => actions.reduce(elevationReducer, state);
const rows = (state) => state.settings.sectionProfiles.map(({ id, name, version, archived }) => [id, name, version, archived]);

/** A one-wall room with the sample profiles in its library. */
function withLibrary() {
  const state = stateWithRun();
  state.settings.sectionProfiles = structuredClone(sample.profiles);
  return state;
}

describe('SPEC-47 editing the profile library', () => {
  it('bumps the version when stretch is added, changed or removed, including a kind change (SPEC-50.1)', () => {
    const save = (state, profile) => apply(state, updateSectionProfile({ profileId: COVE.id, profile }));
    const added = save(withLibrary(), setProfileStretch(COVE, -0.5));
    const picked = (state) => state.settings.sectionProfiles[0];
    expect(picked(added).version).toBe(2);
    const same = save(added, setProfileStretch(picked(added), -0.5));
    expect(picked(same).version).toBe(2);
    const changed = save(same, setProfileStretch(picked(same), -0.625));
    expect(picked(changed).version).toBe(3);
    const removed = save(changed, setProfileStretch(picked(changed), null));
    expect(picked(removed).version).toBe(4);
    expect(Object.hasOwn(picked(removed), 'stretch')).toBe(false);
    const crown = save(changed, setProfileKind(picked(changed), 'crown'));
    expect(picked(crown).version).toBe(4);
    expect(Object.hasOwn(picked(crown), 'stretch')).toBe(false);
    expect(save(added, { ...picked(added), stretch: { y: 0 } })).toBe(added);
  });

  it('adds a new square profile or a copy of one', () => {
    const state = apply(withLibrary(), addSectionProfile({ id: 'sp-1' }), addSectionProfile({ id: 'sp-2', baseId: 'sp-bead' }));
    expect(rows(state).slice(3)).toEqual([['sp-1', 'New profile', 1, false], ['sp-2', 'Half bead copy', 1, false]]);
    expect(state.settings.sectionProfiles[4].geometry).toEqual(BEAD.geometry);
    const before = withLibrary();
    expect(apply(before, addSectionProfile({ id: 'sp-3', baseId: 'gone' }))).toBe(before);
    expect(addSectionProfile().payload.id).toEqual(expect.any(String));
  });

  it('saves name and kind edits without a new version; a shape edit bumps it', () => {
    const state = withLibrary();
    const renamed = apply(state, updateSectionProfile({
      profileId: 'sp-cove',
      profile: { ...COVE, name: 'Cove 3/8', kind: 'other', id: 'x', version: 9, archived: true },
    }));
    expect(renamed.settings.sectionProfiles[0]).toEqual({ ...COVE, name: 'Cove 3/8', kind: 'other' });
    const moved = { ...COVE.geometry, points: { ...COVE.geometry.points, d: [0.75, -0.875], e: [0, -0.875] } };
    const reshaped = apply(renamed, updateSectionProfile({ profileId: 'sp-cove', profile: { ...COVE, geometry: moved } }));
    expect([reshaped.settings.sectionProfiles[0].version, reshaped.settings.sectionProfiles[0].name]).toEqual([2, 'Cove 1/4']);
    const pointed = apply(reshaped, updateSectionProfile({
      profileId: 'sp-cove',
      profile: { ...reshaped.settings.sectionProfiles[0], drawnPoints: { elevation: ['b'] } },
    }));
    expect(pointed.settings.sectionProfiles[0].version).toBe(3);
    expect([
      apply(state, updateSectionProfile({ profileId: 'sp-cove', profile: { ...COVE, name: '' } })),
      apply(state, updateSectionProfile({ profileId: 'sp-cove', profile: { ...COVE, drawnPoints: { elevation: ['q'] } } })),
      apply(state, updateSectionProfile({ profileId: 'gone', profile: COVE })),
    ].every((next) => next === state)).toBe(true);
  });

  it('archives and restores; deletes only a profile no door style uses', () => {
    const state = withLibrary();
    const archived = apply(state, setSectionProfileArchived({ profileId: 'sp-crown', archived: true }));
    expect(rows(archived)[2]).toEqual(['sp-crown', 'Crown 4 1/2', 1, true]);
    expect(rows(apply(archived, setSectionProfileArchived({ profileId: 'sp-crown', archived: false })))[2])
      .toEqual(['sp-crown', 'Crown 4 1/2', 1, false]);
    expect([
      apply(state, setSectionProfileArchived({ profileId: 'gone', archived: true })),
      apply(state, setSectionProfileArchived({ profileId: 'sp-crown', archived: 'yes' })),
    ].every((next) => next === state)).toBe(true);
    const used = apply(state, setTeamDoorStyle({
      style: { ...DEFAULT_DOOR_STYLE, profiles: { ...DEFAULT_DOOR_STYLE.profiles, inside: 'sp-cove' } },
    }));
    expect(apply(used, deleteSectionProfile({ profileId: 'sp-cove' }))).toBe(used);
    expect(apply(used, deleteSectionProfile({ profileId: 'gone' }))).toBe(used);
    expect(rows(apply(used, deleteSectionProfile({ profileId: 'sp-bead' }))).map(([id]) => id)).toEqual(['sp-cove', 'sp-crown']);
  });

  it('imports a profiles file by id', () => {
    const state = withLibrary();
    const imported = apply(state, importSectionProfiles({
      profiles: [{ ...BEAD, name: 'Bead 1/2', version: 3 }, { ...CROWN, id: 'sp-crown-2' }, { nope: true }],
    }));
    expect(rows(imported)).toEqual([
      ['sp-cove', 'Cove 1/4', 1, false],
      ['sp-bead', 'Bead 1/2', 3, false],
      ['sp-crown', 'Crown 4 1/2', 1, false],
      ['sp-crown-2', 'Crown 4 1/2', 1, false],
    ]);
    expect(apply(state, importSectionProfiles({ profiles: [{ nope: true }] }))).toBe(state);
    expect(apply(state, importSectionProfiles({ profiles: 'x' }))).toBe(state);
  });

  it('adds a new profile of a kind for a door style slot (SPEC-48.3)', () => {
    const state = apply(
      withLibrary(),
      addSectionProfile({ id: 'sp-1', kind: 'door_outside' }),
      addSectionProfile({ id: 'sp-2', kind: 'shop_x' }),
      addSectionProfile({ id: 'sp-3', baseId: 'sp-crown', kind: 'door_outside' }),
    );
    expect(state.settings.sectionProfiles.slice(3).map(({ id, name, kind }) => [id, name, kind])).toEqual([
      ['sp-1', 'New door outside edge', 'door_outside'],
      ['sp-2', 'New profile', 'other'],
      ['sp-3', 'Crown 4 1/2 copy', 'crown'],
    ]);
  });
});
