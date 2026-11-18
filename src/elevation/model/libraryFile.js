import { isSectionProfile, isSectionProfileList, migrateSectionProfile, parseProfileFile } from './sectionProfiles.js';
import { SEEDED_DESIGN_IDS, isDoorDesign, isDoorDesignList, migrateDoorDesign, parseDoorDesignFile } from './doorDesigns.js';
import { BUILT_IN_PULL_IDS, isPull, isPullList } from './pulls.js';
import { BUILT_IN_SLIDE_IDS, isSlide, isSlideList, withSlideDefaults, withoutRetiredSlideKeys } from './slides.js';
import { isAccessory, isAccessoryList, withAccessoryDefaults } from './accessories.js';
import { isShape, isShapeList } from './libraryShapes.js';
import { withPricingDefaults } from './libraryPricing.js';
import { collectReferences } from './settingsSnapshot.js';
import { isUuid } from './cloudRows.js';

export const LIBRARY_KINDS = {
  doorDesigns: { label: 'Door designs', filename: 'door-designs' },
  sectionProfiles: { label: 'Profiles', filename: 'section-profiles' },
  pulls: { label: 'Pulls', filename: 'pulls' },
  slides: { label: 'Slides', filename: 'slides' },
  accessories: { label: 'Accessories', filename: 'accessories' },
  shapes: { label: 'Shapes', filename: 'shapes' },
};

const CHECKS = {
  sectionProfiles: [isSectionProfile, isSectionProfileList],
  doorDesigns: [isDoorDesign, isDoorDesignList],
  pulls: [isPull, isPullList],
  slides: [isSlide, isSlideList],
  accessories: [isAccessory, isAccessoryList],
  shapes: [isShape, isShapeList],
};
const BUILT_INS = new Set([...SEEDED_DESIGN_IDS, ...BUILT_IN_PULL_IDS, ...BUILT_IN_SLIDE_IDS]);
export const isLibraryBuiltIn = (id) => BUILT_INS.has(id);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function migrateEntry(key, entry) {
  try {
    if (key === 'sectionProfiles') return migrateSectionProfile(entry);
    if (key === 'doorDesigns') return migrateDoorDesign(entry);
    if (key === 'accessories') return withAccessoryDefaults(entry);
    if (key === 'slides') return withPricingDefaults(withSlideDefaults(withoutRetiredSlideKeys(entry)));
    if (key === 'pulls') return withPricingDefaults(entry);
  } catch {
    // Malformed legacy rows still belong in the per-item skipped count.
    return entry;
  }
  return entry;
}

/** Export user rows and the transitive closure of their references, in library order. */
export function libraryExport(settings, listKey, ids = []) {
  const selected = new Set(ids);
  const rows = (settings[listKey] ?? []).filter((entry) => !isLibraryBuiltIn(entry.id)
    && (selected.size === 0 || selected.has(entry.id)));
  const items = rows.length ? { [listKey]: rows } : {};
  const dependencies = {};
  const included = new Set(rows.map((entry) => entry.id));
  const found = Object.fromEntries(['strings', 'designs', 'profiles', 'pulls', 'slides', 'accessories', 'shapes']
    .map((key) => [key, new Set()]));
  let pending = rows;
  while (pending.length) {
    collectReferences(pending, found);
    const next = [];
    for (const key of Object.keys(LIBRARY_KINDS)) {
      const references = key === 'slides' ? found.slides : key === 'accessories' ? found.accessories
        : key === 'shapes' ? found.shapes : found.strings;
      for (const entry of settings[key] ?? []) {
        if (included.has(entry.id) || isLibraryBuiltIn(entry.id) || !references.has(entry.id)) continue;
        (dependencies[key] ??= []).push(entry);
        included.add(entry.id);
        next.push(entry);
      }
    }
    pending = next;
  }
  return structuredClone({ kind: 'library', version: 1, items, dependencies });
}

/** Validate the envelope, leaving individual invalid rows for the merge's skipped count. */
export function parseLibraryFile(text) {
  try {
    const parsed = JSON.parse(text);
    let file = parsed;
    if (parsed?.kind === 'section-profiles') {
      const profiles = parseProfileFile(text);
      if (profiles === null) return null;
      file = { kind: 'library', version: 1, items: { sectionProfiles: profiles }, dependencies: {} };
    } else if (parsed?.kind === 'door-designs') {
      const designs = parseDoorDesignFile(text);
      if (designs === null) return null;
      file = { kind: 'library', version: 1, items: { doorDesigns: designs }, dependencies: {} };
    }
    if (file?.kind !== 'library' || file.version !== 1 || !isObject(file.items)
      || !isObject(file.dependencies === undefined ? {} : file.dependencies)) return null;
    const result = { kind: 'library', version: 1, items: {}, dependencies: {} };
    for (const group of ['items', 'dependencies']) {
      for (const [key, list] of Object.entries(file[group] ?? {})) {
        if (!Object.hasOwn(LIBRARY_KINDS, key) || !Array.isArray(list)) return null;
        if (list.length) result[group][key] = list.map((entry) => migrateEntry(key, entry));
      }
    }
    return result;
  } catch {
    return null;
  }
}

/** Rewrite exact string values throughout the file, including every nested reference. */
export function remapLibraryIds(file, freshIds) {
  const remap = new Map(Object.entries(freshIds).filter(([id]) => !isLibraryBuiltIn(id) && !isUuid(id)));
  function walk(value) {
    if (typeof value === 'string') return remap.get(value) ?? value;
    if (Array.isArray(value)) return value.map(walk);
    if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, walk(child)]));
    return value;
  }
  return walk(file);
}

/** Merge each kind atomically; dependencies never overwrite an existing row. */
export function mergeLibrary(settingsLists, picked) {
  const lists = { ...settingsLists };
  const result = { lists, added: 0, replaced: 0, dependenciesAdded: 0, skipped: 0 };
  for (const [key, [isItem, isList]] of Object.entries(CHECKS)) {
    const items = picked.items?.[key] ?? [];
    const dependencies = picked.dependencies?.[key] ?? [];
    if (!items.length && !dependencies.length) continue;
    const next = [...(settingsLists[key] ?? [])];
    const indices = new Map(next.map((entry, index) => [entry.id, index]));
    const counts = { added: 0, replaced: 0, dependenciesAdded: 0, skipped: 0 };
    for (const [incoming, dependency] of [[items, false], [dependencies, true]]) {
      for (const raw of incoming) {
        const entry = migrateEntry(key, raw);
        if (isLibraryBuiltIn(entry?.id) || !isItem(entry) || (dependency && indices.has(entry.id))) {
          counts.skipped += 1;
        } else if (indices.has(entry.id)) {
          next[indices.get(entry.id)] = entry;
          counts.replaced += 1;
        } else {
          indices.set(entry.id, next.length);
          next.push(entry);
          counts[dependency ? 'dependenciesAdded' : 'added'] += 1;
        }
      }
    }
    if (!isList(next)) {
      result.skipped += items.length + dependencies.length;
      continue;
    }
    if (counts.added + counts.replaced + counts.dependenciesAdded) lists[key] = next;
    for (const count of Object.keys(counts)) result[count] += counts[count];
  }
  return result;
}
