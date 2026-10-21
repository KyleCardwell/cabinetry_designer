import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupsFor } from '../../model/settingGroups.js';
import { allowedAt, registryEntry } from '../../model/settingsRegistry.js';
import elevationReducer, {
  addWall, addWallSegment, createInitialElevationState, setRoomSetting, setSetting, updateWall,
} from '../elevationSlice.js';
import {
  ELEVATION_STORAGE_KEY, isElevationDocument, loadElevationDocument, roomFromDocument,
  toElevationDocument, toRoomDocument,
} from '../persistence.js';
import { createWall } from '../slices/helpers.js';

afterEach(() => vi.unstubAllGlobals());

const segment = { x1: 0, y1: 0, x2: 144, y2: 0 };
const wallOf = (state) => state.rooms[0].walls[0];

describe('UI9d wall thickness inheritance', () => {
  it('inherits default 4.5, team 6, room 5.5, then overrides to zero and resets (anchors 1–5)', () => {
    let state = elevationReducer(createInitialElevationState(null), addWallSegment(segment));
    const wallId = wallOf(state).id;
    const roomId = state.rooms[0].id;
    expect(wallOf(state)).toMatchObject({ thicknessOverride: null, thickness: 4.5 });
    state = elevationReducer(state, setSetting({ key: 'wallThickness', value: 6 }));
    expect(wallOf(state)).toMatchObject({ thicknessOverride: null, thickness: 6 });
    state = elevationReducer(state, setRoomSetting({ roomId, key: 'wallThickness', value: 5.5 }));
    expect(wallOf(state)).toMatchObject({ thicknessOverride: null, thickness: 5.5 });
    state = elevationReducer(state, updateWall({ wallId, changes: { thickness: 0 } }));
    expect(wallOf(state)).toMatchObject({ thicknessOverride: 0, thickness: 0 });
    expect(state.rooms[0].settingsOverrides.wallThickness).toBe(5.5);
    state = elevationReducer(state, updateWall({ wallId, changes: { thickness: null } }));
    expect(wallOf(state)).toMatchObject({ thicknessOverride: null, thickness: 5.5 });
  });

  it('loads old zero walls as overridden and old 4.5 walls as inheriting (anchors 6–7)', () => {
    for (const [thickness, thicknessOverride, expected] of [[0, 0, 0], [4.5, null, 5.5]]) {
      const state = elevationReducer(createInitialElevationState(null), addWallSegment(segment));
      const document = toElevationDocument(state);
      delete document.settings.wallThickness;
      document.rooms[0].settingsOverrides = { wallThickness: 5.5 };
      document.rooms[0].walls[0].thickness = thickness;
      delete document.rooms[0].walls[0].thicknessOverride;
      const original = structuredClone(document);
      vi.stubGlobal('window', { localStorage: {
        getItem: (key) => key === ELEVATION_STORAGE_KEY ? JSON.stringify(document) : null,
      } });
      const loaded = loadElevationDocument();
      expect(loaded.settings.wallThickness).toBe(4.5);
      expect(wallOf(loaded).thicknessOverride).toBe(thicknessOverride);
      const restored = createInitialElevationState(loaded);
      expect(wallOf(restored)).toMatchObject({ thicknessOverride, thickness: expected });
      const roomResult = roomFromDocument(document.rooms[0], document.schemaVersion, loaded.settings);
      expect(roomResult.ok).toBe(true);
      expect(wallOf(createInitialElevationState({ ...loaded, rooms: [roomResult.room] })))
        .toMatchObject({ thicknessOverride, thickness: expected });
      expect(document).toEqual(original);
    }
  });

  it('registers the room setting in Walls before Openings & soffits (anchor 8)', () => {
    const groups = groupsFor('room');
    expect(groups.find(({ id }) => id === 'walls'))
      .toEqual({ id: 'walls', label: 'Walls', keys: ['wallThickness'] });
    expect(groups.findIndex(({ id }) => id === 'walls'))
      .toBeLessThan(groups.findIndex(({ id }) => id === 'openings-soffits'));
    expect(registryEntry('wallThickness'))
      .toEqual({ key: 'wallThickness', label: 'Wall thickness', kind: 'number', lowest: 'room' });
    for (const level of ['team', 'project', 'phase', 'room']) expect(allowedAt('wallThickness', level)).toBe(true);
    expect(allowedAt('wallThickness', 'wall')).toBe(false);
  });

  it('uses explicit overrides before legacy thickness for fixtures and both add actions', () => {
    for (const [values, thicknessOverride, thickness] of [
      [{}, null, 6], [{ thickness: 4.5 }, null, 6], [{ thickness: 0 }, 0, 0],
      [{ thickness: 8 }, 8, 8], [{ thickness: 8, thicknessOverride: null }, null, 6],
      [{ thickness: 4.5, thicknessOverride: 4.5 }, 4.5, 4.5],
      [{ thickness: 8, thicknessOverride: 0 }, 0, 0],
    ]) {
      expect(createWall('', 0, 144, values).thicknessOverride).toBe(thicknessOverride);
      for (const add of [addWall, addWallSegment]) {
        let state = elevationReducer(createInitialElevationState(null), setSetting({ key: 'wallThickness', value: 6 }));
        state = elevationReducer(state, add({ ...segment, ...values }));
        expect(wallOf(state)).toMatchObject({ thicknessOverride, thickness });
      }
    }
  });

  it('ignores invalid thickness edits and keeps a typed default pinned across team edits', () => {
    let state = elevationReducer(createInitialElevationState(null), addWallSegment(segment));
    const wallId = wallOf(state).id;
    state = elevationReducer(state, updateWall({ wallId, changes: { thickness: 4.5 } }));
    state = elevationReducer(state, setSetting({ key: 'wallThickness', value: 6 }));
    for (const thickness of [-1, NaN, Infinity, -Infinity, '0', undefined, {}, true]) {
      state = elevationReducer(state, updateWall({ wallId, changes: { thickness } }));
      expect(wallOf(state)).toMatchObject({ thicknessOverride: 4.5, thickness: 4.5 });
    }
    state = elevationReducer(state, updateWall({ wallId, thickness: null }));
    expect(wallOf(state)).toMatchObject({ thicknessOverride: null, thickness: 6 });
  });

  it('validates optional overrides and round-trips null and numeric overrides while requiring thickness', () => {
    const state = elevationReducer(createInitialElevationState(null), addWallSegment(segment));
    for (const thicknessOverride of [undefined, null, 0, 4.5, 8]) {
      const document = toElevationDocument(state);
      const wall = wallOf(document);
      if (thicknessOverride === undefined) delete wall.thicknessOverride;
      else wall.thicknessOverride = thicknessOverride;
      expect(isElevationDocument(document)).toBe(true);
      const loaded = roomFromDocument(document.rooms[0], document.schemaVersion, document.settings);
      expect(loaded.ok).toBe(true);
      expect(toRoomDocument(loaded.room).walls[0].thicknessOverride).toBe(thicknessOverride ?? null);
    }
    for (const thicknessOverride of [-1, NaN, Infinity, '0', {}, true]) {
      const document = toElevationDocument(state);
      document.rooms[0].walls[0].thicknessOverride = thicknessOverride;
      expect(isElevationDocument(document)).toBe(false);
      expect(roomFromDocument(document.rooms[0], document.schemaVersion, document.settings).ok).toBe(false);
    }
    const document = toElevationDocument(state);
    delete document.rooms[0].walls[0].thickness;
    expect(isElevationDocument(document)).toBe(false);
    expect(toElevationDocument(state).rooms[0].walls[0].thicknessOverride).toBeNull();
  });
});
