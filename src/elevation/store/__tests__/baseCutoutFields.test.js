import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../../model/constants.js';
import { resolveProfile } from '../../model/profile.js';
import { PROFILE_KINDS, PROFILE_SLOTS, isSectionProfile, profileFitsSlot } from '../../model/sectionProfiles.js';
import elevationReducer, {
  addBaseCutout, updateBaseCutout, removeBaseCutout, setRunOverride, updateRoomProfile, updateWall,
} from '../elevationSlice.js';
import {
  ELEVATION_STORAGE_KEY, isElevationDocument, loadElevationDocument,
  normalizeElevationDocument, toElevationDocument,
} from '../persistence.js';

const golden = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8'));
const savedDocument = () => normalizeElevationDocument(structuredClone(golden));
const currentRun = (state) => state.rooms[0].walls[0].runs[0];
const cutout = { id: 'k1', from: 'c1', to: 'c1' };
const load = (saved) => {
  globalThis.window = { localStorage: {
    getItem: (key) => key === ELEVATION_STORAGE_KEY ? JSON.stringify(saved) : null,
  } };
  return loadElevationDocument();
};

afterEach(() => { delete globalThis.window; });

describe('SPEC-50.6 step 492 base cutout data', () => {
  it('keeps a loaded single-cabinet cutout (anchor 1), round-trips picks, and defaults older settings', () => {
    const saved = savedDocument();
    expect(DEFAULT_PROFILE.baseCutoutProfileId).toBeNull();
    expect(DEFAULT_SETTINGS).toMatchObject({ baseCutoutFoot: 3, baseCutoutHeight: 1.5 });
    delete saved.settings.baseCutoutFoot;
    delete saved.settings.baseCutoutHeight;
    currentRun(saved).baseCutouts = [cutout];
    const loaded = load(saved);
    expect(currentRun(loaded).baseCutouts).toEqual([cutout]);
    expect(loaded.settings).toMatchObject({ baseCutoutFoot: 3, baseCutoutHeight: 1.5 });
    currentRun(loaded).baseCutouts.push(
      { ...cutout, id: 'k2', to: 'c2', width: 24, profileId: 'cut1' },
      { ...cutout, id: 'k3', profileId: null },
    );
    expect(isElevationDocument(loaded)).toBe(true);
    expect(load(toElevationDocument(loaded))).toEqual(loaded);
    // Missing cabinet references survive loading so the model can report orphaned cutouts later.
    expect(currentRun(loaded).baseCutouts[1].to).toBe('c2');
  });

  it('rejects duplicate ids and zero width (anchor 2), malformed cutouts, settings and profile picks', () => {
    for (const baseCutouts of [
      [cutout, cutout], [{ ...cutout, width: 0 }], [{ ...cutout, width: -1 }],
      [{ ...cutout, width: Infinity }], [{ ...cutout, width: NaN }],
      [{ ...cutout, width: '24' }], [{ ...cutout, width: null }],
      [{ ...cutout, profileId: 1 }], [{ ...cutout, id: '' }],
      [{ ...cutout, from: null }], [{ id: 'k1', from: 'c1' }], [null], null, {},
    ]) {
      const saved = savedDocument();
      currentRun(saved).baseCutouts = baseCutouts;
      expect(isElevationDocument(saved), JSON.stringify(baseCutouts)).toBe(false);
    }
    for (const baseCutouts of [[cutout, cutout], [{ ...cutout, width: 0 }]]) {
      const saved = savedDocument();
      currentRun(saved).baseCutouts = baseCutouts;
      expect(load(saved)).toBeNull();
    }
    const saved = savedDocument();
    currentRun(saved).baseCutouts = [cutout];
    const otherRun = { ...structuredClone(currentRun(saved)), id: 'other-run' };
    saved.rooms[0].walls[0].runs.push(otherRun);
    expect(isElevationDocument(saved)).toBe(true); // ids are unique per run
    for (const profile of [saved.settings.defaultProfile, saved.rooms[0].profile,
      saved.rooms[0].walls[0].profile, currentRun(saved).overrides]) {
      for (const value of ['cut1', null, undefined]) {
        profile.baseCutoutProfileId = value;
        expect(isElevationDocument(saved)).toBe(true);
      }
      profile.baseCutoutProfileId = false;
      expect(isElevationDocument(saved)).toBe(false);
      delete profile.baseCutoutProfileId;
    }
    for (const key of ['baseCutoutFoot', 'baseCutoutHeight']) {
      const invalid = savedDocument();
      invalid.settings[key] = Infinity;
      expect(isElevationDocument(invalid)).toBe(false);
    }
  });

  it('accepts the cut1 base_cutout profile (anchor 3) with its own axes and no door or band slot', () => {
    const profile = {
      id: 'cut1', name: 'Cutout cove 1 1/2', kind: 'base_cutout',
      geometry: {
        units: 'in', points: { a: [0, 0], b: [1.5, 1.5] },
        loops: [{ id: 'L1', closed: false, segs: [
          { type: 'arc', from: 'a', to: 'b', center: [0, 1.5], ccw: true },
        ] }],
      },
      drawnPoints: { elevation: [] }, version: 1, archived: false,
    };
    expect(isSectionProfile(profile)).toBe(true);
    expect(PROFILE_KINDS.base_cutout).toEqual({
      label: 'Base cutout', axes: 'cutout',
      origin: "where the cutout leaves the floor; x toward the cutout's centre, y up",
    });
    expect([...Object.keys(PROFILE_SLOTS), 'base_cutout'].every((slot) => !profileFitsSlot(profile, slot))).toBe(true);
    const saved = savedDocument();
    saved.settings.sectionProfiles.push(profile);
    expect(load(saved).settings.sectionProfiles).toContainEqual(profile);
  });

  it('inherits team → room → wall picks, preserves null as square, and removes undefined picks', () => {
    let state = savedDocument();
    const roomId = state.rooms[0].id;
    const wallId = state.rooms[0].walls[0].id;
    const runId = currentRun(state).id;
    const resolved = () => resolveProfile(state.settings, state.rooms[0], state.rooms[0].walls[0]).baseCutoutProfileId;
    expect(resolved()).toBeNull();
    state.settings.defaultProfile.baseCutoutProfileId = 'team-cut';
    expect(resolved()).toBe('team-cut');
    state = elevationReducer(state, updateRoomProfile({ roomId, changes: { baseCutoutProfileId: 'room-cut' } }));
    expect(resolved()).toBe('room-cut');
    state = elevationReducer(state, updateWall({ roomId, wallId, changes: { profile: { baseCutoutProfileId: 'wall-cut' } } }));
    expect(resolved()).toBe('wall-cut');
    state = elevationReducer(state, updateWall({ roomId, wallId, changes: { profile: { baseCutoutProfileId: null } } }));
    expect(resolved()).toBeNull();
    state = elevationReducer(state, updateWall({ roomId, wallId, changes: { profile: { baseCutoutProfileId: undefined } } }));
    expect(state.rooms[0].walls[0].profile).not.toHaveProperty('baseCutoutProfileId');
    expect(resolved()).toBe('room-cut');
    state = elevationReducer(state, updateRoomProfile({ roomId, changes: { baseCutoutProfileId: null } }));
    expect(resolved()).toBeNull();
    state = elevationReducer(state, updateRoomProfile({ roomId, changes: { baseCutoutProfileId: undefined } }));
    expect(state.rooms[0].profile).not.toHaveProperty('baseCutoutProfileId');
    expect(resolved()).toBe('team-cut');
    state = elevationReducer(state, setRunOverride({ roomId, wallId, runId, key: 'baseCutoutProfileId', value: null }));
    expect(currentRun(state).overrides.baseCutoutProfileId).toBeNull();
    state = elevationReducer(state, setRunOverride({ roomId, wallId, runId, key: 'baseCutoutProfileId', value: undefined }));
    expect(currentRun(state).overrides).not.toHaveProperty('baseCutoutProfileId');
    expect(isElevationDocument(toElevationDocument(state))).toBe(true);
  });

  it('adds, updates and removes cutouts while rejecting invalid edits and missing targets', () => {
    const initial = savedDocument();
    const target = { roomId: initial.rooms[0].id, wallId: initial.rooms[0].walls[0].id, runId: currentRun(initial).id };
    let state = elevationReducer(initial, addBaseCutout({ ...target, cutout }));
    expect(currentRun(state).baseCutouts).toEqual([cutout]);
    expect(currentRun(initial)).not.toHaveProperty('baseCutouts');
    state = elevationReducer(state, addBaseCutout({ ...target, cutout }));
    state = elevationReducer(state, addBaseCutout({ ...target, cutout: { ...cutout, id: 'bad', width: 0 } }));
    expect(currentRun(state).baseCutouts).toEqual([cutout]);
    state = elevationReducer(state, addBaseCutout({ ...target, cutout: { ...cutout, id: 'k2' } }));
    state = elevationReducer(state, updateBaseCutout({ ...target, cutoutId: 'k1', changes: { to: 'c2', width: 24, profileId: 'cut1' } }));
    const edited = { ...cutout, to: 'c2', width: 24, profileId: 'cut1' };
    expect(currentRun(state).baseCutouts[0]).toEqual(edited);
    for (const changes of [{ id: 'k2' }, { width: 0 }, { profileId: false }]) {
      state = elevationReducer(state, updateBaseCutout({ ...target, cutoutId: 'k1', changes }));
      expect(currentRun(state).baseCutouts[0]).toEqual(edited);
    }
    state = elevationReducer(state, updateBaseCutout({ ...target, cutoutId: 'k1', changes: { width: undefined, profileId: null } }));
    expect(currentRun(state).baseCutouts[0]).toMatchObject({ id: 'k1', profileId: null });
    expect(currentRun(state).baseCutouts[0].width).toBeUndefined();
    expect(currentRun(load(toElevationDocument(state))).baseCutouts[0]).toEqual({ ...cutout, to: 'c2', profileId: null });
    for (const action of [
      addBaseCutout({ ...target, runId: 'missing', cutout }),
      updateBaseCutout({ ...target, cutoutId: 'missing', changes: { width: 10 } }),
      removeBaseCutout({ ...target, cutoutId: 'missing' }),
    ]) {
      expect(elevationReducer(state, action)).toEqual(state);
    }
    state = elevationReducer(state, removeBaseCutout({ ...target, cutoutId: 'k1' }));
    expect(currentRun(state).baseCutouts).toEqual([{ ...cutout, id: 'k2' }]);
    state = elevationReducer(state, removeBaseCutout({ ...target, cutoutId: 'k2' }));
    expect(currentRun(state).baseCutouts).toEqual([]);
  });
});
