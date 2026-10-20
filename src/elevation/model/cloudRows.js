/**
 * Mapping between the designer's in-memory shapes and the Supabase `design_` rows
 * (DATABASE-PLAN §3, SPEC-DB4 §1). Pure: no network, no store.
 */
import { isAccessory } from './accessories.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { SEEDED_DESIGN_IDS, isDoorDesign, migrateDoorDesign } from './doorDesigns.js';
import { DEFAULT_DOOR_STYLE, isDoorStyle } from './doorStyles.js';
import { BUILT_IN_PULLS, BUILT_IN_PULL_IDS, isPull } from './pulls.js';
import { BUILT_IN_SLIDES, BUILT_IN_SLIDE_IDS, isSlide, withoutRetiredSlideKeys } from './slides.js';
import { isSectionProfile, migrateSectionProfile } from './sectionProfiles.js';
import { SETTINGS_REGISTRY } from './settingsRegistry.js';
import { isValidSettingValue } from './settingsResolve.js';
import { withPricingDefaults } from './libraryPricing.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function leaf(values, key) {
  return key.split('.').reduce((parent, part) => parent?.[part], values);
}

/** Write a registry leaf in place (null kept: an `id` setting may be null on purpose). */
function setLeaf(target, key, value) {
  const parts = key.split('.');
  let node = target;
  for (const part of parts.slice(0, -1)) {
    if (!node[part] || typeof node[part] !== 'object') node[part] = {};
    node = node[part];
  }
  node[parts.at(-1)] = value;
}

/** A section profile → `{ profile_id, kind, name, data }`. `data.version` is the shape version (P7). */
export function profileToRow(profile) {
  const { id, kind, name, archived, ...data } = structuredClone(profile);
  void archived;
  return { profile_id: id, kind, name, data };
}

/** A `design_profiles` row → a section profile, or null when the row isn't a valid profile. */
export function profileFromRow(row) {
  if (!row || !isUuid(row.profile_id) || !row.data || typeof row.data !== 'object') return null;
  const profile = migrateSectionProfile({
    ...structuredClone(row.data),
    id: row.profile_id,
    kind: row.kind,
    name: row.name,
    archived: row.archived_at != null,
  });
  return isSectionProfile(profile) ? profile : null;
}

/**
 * A door design → `{ code, data }`. Built-in designs keep their string id in `data.seedId`
 * so room documents can go on referencing `five-piece-square`, `slab` and `slab-mdf`.
 * Old row data is migrated on read and rewritten only on the next save.
 */
export function doorDesignToRow(design) {
  const { id, code, ...rest } = structuredClone(design);
  const data = SEEDED_DESIGN_IDS.includes(id) ? { ...rest, seedId: id } : rest;
  return { code, data };
}

/** The id the app uses for a door design row: its seed id, else the row's uuid. */
export function doorDesignIdFor(row) {
  const seedId = row?.data?.seedId === 'slab-applied' ? 'slab-mdf' : row?.data?.seedId;
  return SEEDED_DESIGN_IDS.includes(seedId) ? seedId : row?.design_id;
}

/** A `design_door_designs` row → a door design, or null when the row isn't valid. */
export function doorDesignFromRow(row) {
  if (!row || !isUuid(row.design_id) || !row.data || typeof row.data !== 'object') return null;
  const { seedId, ...rest } = structuredClone(row.data);
  void seedId;
  const design = migrateDoorDesign({ ...rest, id: doorDesignIdFor(row), code: row.code });
  return isDoorDesign(design) ? design : null;
}

/** Pull sizes live in data; built-ins keep their stable app id in data.seedId. */
export function pullToRow(pull) {
  const { id, name, hardwarePullId, ...rest } = structuredClone(pull);
  const data = BUILT_IN_PULL_IDS.includes(id) ? { ...rest, seedId: id } : rest;
  return { name, data, hardware_pull_id: hardwarePullId };
}

export function pullIdFor(row) {
  return BUILT_IN_PULL_IDS.includes(row?.data?.seedId) ? row.data.seedId : row?.pull_id;
}

/** A design_pulls row → a valid pull, or null (including a built-in with the wrong kind). */
export function pullFromRow(row) {
  if (!row || !isUuid(row.pull_id) || !row.data || typeof row.data !== 'object') return null;
  const { seedId, ...rest } = structuredClone(row.data);
  void seedId;
  const pull = withPricingDefaults({ ...rest, id: pullIdFor(row), name: row.name, hardwarePullId: row.hardware_pull_id });
  const seed = BUILT_IN_PULLS.find((entry) => entry.id === pull.id);
  return isPull(pull) && (!seed || seed.kind === pull.kind) ? pull : null;
}

/** Slide sizes live in data; built-ins keep their stable app id in data.seedId. */
export function slideToRow(slide) {
  const { id, name, hardwareSlideId, ...rest } = structuredClone(slide);
  const data = BUILT_IN_SLIDE_IDS.includes(id) ? { ...rest, seedId: id } : rest;
  return { name, data, hardware_slide_id: hardwareSlideId };
}

export function slideIdFor(row) {
  return BUILT_IN_SLIDE_IDS.includes(row?.data?.seedId) ? row.data.seedId : row?.slide_id;
}

/** A design_slides row → a valid slide, or null (including a built-in with the wrong mount). */
export function slideFromRow(row) {
  if (!row || !isUuid(row.slide_id) || !row.data || typeof row.data !== 'object') return null;
  const { seedId, ...rest } = withoutRetiredSlideKeys(structuredClone(row.data));
  void seedId;
  const slide = withPricingDefaults({ ...rest, id: slideIdFor(row), name: row.name, hardwareSlideId: row.hardware_slide_id });
  const seed = BUILT_IN_SLIDES.find((entry) => entry.id === slide.id);
  return isSlide(slide) && (!seed || seed.mount === slide.mount) ? slide : null;
}

/** An accessory keeps its uuid on the row, with pricing and labour in data. */
export function accessoryToRow(accessory) {
  const { id, name, ...data } = structuredClone(accessory);
  void id;
  return { name, data };
}

/** A design_accessories row → a valid accessory, or null. */
export function accessoryFromRow(row) {
  if (!row || !isUuid(row.accessory_id) || !row.data || typeof row.data !== 'object') return null;
  const accessory = { ...structuredClone(row.data), id: row.accessory_id, name: row.name };
  return isAccessory(accessory) ? accessory : null;
}

/** The shop standard as stored: every registry leaf plus `teamDoorStyle`; no library lists, no prefs. */
export function teamSettingsToRow(settings) {
  const row = {};
  for (const { key } of SETTINGS_REGISTRY) {
    const value = leaf(settings, key);
    if (isValidSettingValue(key, value)) setLeaf(row, key, structuredClone(value));
  }
  row.teamDoorStyle = structuredClone(settings?.teamDoorStyle ?? DEFAULT_DOOR_STYLE);
  return row;
}

/**
 * Stored shop standard → settings in today's shape (without library lists).
 * Missing or invalid leaves come from the code defaults; unknown keys are dropped.
 */
export function teamSettingsFromRow(stored) {
  const settings = structuredClone(DEFAULT_SETTINGS);
  delete settings.doorDesigns;
  delete settings.sectionProfiles;
  delete settings.pulls;
  delete settings.slides;
  delete settings.accessories;
  for (const { key } of SETTINGS_REGISTRY) {
    const value = leaf(stored, key);
    if (value !== undefined && isValidSettingValue(key, value)) setLeaf(settings, key, structuredClone(value));
  }
  settings.teamDoorStyle = isDoorStyle(stored?.teamDoorStyle)
    ? structuredClone(stored.teamDoorStyle)
    : structuredClone(DEFAULT_DOOR_STYLE);
  if (settings.teamDoorStyle.designId === 'slab-applied') settings.teamDoorStyle.designId = 'slab-mdf';
  return settings;
}
