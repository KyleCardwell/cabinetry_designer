import { LEGACY_DOOR_DESIGNS } from './fixtures/legacyDoorDesigns.js';
import { isDoorDesign } from '../doorDesigns.js';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DOOR_DESIGNS, DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { newSectionProfile } from '../sectionProfiles.js';
import { SETTINGS_REGISTRY } from '../settingsRegistry.js';
import { BUILT_IN_SLIDES } from '../slides.js';
import { BUILT_IN_PULLS } from '../pulls.js';
import {
  doorDesignIdFor,
  doorDesignFromRow,
  doorDesignToRow,
  isUuid,
  profileFromRow,
  profileToRow,
  pullToRow,
  pullFromRow,
  pullIdFor,
  slideToRow,
  slideFromRow,
  slideIdFor,
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
  it('HP3b c maps built-in and custom pulls without losing the estimator link (anchor 1)', () => {
    expect(pullToRow(BUILT_IN_PULLS[0])).toEqual({
      name: '4" pull', data: { kind: 'pull', length: 4.75, centers: 4, width: 0.375, projection: 1.25, seedId: 'pull-4' },
      hardware_pull_id: null,
    });
    const custom = { ...BUILT_IN_PULLS[0], id: DID, hardwarePullId: 3 };
    const row = pullToRow(custom);
    expect(row.data).not.toHaveProperty('seedId');
    expect(row.hardware_pull_id).toBe(3);
    expect(pullIdFor({ pull_id: DID, ...row })).toBe(DID);
    expect(pullFromRow({ pull_id: DID, ...row })).toEqual(custom);
    for (const pull of [BUILT_IN_PULLS[1], { id: DID, name: 'Tab', kind: 'tab', length: 3, height: 0.5, projection: 1, hardwarePullId: 3 }]) {
      expect(pullFromRow({ pull_id: DID, ...pullToRow(pull) })).toEqual(pull);
    }
  });

  it('HP3b c validates pull rows and restores seed ids (anchor 2)', () => {
    const row = { pull_id: DID, name: 'Bar', data: { kind: 'pull', length: 5, width: 0.375, projection: 1.25 },
      hardware_pull_id: null, version: 2, archived_at: null };
    expect(pullFromRow(row)).toEqual({ id: DID, name: 'Bar', kind: 'pull', length: 5, width: 0.375, projection: 1.25, hardwarePullId: null });
    expect(pullFromRow({ ...row, data: { kind: 'knob', projection: 1 } })).toBeNull();
    const knob = { ...row, data: { kind: 'knob', diameter: 1.25, projection: 1, seedId: 'knob-1-25' } };
    expect(pullFromRow(knob).id).toBe('knob-1-25');
    expect(pullIdFor(knob)).toBe('knob-1-25');
    for (const invalid of [null, { ...row, pull_id: 'bad' }, { ...row, data: {} },
      { ...row, hardware_pull_id: 0 }, { ...row, data: { ...row.data, diameter: 1 } },
      { ...knob, data: { ...knob.data, seedId: 'pull-4' } }]) expect(pullFromRow(invalid)).toBeNull();
  });

  it('IN4b c maps built-in and uuid slides, preserving lengths and estimator links (anchor 1)', () => {
    const expectedData = {
      brand: 'Blum', model: '562H', description: 'Blum Tandem 562H soft-close',
      cvName: 'Blum 562H3810B-.25 clrnc-No Notch', mount: 'undermount',
      lengths: [9, 12, 15, 18, 21, 24, 27, 30, 33, 36].map((nominal) => nominal === 15
        ? { nominal, length: 15.515625, extension: 14.953125 } : { nominal }),
      sideClearance: 0.25, minBelow: 0.5625, minAbove: 0.25, height: 1,
      clips: true, softClose: true, heavyDuty: false,
    };
    const row = slideToRow(BUILT_IN_SLIDES[0]);
    expect(row).toEqual({ name: 'Blum Tandem 562H', data: { ...expectedData, seedId: 'blum-562h' }, hardware_slide_id: null });
    row.data.lengths[0].nominal = 10;
    expect(BUILT_IN_SLIDES[0].lengths[0].nominal).toBe(9);
    const custom = { ...BUILT_IN_SLIDES[0], id: DID, hardwareSlideId: 3 };
    expect(slideToRow(custom)).toEqual({ name: custom.name, data: expectedData, hardware_slide_id: 3 });
    expect(slideFromRow({ slide_id: DID, ...slideToRow(custom) })).toEqual(custom);
  });

  it('IN4b c validates slide rows and restores built-in ids and mounts (anchor 2)', () => {
    const { data } = slideToRow({ ...BUILT_IN_SLIDES[1], id: DID });
    const row = { slide_id: DID, name: 'Hettich', data, hardware_slide_id: null, version: 2, archived_at: null };
    expect(slideFromRow(row)).toEqual({ ...BUILT_IN_SLIDES[1], id: DID, name: 'Hettich', hardwareSlideId: null });
    expect(slideIdFor(row)).toBe(DID);
    expect(slideFromRow({ ...row, data: { mount: 'side' } })).toBeNull();
    const seedRow = { ...row, data: { ...data, seedId: 'accuride-4034' } };
    expect(slideFromRow(seedRow).id).toBe('accuride-4034');
    expect(slideIdFor(seedRow)).toBe('accuride-4034');
    for (const invalid of [null, { ...row, slide_id: 'bad' }, { ...row, data: {} },
      { ...row, hardware_slide_id: 0 }, { ...row, data: { ...data, price: 3 } },
      { ...seedRow, data: { ...seedRow.data, mount: 'undermount' } }]) expect(slideFromRow(invalid)).toBeNull();
  });

  it('IN4b c keeps slides out of the shop-standard row and defaults clone (anchor 6)', () => {
    expect(teamSettingsToRow({ ...DEFAULT_SETTINGS, slides: BUILT_IN_SLIDES })).not.toHaveProperty('slides');
    expect(teamSettingsFromRow({})).not.toHaveProperty('slides');
    expect(teamSettingsFromRow({ slides: BUILT_IN_SLIDES })).not.toHaveProperty('slides');
  });

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
    expect(row).not.toHaveProperty('pulls');
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
    expect(teamSettingsFromRow({})).not.toHaveProperty('pulls');
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
