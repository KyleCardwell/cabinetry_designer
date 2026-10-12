import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../../model/constants.js';
import { resolveProfile } from '../../model/profile.js';
import { PROFILE_KINDS } from '../../model/sectionProfiles.js';
import elevationReducer, { setRunOverride, updateRoomProfile, updateWall } from '../elevationSlice.js';
import { isElevationDocument, normalizeElevationDocument, toElevationDocument } from '../persistence.js';

const golden = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8'));
const savedDocument = () => normalizeElevationDocument(structuredClone(golden));
const currentRun = (state) => state.rooms[0].walls[0].runs[0];

describe('SPEC-50.8 step 498 nosing pick data', () => {
  it('defaults to null and round-trips nullable picks at every scope, rejecting malformed picks (anchor 1)', () => {
    expect(DEFAULT_PROFILE.nosingProfileId).toBeNull();
    expect(DEFAULT_SETTINGS.defaultProfile.nosingProfileId).toBeNull();
    const older = savedDocument();
    expect(isElevationDocument(older)).toBe(true);
    expect(resolveProfile(older.settings, older.rooms[0], older.rooms[0].walls[0]).nosingProfileId).toBeNull();
    expect(PROFILE_KINDS.nosing).toMatchObject({
      axes: 'run',
      origin: "the top's front edge, at its top surface (its back edge sits on the faces, plus any front overhang)",
    });
    for (const scope of ['team', 'room', 'wall', 'run']) {
      for (const value of ['nz1', null, undefined, '', 1, false, {}]) {
        const saved = savedDocument();
        const room = saved.rooms[0];
        const wall = room.walls[0];
        const profile = scope === 'team' ? saved.settings.defaultProfile
          : scope === 'room' ? room.profile : scope === 'wall' ? wall.profile : wall.runs[0].overrides;
        profile.nosingProfileId = value;
        const valid = value === undefined || value === null || value === 'nz1';
        expect(isElevationDocument(saved)).toBe(valid);
        if (valid) {
          const serialized = JSON.parse(JSON.stringify(toElevationDocument(saved)));
          const reloaded = normalizeElevationDocument(serialized);
          expect(isElevationDocument(reloaded)).toBe(true);
          expect(toElevationDocument(reloaded)).toEqual(serialized);
        }
      }
    }
  });

  it('inherits picks, preserves explicit null at room, wall and run scopes, and removes undefined (anchor 2)', () => {
    let state = savedDocument();
    const target = { roomId: state.rooms[0].id, wallId: state.rooms[0].walls[0].id, runId: currentRun(state).id };
    const resolved = () => resolveProfile(state.settings, state.rooms[0], state.rooms[0].walls[0]);
    // Resolve the run override layer using the same nullable profile merge.
    const resolvedRun = () => resolveProfile({ ...state.settings, defaultProfile: resolved() },
      { profile: currentRun(state).overrides }, null).nosingProfileId;
    state.settings.defaultProfile.nosingProfileId = 'team-nosing';
    expect(resolvedRun()).toBe('team-nosing');
    state = elevationReducer(state, updateRoomProfile({ ...target, changes: { nosingProfileId: 'nz1' } }));
    expect(resolvedRun()).toBe('nz1');
    state = elevationReducer(state, setRunOverride({ ...target, key: 'nosingProfileId', value: null }));
    expect(currentRun(state).overrides.nosingProfileId).toBeNull();
    expect(resolvedRun()).toBeNull();
    state = elevationReducer(state, setRunOverride({ ...target, key: 'nosingProfileId', value: undefined }));
    expect(currentRun(state).overrides).not.toHaveProperty('nosingProfileId');
    expect(resolvedRun()).toBe('nz1');
    state = elevationReducer(state, updateWall({ ...target, changes: { profile: { nosingProfileId: 'wall-nosing' } } }));
    expect(resolved().nosingProfileId).toBe('wall-nosing');
    state = elevationReducer(state, updateWall({ ...target, changes: { profile: { nosingProfileId: null } } }));
    expect(state.rooms[0].walls[0].profile.nosingProfileId).toBeNull();
    expect(resolved().nosingProfileId).toBeNull();
    state = elevationReducer(state, updateWall({ ...target, changes: { profile: { nosingProfileId: undefined } } }));
    expect(state.rooms[0].walls[0].profile).not.toHaveProperty('nosingProfileId');
    expect(resolved().nosingProfileId).toBe('nz1');
    state = elevationReducer(state, updateRoomProfile({ ...target, changes: { nosingProfileId: null } }));
    expect(state.rooms[0].profile.nosingProfileId).toBeNull();
    expect(resolved().nosingProfileId).toBeNull();
    state = elevationReducer(state, updateRoomProfile({ ...target, changes: { nosingProfileId: undefined } }));
    expect(state.rooms[0].profile).not.toHaveProperty('nosingProfileId');
    expect(resolved().nosingProfileId).toBe('team-nosing');
    expect(isElevationDocument(toElevationDocument(state))).toBe(true);
  });
});
