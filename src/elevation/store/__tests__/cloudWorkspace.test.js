import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_DOOR_DESIGNS } from '../../model/__tests__/fixtures/legacyDoorDesigns.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../../model/doorStyles.js';
import { newSectionProfile } from '../../model/sectionProfiles.js';
import { profileToRow } from '../../model/cloudRows.js';
import { setSetting } from '../elevationSlice.js';
import { loadProjectLayers, openCloudWorkspace, openLocalWorkspace } from '../cloudThunks.js';
import { ELEVATION_STORAGE_KEY, persistElevationDocument } from '../persistence.js';
import { settingsFor } from '../slices/helpers.js';
import { ALL, cloudStore, fakeDesignApi, fakeUuid } from './helpers/fakeDesignApi.js';

afterEach(() => vi.unstubAllGlobals());

const VIEW_ONLY = { view: true, edit: false, manage: false };

describe('DB4 e shop workspace', () => {
  it('opens an empty team on the code defaults and writes the four built-in designs once', async () => {
    const api = fakeDesignApi();
    const store = cloudStore(api);
    expect(await store.dispatch(openCloudWorkspace())).toEqual({ ok: true });
    const elevation = store.getState().elevation;
    expect(elevation.source).toBe('cloud');
    expect(elevation.rooms).toEqual([]);
    expect(elevation.settings.roundTo).toBe(0.5);
    expect(elevation.settings.sectionProfiles).toEqual([]);
    expect(elevation.settings.doorDesigns.map((design) => design.id)).toEqual(['five-piece-square', 'slab', 'slab-mdf', 'micro-shaker']);
    expect(api.db.doorDesigns.map((row) => row.data.seedId)).toEqual(['five-piece-square', 'slab', 'slab-mdf', 'micro-shaker']);
    expect(elevation.cloud.teamVersion).toBe(0);
    expect(elevation.cloud.rows.doorDesigns.slab).toEqual({ rowId: api.db.doorDesigns[1].design_id, version: 1 });

    await store.dispatch(openCloudWorkspace());
    expect(api.db.doorDesigns).toHaveLength(4);
    expect(store.getState().elevation.cloud.loadId).toBe(2);
  });

  it('keeps built-ins in memory only for a user who cannot manage the library', async () => {
    const api = fakeDesignApi();
    const store = cloudStore(api, VIEW_ONLY);
    await store.dispatch(openCloudWorkspace());
    expect(api.db.doorDesigns).toHaveLength(0);
    expect(store.getState().elevation.settings.doorDesigns).toHaveLength(4);
    expect(store.getState().elevation.cloud.rows.doorDesigns).toEqual({});
  });

  it('loads the stored standard, profiles (archived too) and their row versions', async () => {
    const id = fakeUuid();
    const profile = { ...newSectionProfile([], id, null, 'crown'), name: 'Crown 4' };
    const api = fakeDesignApi({
      teamSettings: { settings: { roundTo: 0.25, teamDoorStyle: DEFAULT_DOOR_STYLE }, version: 6 },
      profiles: [{ ...profileToRow(profile), version: 4, archived_at: 't' }, { profile_id: 'bad', kind: 'crown', name: 'x', data: {}, version: 1 }],
    });
    const store = cloudStore(api);
    await store.dispatch(openCloudWorkspace());
    const elevation = store.getState().elevation;
    expect(elevation.settings.roundTo).toBe(0.25);
    expect(elevation.cloud.teamVersion).toBe(6);
    expect(elevation.settings.sectionProfiles).toEqual([{ ...profile, archived: true }]);
    expect(elevation.cloud.rows.profiles[id]).toEqual({ rowId: id, version: 4 });
    expect(elevation.message).toMatch(/1 profile couldn't be read/);
  });

  it('refuses without a team', async () => {
    const store = cloudStore(fakeDesignApi(), ALL, null);
    expect((await store.dispatch(openCloudWorkspace())).reason).toBe('no_team');
    expect(store.getState().elevation.source).toBe('local');
  });

  it('loads project and phase overrides into the resolver', async () => {
    const api = fakeDesignApi({ project: {
      project: { est_project_id: 42 },
      design: { overrides: { roundTo: 0.25, bogus: 1 }, version: 3 },
      phases: [{ phase_id: 'ph-1', overrides: { baseDepth: 25 }, version: 2, rooms: [] }],
    } });
    const store = cloudStore(api);
    await store.dispatch(openCloudWorkspace());
    expect(await store.dispatch(loadProjectLayers({ estProjectId: 42, phaseId: 'ph-1' }))).toEqual({ ok: true });
    const elevation = store.getState().elevation;
    expect(elevation.layers).toEqual({ project: { id: 42, values: { roundTo: 0.25 } }, phase: { id: 'ph-1', values: { baseDepth: 25 } } });
    expect(elevation.cloud.layerVersions).toEqual({ project: 3, phase: 2 });
    const settings = settingsFor(elevation, null);
    expect([settings.roundTo, settings.baseDepth]).toEqual([0.25, 25]);
    expect((await store.dispatch(loadProjectLayers({ estProjectId: 42, phaseId: 'nope' }))).reason).toBe('not_found');
  });

  it('never writes shop data to localStorage, and going back restores the sandbox document', async () => {
    const storage = new Map();
    vi.stubGlobal('window', { localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    } });
    const store = cloudStore(fakeDesignApi());
    persistElevationDocument(store.getState().elevation);
    const sandbox = storage.get(ELEVATION_STORAGE_KEY);
    const sandboxRoomId = store.getState().elevation.activeRoomId;

    await store.dispatch(openCloudWorkspace());
    store.dispatch(setSetting({ key: 'roundTo', value: 0.125 }));
    persistElevationDocument(store.getState().elevation);
    expect(storage.get(ELEVATION_STORAGE_KEY)).toBe(sandbox);

    store.dispatch(openLocalWorkspace());
    const elevation = store.getState().elevation;
    expect(elevation.source).toBe('local');
    expect(elevation.cloud).toBeNull();
    expect(elevation.activeRoomId).toBe(sandboxRoomId);
    expect(elevation.settings.roundTo).toBe(0.5);
  });
});


it('527. loads legacy built-in rows in place without rewriting them or resetting the MDF team style', async () => {
  const rows = LEGACY_DOOR_DESIGNS.map(({ id, code, ...data }) => ({
    design_id: fakeUuid(), code, data: { ...data, seedId: id }, version: 3,
  }));
  const api = fakeDesignApi({ doorDesigns: rows, teamSettings: {
    settings: { teamDoorStyle: { ...DEFAULT_DOOR_STYLE, designId: 'slab-applied' } }, version: 2,
  } });
  const before = structuredClone(api.db.doorDesigns);
  const store = cloudStore(api);
  expect(await store.dispatch(openCloudWorkspace())).toEqual({ ok: true });
  const elevation = store.getState().elevation;
  expect(elevation.settings.doorDesigns).toEqual(DOOR_DESIGNS);
  expect(elevation.settings.teamDoorStyle.designId).toBe('slab-mdf');
  expect(elevation.cloud.rows.doorDesigns['slab-mdf']).toEqual({ rowId: rows[2].design_id, version: 3 });
  expect(api.db.doorDesigns.slice(0, 3)).toEqual(before);
  expect(api.db.doorDesigns).toHaveLength(4);
  expect(api.db.doorDesigns[3].data.seedId).toBe('micro-shaker');
  await store.dispatch(openCloudWorkspace());
  expect(api.db.doorDesigns).toHaveLength(4);
  expect(elevation.message).toBeNull();
});
