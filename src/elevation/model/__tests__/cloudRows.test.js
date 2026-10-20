import { LEGACY_DOOR_DESIGNS } from './fixtures/legacyDoorDesigns.js';
import { isDoorDesign } from '../doorDesigns.js';
import { isAccessory } from '../accessories.js';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DOOR_DESIGNS, DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { newSectionProfile } from '../sectionProfiles.js';
import { SETTINGS_REGISTRY } from '../settingsRegistry.js';
import { BUILT_IN_SLIDES, isSlide } from '../slides.js';
import { BUILT_IN_PULLS, isPull } from '../pulls.js';
import {
  accessoryToRow,
  accessoryFromRow,
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

it('IN4c a anchors 2 and 3: defaults missing slide back clearance by seedId, else zero', () => {
  for (const [base, expected] of [
    [BUILT_IN_SLIDES[0], 0.75], [BUILT_IN_SLIDES[1], 0], [BUILT_IN_SLIDES[2], 0],
    [{ ...BUILT_IN_SLIDES[0], id: DID, name: 'Custom slide' }, 0],
  ]) {
    const row = { ...slideToRow(base), slide_id: DID };
    delete row.data.backClearance;
    const before = structuredClone(row);
    const loaded = slideFromRow(row);
    expect(loaded.backClearance).toBe(expected);
    expect(isSlide(loaded)).toBe(true);
    expect(row).toEqual(before);
    expect(slideToRow(loaded).data.backClearance).toBe(expected);
    for (const backClearance of [0, 0.25, 1.5]) {
      expect(slideFromRow({ ...row, data: { ...row.data, backClearance } }).backClearance).toBe(backClearance);
    }
    for (const backClearance of [-0.25, null, '0.75', Infinity, NaN, undefined]) {
      expect(slideFromRow({ ...row, data: { ...row.data, backClearance } })).toBeNull();
    }
  }
});

it('LP1 anchor 4: defaults legacy shop row pricing and skips invalid present values', () => {
  for (const [base, toRow, fromRow, idKey, validate] of [
    [BUILT_IN_PULLS[0], pullToRow, pullFromRow, 'pull_id', isPull],
    [BUILT_IN_SLIDES[0], slideToRow, slideFromRow, 'slide_id', isSlide],
  ]) {
    const row = { ...toRow(base), [idKey]: DID };
    for (const key of ['price', 'actualCost', 'labor']) delete row.data[key];
    if (idKey === 'slide_id') row.data.cvName = 'Retired name';
    const before = structuredClone(row);
    const loaded = fromRow(row);
    expect(loaded).toEqual(base);
    expect(validate(loaded)).toBe(true);
    expect(row).toEqual(before);
    for (const [key, value] of [['price', 'x'], ['actualCost', -1], ['labor', null]]) {
      expect(fromRow({ ...row, data: { ...row.data, [key]: value } })).toBeNull();
    }
  }
});

it('LP1 anchor 6: writes priced pulls and slides with unchanged hardware link columns', () => {
  for (const [base, toRow, fromRow, idKey, linkKey, column] of [
    [BUILT_IN_PULLS[0], pullToRow, pullFromRow, 'pull_id', 'hardwarePullId', 'hardware_pull_id'],
    [BUILT_IN_SLIDES[0], slideToRow, slideFromRow, 'slide_id', 'hardwareSlideId', 'hardware_slide_id'],
  ]) {
    const item = { ...base, price: 12, actualCost: 8, labor: { '7': 4 }, [linkKey]: 42 };
    const row = toRow(item);
    expect(row.data).toMatchObject({ price: 12, actualCost: 8, labor: { '7': 4 } });
    expect(row[column]).toBe(42);
    expect(row.data).not.toHaveProperty(linkKey);
    expect(fromRow({ ...row, [idKey]: DID })).toEqual(item);
    row.data.labor['7'] = 10;
    expect(item.labor).toEqual({ '7': 4 });
  }
});

function leafKeys(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => (
    child && typeof child === 'object' && !Array.isArray(child)
      ? leafKeys(child, `${prefix}${key}.`)
      : [`${prefix}${key}`]));
}

describe('cloudRows', () => {
  it('HP3b c maps built-in and custom pulls without losing the estimator link (anchor 1)', () => {
    expect(pullToRow(BUILT_IN_PULLS[0])).toEqual({
      name: '4" pull', data: { kind: 'pull', length: 4.75, centers: 4, width: 0.375, projection: 1.25, price: null, actualCost: null, labor: {}, seedId: 'pull-4' },
      hardware_pull_id: null,
    });
    const custom = { ...BUILT_IN_PULLS[0], id: DID, hardwarePullId: 3 };
    const row = pullToRow(custom);
    expect(row.data).not.toHaveProperty('seedId');
    expect(row.hardware_pull_id).toBe(3);
    expect(pullIdFor({ pull_id: DID, ...row })).toBe(DID);
    expect(pullFromRow({ pull_id: DID, ...row })).toEqual(custom);
    for (const pull of [BUILT_IN_PULLS[1], { id: DID, name: 'Tab', kind: 'tab', length: 3, height: 0.5, projection: 1, hardwarePullId: 3, price: null, actualCost: null, labor: {} }]) {
      expect(pullFromRow({ pull_id: DID, ...pullToRow(pull) })).toEqual(pull);
    }
  });

  it('HP3b c validates pull rows and restores seed ids (anchor 2)', () => {
    const row = { pull_id: DID, name: 'Bar', data: { kind: 'pull', length: 5, width: 0.375, projection: 1.25 },
      hardware_pull_id: null, version: 2, archived_at: null };
    expect(pullFromRow(row)).toEqual({ id: DID, name: 'Bar', kind: 'pull', length: 5, width: 0.375, projection: 1.25, hardwarePullId: null, price: null, actualCost: null, labor: {} });
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
      mount: 'undermount',
      lengths: [9, 12, 15, 18, 21, 24, 27, 30, 33, 36].map((nominal) => nominal === 15
        ? { nominal, length: 15.515625, extension: 14.953125 } : { nominal }),
      sideClearance: 0.25, backClearance: 0.75, minBelow: 0.5625, minAbove: 0.25, height: 1,
      clips: true, softClose: true, heavyDuty: false, price: null, actualCost: null, labor: {},
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
    expect(slideFromRow({ ...row, data: { ...data, cvName: 'Accuride 3832-8-No Notch' } }))
      .toEqual({ ...BUILT_IN_SLIDES[1], id: DID, name: 'Hettich', hardwareSlideId: null });
    const seedRow = { ...row, data: { ...data, seedId: 'accuride-4034' } };
    expect(slideFromRow(seedRow).id).toBe('accuride-4034');
    expect(slideIdFor(seedRow)).toBe('accuride-4034');
    for (const invalid of [null, { ...row, slide_id: 'bad' }, { ...row, data: {} },
      { ...row, hardware_slide_id: 0 }, { ...row, data: { ...data, price: 'x' } },
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


it('IN4b d round-trips the default slide and replaces an empty stored ID (anchor 4)', () => {
  for (const drawerSlideId of ['blum-562h', 'accuride-3832', 'gone']) {
    const row = teamSettingsToRow({ ...DEFAULT_SETTINGS, drawerSlideId });
    expect(row.drawerSlideId).toBe(drawerSlideId);
    expect(teamSettingsFromRow(row).drawerSlideId).toBe(drawerSlideId);
  }
  expect(teamSettingsFromRow({ drawerSlideId: '' }).drawerSlideId).toBe('blum-562h');
  expect(teamSettingsToRow({ drawerSlideId: '' })).not.toHaveProperty('drawerSlideId');
});

const susan = {
  id: DID, name: 'Lazy susan 28', brand: 'Rev-A-Shelf', model: '6472-28',
  description: '28" kidney lazy susan', reportText: '6472-28 lazy susan',
  attachesTo: 'section', wholeSection: true, minOpening: { width: 27, depth: 22, height: null },
  size: { width: null, height: null, depth: null }, lengthDeduction: null,
  ownSlides: false, effects: [], pricing: 'unit', price: 185, actualCost: 112.4, labor: { '7': 15, '9': 5 },
};

it('IN12b c maps every accessory field except id and name into data (anchor 1)', () => {
  const expectedData = {
    brand: 'Rev-A-Shelf', model: '6472-28', description: '28" kidney lazy susan', reportText: '6472-28 lazy susan',
    attachesTo: 'section', wholeSection: true, minOpening: { width: 27, depth: 22, height: null },
    size: { width: null, height: null, depth: null }, lengthDeduction: null,
    ownSlides: false, effects: [], pricing: 'unit', price: 185, actualCost: 112.4, labor: { '7': 15, '9': 5 },
  };
  const row = accessoryToRow(susan);
  expect(row).toEqual({ name: 'Lazy susan 28', data: expectedData });
  row.data.labor['7'] = 99;
  row.data.minOpening.width = 99;
  expect(susan.labor['7']).toBe(15);
  expect(susan.minOpening.width).toBe(27);
});

it('IN12b c validates accessory rows and restores their uuid (anchor 2)', () => {
  const row = { accessory_id: DID, ...accessoryToRow(susan), version: 2, archived_at: null };
  const loaded = accessoryFromRow(row);
  expect(loaded).toEqual(susan);
  loaded.labor['7'] = 99;
  expect(row.data.labor['7']).toBe(15);
  for (const invalid of [null, { ...row, accessory_id: 'bad' }, { ...row, data: { attachesTo: 'section' } },
    { ...row, data: { ...row.data, seedId: DID } }, { ...row, data: { ...row.data, price: -1 } }]) {
    expect(accessoryFromRow(invalid)).toBeNull();
  }
});

it('IN12b c keeps accessories out of the shop standard and defaults clone (anchor 6)', () => {
  expect(teamSettingsToRow({ ...DEFAULT_SETTINGS, accessories: [susan] })).not.toHaveProperty('accessories');
  expect(teamSettingsFromRow({})).not.toHaveProperty('accessories');
  expect(teamSettingsFromRow({ accessories: [susan] })).not.toHaveProperty('accessories');
});

it('IN13a a anchor 4: loads legacy cloud accessories before validation and round trips saved size', () => {
  const row = { accessory_id: DID, ...accessoryToRow(susan) };
  delete row.data.size;
  delete row.data.lengthDeduction;
  const before = structuredClone(row);
  const loaded = accessoryFromRow(row);
  expect(isAccessory(loaded)).toBe(true);
  expect(loaded).toEqual(susan);
  expect(row).toEqual(before);
  const rod = { ...susan, size: { width: 'section', height: 1.25, depth: 1.25 }, lengthDeduction: 0.25 };
  expect(accessoryFromRow({ accessory_id: DID, ...accessoryToRow(rod) })).toEqual(rod);
  for (const data of [{ ...row.data, size: null }, { ...row.data, lengthDeduction: -1 / 8 }]) {
    expect(accessoryFromRow({ ...row, data })).toBeNull();
  }
});
