/**
 * The settings snapshot frozen with every issued version (DATABASE-PLAN DB7, SPEC-DB8a).
 *
 * A version stores the room document as it was saved, plus this snapshot: everything the
 * drawing reads from outside the room, so an issued drawing draws the same forever, whatever
 * happens to the shop standard, the project / phase settings or the library afterwards.
 *
 *   {
 *     format: 1,
 *     issuedFrom: { teamId, estProjectId, phaseId, roomId, roomVersion,
 *                   teamVersion, projectVersion, phaseVersion },   // provenance only
 *     settings:   resolved shop standard → project → phase (no library, no view prefs),
 *     overrides:  { project, phase }   // the raw override values, so hover still names the source
 *     doorDesigns:     the built-in designs + every design the room or the settings name,
 *     sectionProfiles: every profile the room or the settings name (archived ones too),
 *     pulls:           the built-in pulls + every pull the room or the settings name,
 *     slides:          the built-in slides + every slide the room or resolved settings name,
 *     accessories:     every accessory the room or resolved settings name by accessoryId,
 *     shapes:          every shape named by shapeId, including snapshotted accessories,
 *     library:   { doorDesigns: { id: rowVersion }, profiles: { id: rowVersion }, pulls: { id: rowVersion }, slides: { id: rowVersion }, accessories: { id: rowVersion }, shapes: { id: rowVersion } },
 *     missing:   { doorDesigns: [ids], profiles: [ids], pulls: [ids], slides: [ids], accessories: [ids], shapes: [ids] } // named but not in the library
 *   }
 *
 * The room's own door styles are in the room document. The team door style is in `settings`.
 */
import { findEffect } from './accessoryEffects.js';
import { isAccessoryList, withAccessoryDefaults } from './accessories.js';
import { DEFAULT_PREFS } from './constants.js';
import { SEEDED_DESIGN_IDS, isDoorDesignList } from './doorDesigns.js';
import { findDoorDesign } from './doorStyles.js';
import { isSectionProfileList } from './sectionProfiles.js';
import { isShapeList } from './libraryShapes.js';
import { BUILT_IN_PULLS, BUILT_IN_PULL_IDS, isPullList } from './pulls.js';
import { BUILT_IN_SLIDES, BUILT_IN_SLIDE_IDS, isSlideList, withSlideDefaults } from './slides.js';
import { cleanOverrides, resolveSettings } from './settingsResolve.js';
import { withPricingDefaults } from './libraryPricing.js';

const SNAPSHOT_FORMAT = 1;

const LIBRARY_LISTS = ['doorDesigns', 'sectionProfiles', 'pulls', 'slides', 'accessories', 'shapes'];
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Every string in `value`, and the ones that name a door design, profile, pull, slide, accessory or shape by their key:
 * `designId`, `profileId` / `…ProfileId`, a door style's `profiles` slots, `pullId` / `…PullId`, `slideId` / `…SlideId`, `accessoryId`, `shapeId`.
 */
function collectReferences(value, found, parentKey = null) {
  if (Array.isArray(value)) {
    for (const entry of value) collectReferences(entry, found, parentKey);
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === 'string') {
        found.strings.add(child);
        if (key === 'designId') found.designs.add(child);
        else if (key === 'profileId' || key.endsWith('ProfileId') || parentKey === 'profiles') found.profiles.add(child);
        if ((key === 'pullId' || key.endsWith('PullId')) && child !== 'none') found.pulls.add(child);
        if (key === 'slideId' || key.endsWith('SlideId')) found.slides.add(child);
        if (key === 'accessoryId') found.accessories.add(child);
        if (key === 'shapeId') found.shapes.add(child);
      } else {
        collectReferences(child, found, key);
      }
    }
    return;
  }
  if (typeof value === 'string') found.strings.add(value);
}

/** Shop standard → project → phase, with the library lists and view prefs left out. */
export function resolvedIssueSettings(settings, layers = {}) {
  const resolved = resolveSettings([
    { level: 'team', values: settings ?? {} },
    ...(layers?.project ? [{ level: 'project', id: layers.project.id, values: layers.project.values ?? {} }] : []),
    ...(layers?.phase ? [{ level: 'phase', id: layers.phase.id, values: layers.phase.values ?? {} }] : []),
  ]);
  for (const key of [...LIBRARY_LISTS, ...Object.keys(DEFAULT_PREFS)]) delete resolved[key];
  return resolved;
}

/**
 * Build the snapshot for issuing `document` (the room as saved, `toRoomDocument(room)`).
 * `settings` is the workspace's shop standard with its library (`state.elevation.settings`),
 * `layers` the open room's `{ project, phase }` overrides, `rows` the workspace's row map
 * (`cloud.rows`, for the library row versions), `issuedFrom` the provenance ids/versions.
 */
export function buildSettingsSnapshot({ settings, layers = {}, document, rows = null, issuedFrom = {} }) {
  const resolved = resolvedIssueSettings(settings, layers);
  const found = { strings: new Set(), designs: new Set(), profiles: new Set(), pulls: new Set(), slides: new Set(), accessories: new Set(), shapes: new Set() };
  collectReferences(document, found);
  collectReferences(resolved, found);

  const designs = settings?.doorDesigns ?? [];
  const profiles = settings?.sectionProfiles ?? [];
  const pullList = settings?.pulls ?? BUILT_IN_PULLS;
  const slideList = settings?.slides ?? BUILT_IN_SLIDES;
  const accessoryList = settings?.accessories ?? [];
  const shapeList = settings?.shapes ?? [];
  const doorDesigns = designs
    .filter((design) => SEEDED_DESIGN_IDS.includes(design.id) || found.strings.has(design.id))
    .map((design) => structuredClone(design));
  const sectionProfiles = profiles
    .filter((profile) => found.strings.has(profile.id))
    .map((profile) => structuredClone(profile));
  const pulls = pullList
    .filter((pull) => BUILT_IN_PULL_IDS.includes(pull.id) || found.strings.has(pull.id))
    .map((pull) => structuredClone(pull));

  const accessories = accessoryList
    .filter((accessory) => found.accessories.has(accessory.id))
    .map((accessory) => structuredClone(accessory));

  for (const accessory of accessories) {
    collectReferences(accessory, found);
    const slide = findEffect(accessory, 'slide');
    if (slide) found.slides.add(slide.slideId);
  }

  const slides = slideList
    .filter((slide) => BUILT_IN_SLIDE_IDS.includes(slide.id) || found.slides.has(slide.id))
    .map((slide) => structuredClone(slide));

  const shapes = shapeList
    .filter((shape) => found.shapes.has(shape.id))
    .map((shape) => structuredClone(shape));

  const versions = (list, map) => Object.fromEntries(list
    .filter((entry) => map?.[entry.id]?.version !== undefined)
    .map((entry) => [entry.id, map[entry.id].version]));

  return {
    format: SNAPSHOT_FORMAT,
    issuedFrom: {
      teamId: null, estProjectId: null, phaseId: null, roomId: null, roomVersion: null,
      teamVersion: null, projectVersion: null, phaseVersion: null,
      ...issuedFrom,
    },
    settings: resolved,
    overrides: {
      project: layers?.project ? structuredClone(layers.project.values ?? {}) : null,
      phase: layers?.phase ? structuredClone(layers.phase.values ?? {}) : null,
    },
    doorDesigns,
    sectionProfiles,
    pulls,
    slides,
    accessories,
    shapes,
    library: {
      doorDesigns: versions(doorDesigns, rows?.doorDesigns),
      profiles: versions(sectionProfiles, rows?.profiles),
      pulls: versions(pulls, rows?.pulls),
      slides: versions(slides, rows?.slides),
      accessories: versions(accessories, rows?.accessories),
      shapes: versions(shapes, rows?.shapes),
    },
    missing: {
      doorDesigns: [...found.designs].filter((id) => !findDoorDesign(id, designs)).sort(),
      profiles: [...found.profiles].filter((id) => !profiles.some((profile) => profile.id === id)).sort(),
      pulls: [...found.pulls].filter((id) => !pullList.some((pull) => pull.id === id)).sort(),
      slides: [...found.slides].filter((id) => !slideList.some((slide) => slide.id === id)).sort(),
      accessories: [...found.accessories].filter((id) => !accessoryList.some((accessory) => accessory.id === id)).sort(),
      shapes: [...found.shapes].filter((id) => !shapeList.some((shape) => shape.id === id)).sort(),
    },
  };
}

/** A snapshot this code can draw from (format 1, a settings object, valid library lists). */
export function isSettingsSnapshot(snapshot) {
  return isPlainObject(snapshot)
    && snapshot.format === SNAPSHOT_FORMAT
    && isPlainObject(snapshot.settings)
    && isDoorDesignList(snapshot.doorDesigns)
    && isSectionProfileList(snapshot.sectionProfiles)
    && (snapshot.pulls === undefined || (Array.isArray(snapshot.pulls) && isPullList(snapshot.pulls.map(withPricingDefaults))))
    && (snapshot.slides === undefined || (Array.isArray(snapshot.slides)
      && isSlideList(snapshot.slides.map((slide) => withPricingDefaults(withSlideDefaults(slide))))))
    && (snapshot.accessories === undefined || (Array.isArray(snapshot.accessories)
      && isAccessoryList(snapshot.accessories.map(withAccessoryDefaults))))
    && (snapshot.shapes === undefined || isShapeList(snapshot.shapes))
    && (snapshot.overrides === undefined || isPlainObject(snapshot.overrides));
}

/**
 * The workspace a version opens with: its frozen settings as the shop standard (library =
 * the snapshot's designs, profiles, pulls, slides, accessories and shapes), and its override values as the project / phase layers
 * so the editor can still say where a value came from. Resolving them again gives the same
 * values the snapshot froze; a setting added after the version was issued takes its code default.
 * → { ok: true, settings, layers } | { ok: false, reason: 'bad_snapshot', message }
 */
export function settingsFromSnapshot(snapshot) {
  if (!isSettingsSnapshot(snapshot)) {
    return { ok: false, reason: 'bad_snapshot', message: 'This version\'s saved settings could not be read.' };
  }
  const settings = structuredClone(snapshot.settings);
  for (const key of Object.keys(DEFAULT_PREFS)) delete settings[key];
  settings.doorDesigns = structuredClone(snapshot.doorDesigns);
  settings.sectionProfiles = structuredClone(snapshot.sectionProfiles);
  settings.pulls = structuredClone((snapshot.pulls ?? BUILT_IN_PULLS).map(withPricingDefaults));
  settings.slides = structuredClone((snapshot.slides ?? BUILT_IN_SLIDES).map((slide) => withPricingDefaults(withSlideDefaults(slide))));
  settings.accessories = structuredClone((snapshot.accessories ?? []).map(withAccessoryDefaults));
  settings.shapes = structuredClone(snapshot.shapes ?? []);
  const { estProjectId = null, phaseId = null } = snapshot.issuedFrom ?? {};
  const layer = (level, id) => {
    const values = snapshot.overrides?.[level];
    return isPlainObject(values) ? { id, values: cleanOverrides(values, level) } : null;
  };
  return { ok: true, settings, layers: { project: layer('project', estProjectId), phase: layer('phase', phaseId) } };
}
