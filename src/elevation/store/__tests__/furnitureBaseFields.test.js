import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveProfile } from '../../model/profile.js';
import elevationReducer, { updateRoomProfile, updateWall } from '../elevationSlice.js';
import {
  ELEVATION_STORAGE_KEY, isElevationDocument, loadElevationDocument,
  normalizeElevationDocument, toElevationDocument,
} from '../persistence.js';

const golden = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8'));
const savedDocument = () => normalizeElevationDocument(structuredClone(golden));
const fields = { baseKind: 'furniture_base', furnitureBaseProud: 0, furnitureBaseProfileId: 'fb4' };

afterEach(() => { delete globalThis.window; });

describe('SPEC-50.5 saved furniture base fields', () => {
  it('defaults the furniture base scribe on older saves and round-trips explicit values (step 495)', () => {
    const older = structuredClone(golden);
    expect(older.settings.furnitureBaseScribe).toBeUndefined();
    const saved = normalizeElevationDocument(older);
    expect(saved.settings.furnitureBaseScribe).toBe(0.5);
    expect(isElevationDocument(saved)).toBe(true);
    expect(older.settings.furnitureBaseScribe).toBeUndefined();
    for (const scribe of [0, 1]) {
      saved.settings.furnitureBaseScribe = scribe;
      const reloaded = normalizeElevationDocument(toElevationDocument(saved));
      expect(isElevationDocument(reloaded)).toBe(true);
      expect(reloaded.settings.furnitureBaseScribe).toBe(scribe);
    }
    for (const invalid of [null, '0.5', NaN, Infinity]) {
      saved.settings.furnitureBaseScribe = invalid;
      expect(isElevationDocument(saved)).toBe(false);
    }
  });

  it('accepts older profiles and round-trips the new fields at every level', () => {
    const saved = savedDocument();
    const room = saved.rooms[0];
    const wall = room.walls[0];
    expect(isElevationDocument(saved)).toBe(true);
    expect(resolveProfile(saved.settings, room, wall)).toMatchObject({
      baseKind: 'toe_kick', furnitureBaseProud: 0.8125, furnitureBaseProfileId: null,
    });
    Object.assign(saved.settings.defaultProfile, fields);
    Object.assign(room.profile, { ...fields, furnitureBaseProud: 1 });
    Object.assign(wall.profile, { ...fields, furnitureBaseProfileId: null });
    Object.assign(wall.runs[0].overrides, fields);
    expect(isElevationDocument(saved)).toBe(true);
    expect(normalizeElevationDocument(toElevationDocument(saved))).toEqual(saved);
    for (const value of [null, undefined]) {
      wall.runs[0].overrides = {
        baseKind: value, furnitureBaseProud: value, furnitureBaseProfileId: value,
      };
      expect(isElevationDocument(saved)).toBe(true);
    }
  });

  it('rejects malformed fields, including a loaded plinth run override (anchor 5)', () => {
    for (const level of ['team', 'room', 'wall', 'run']) {
      for (const patch of [
        { baseKind: 'plinth' }, { baseKind: 1 }, { furnitureBaseProud: -0.1 },
        { furnitureBaseProud: Infinity }, { furnitureBaseProud: NaN }, { furnitureBaseProud: '0.8125' },
        { furnitureBaseProfileId: false }, { furnitureBaseProfileId: '' },
      ]) {
        const saved = savedDocument();
        const room = saved.rooms[0];
        const wall = room.walls[0];
        const profile = level === 'team' ? saved.settings.defaultProfile
          : level === 'room' ? room.profile : level === 'wall' ? wall.profile : wall.runs[0].overrides;
        Object.assign(profile, patch);
        expect(isElevationDocument(saved)).toBe(false);
      }
    }
    const saved = savedDocument();
    saved.rooms[0].walls[0].runs[0].overrides = { baseKind: 'plinth' };
    globalThis.window = { localStorage: {
      getItem: (key) => key === ELEVATION_STORAGE_KEY ? JSON.stringify(saved) : null,
    } };
    expect(loadElevationDocument()).toBeNull();
    saved.rooms[0].walls[0].runs[0].overrides = { unknown: 1 };
    expect(isElevationDocument(saved)).toBe(false);
  });

  it('preserves null picks and removes undefined picks in room and wall profile edits', () => {
    let state = savedDocument();
    const roomId = state.rooms[0].id;
    const wallId = state.rooms[0].walls[0].id;
    state = elevationReducer(state, updateRoomProfile({ roomId, changes: fields }));
    state = elevationReducer(state, updateWall({ roomId, wallId, changes: { profile: fields } }));
    expect(state.rooms[0].profile).toMatchObject(fields);
    expect(state.rooms[0].walls[0].profile).toMatchObject(fields);
    state = elevationReducer(state, updateRoomProfile({ roomId, changes: { furnitureBaseProfileId: null } }));
    state = elevationReducer(state, updateWall({ roomId, wallId, changes: {
      profile: { baseKind: null, furnitureBaseProud: null, furnitureBaseProfileId: null },
    } }));
    expect(state.rooms[0].profile.furnitureBaseProfileId).toBeNull();
    expect(state.rooms[0].walls[0].profile).toEqual({ furnitureBaseProfileId: null });
    state = elevationReducer(state, updateRoomProfile({ roomId, changes: { furnitureBaseProfileId: undefined } }));
    state = elevationReducer(state, updateWall({ roomId, wallId, changes: {
      profile: { furnitureBaseProfileId: undefined },
    } }));
    expect(state.rooms[0].profile).not.toHaveProperty('furnitureBaseProfileId');
    expect(state.rooms[0].walls[0].profile).not.toHaveProperty('furnitureBaseProfileId');
    expect(isElevationDocument(toElevationDocument(state))).toBe(true);
  });
});
