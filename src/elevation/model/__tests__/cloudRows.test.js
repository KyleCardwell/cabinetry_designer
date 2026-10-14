import { LEGACY_DOOR_DESIGNS } from './fixtures/legacyDoorDesigns.js';
import { isDoorDesign } from '../doorDesigns.js';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DOOR_DESIGNS, DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { newSectionProfile } from '../sectionProfiles.js';
import { SETTINGS_REGISTRY } from '../settingsRegistry.js';
import {
  doorDesignIdFor,
  doorDesignFromRow,
  doorDesignToRow,
  isUuid,
  profileFromRow,
  profileToRow,
  teamSettingsFromRow,
  teamSettingsToRow,
} from '../cloudRows.js';

const PID = '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const DID = '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';

function leafKeys(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => (
    child && typeof child === 'object' && !Array.isArray(child)
      ? leafKeys(child, `${prefix}${key}.`)
      : [`${prefix}${key}`]));
}

describe('cloudRows', () => {
  it('recognises uuids only', () => {
    expect(isUuid(PID)).toBe(true);
    expect(isUuid('sp-bead5')).toBe(false);
    expect(isUuid('five-piece-square')).toBe(false);
  });

  it('round-trips a profile; archived lives on the row, shape version in data', () => {
    const profile = { ...newSectionProfile([], PID, null, 'door_outside'), name: 'Flush bead', version: 3, archived: true };
    const row = profileToRow(profile);
    expect(row.profile_id).toBe(PID);
    expect(row.kind).toBe('door_outside');
    expect(row.name).toBe('Flush bead');
    expect(row.data).not.toHaveProperty('id');
    expect(row.data).not.toHaveProperty('archived');
    expect(row.data.version).toBe(3);
    const back = profileFromRow({ ...row, version: 7, archived_at: '2026-10-14T00:00:00Z', sort: 2 });
    expect(back).toEqual(profile);
    expect(profileFromRow({ ...row, archived_at: null }).archived).toBe(false);
  });

  it('rejects a row that is not a valid profile', () => {
    expect(profileFromRow({ profile_id: PID, kind: 'door_outside', name: 'x', data: { drawnPoints: {} } })).toBeNull();
    expect(profileFromRow({ ...profileToRow(newSectionProfile([], PID, null, 'crown')), profile_id: 'sp-1' })).toBeNull();
  });

  it('keeps a built-in door design id in data.seedId', () => {
    const seeded = { ...DOOR_DESIGNS[0], code: '110', vendor: 'Stillwater' };
    const row = doorDesignToRow(seeded);
    expect(row.code).toBe('110');
    expect(row.data.seedId).toBe('five-piece-square');
    expect(row.data).not.toHaveProperty('id');
    expect(doorDesignFromRow({ design_id: DID, ...row })).toEqual(seeded);
  });

  it('uses the row uuid for a team design', () => {
    const design = { ...DOOR_DESIGNS[0], id: DID, code: '114', topRail: { shape: 'arch' } };
    const row = doorDesignToRow(design);
    expect(row.data).not.toHaveProperty('seedId');
    expect(doorDesignFromRow({ design_id: DID, ...row })).toEqual(design);
  });

  it('stores every registry leaf plus teamDoorStyle, and nothing else', () => {
    const row = teamSettingsToRow({ ...DEFAULT_SETTINGS, doorDesigns: DOOR_DESIGNS, sectionProfiles: [], orthoWalls: true });
    const keys = leafKeys(row).filter((key) => !key.startsWith('teamDoorStyle.'));
    expect(keys.sort()).toEqual(SETTINGS_REGISTRY.map(({ key }) => key).sort());
    expect(row.teamDoorStyle).toEqual(DEFAULT_DOOR_STYLE);
    expect(row).not.toHaveProperty('doorDesigns');
    expect(row).not.toHaveProperty('sectionProfiles');
    expect(row).not.toHaveProperty('orthoWalls');
  });

  it('fills a stored standard from the code defaults and drops what it does not know', () => {
    const settings = teamSettingsFromRow({ roundTo: 0.25, baseDepth: 'x', bogus: 1, insetFrame: { stile: 1 } });
    expect(settings.roundTo).toBe(0.25);
    expect(settings.baseDepth).toBe(24);
    expect(settings.insetFrame.stile).toBe(1);
    expect(settings.insetFrame.rail).toBe(DEFAULT_SETTINGS.insetFrame.rail);
    expect(settings).not.toHaveProperty('bogus');
    expect(settings).not.toHaveProperty('doorDesigns');
    expect(settings.teamDoorStyle).toEqual(DEFAULT_DOOR_STYLE);
    expect(teamSettingsFromRow(null).roundTo).toBe(0.5);
  });
});


it('527. migrates the old MDF Supabase seed on read without changing the row (anchor 5)', () => {
  const { id, code, ...data } = structuredClone(LEGACY_DOOR_DESIGNS[2]);
  const row = { design_id: DID, code, data: { ...data, seedId: id } };
  const before = structuredClone(row);
  const migrated = doorDesignFromRow(row);
  expect(migrated).toEqual(DOOR_DESIGNS[2]);
  expect(isDoorDesign(migrated)).toBe(true);
  expect(doorDesignIdFor(row)).toBe('slab-mdf');
  expect(doorDesignToRow(migrated).data.seedId).toBe('slab-mdf');
  expect(row).toEqual(before);
  expect(teamSettingsFromRow({ teamDoorStyle: { ...DEFAULT_DOOR_STYLE, designId: 'slab-applied' } }).teamDoorStyle.designId).toBe('slab-mdf');
});
