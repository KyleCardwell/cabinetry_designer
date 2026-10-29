import { isPlainObject } from '@reduxjs/toolkit';
import { DEFAULT_PREFS, DEFAULT_SETTINGS } from '../model/constants.js';
import { cleanOverrides } from '../model/settingsResolve.js';
import { migrateDoorDesign } from '../model/doorDesigns.js';
import { BUILT_IN_PULLS } from '../model/pulls.js';
import { BUILT_IN_SLIDES, withoutRetiredSlideKeys, withSlideDefaults } from '../model/slides.js';
import { withAccessoryDefaults } from '../model/accessories.js';
import { withPricingDefaults } from '../model/libraryPricing.js';
import { migrateSectionProfile } from '../model/sectionProfiles.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../model/doorStyles.js';
import { computeWallOrder } from '../model/topology.js';
import { migrateDocument } from './migrations.js';
import {
  ELEVATION_SCHEMA_VERSION,
  TOP_OVERHANG_SIDES,
  isElevationDocument,
  isFiniteNumber,
  isRoom,
} from './documentValidation.js';

export {
  ELEVATION_SCHEMA_VERSION,
  isBaseCutoutList,
  isElevationDocument,
  isRoom,
  isTopSegmentList,
} from './documentValidation.js';

/** Stable Elevation Lab localStorage key; schemaVersion lives in the document. */
export const ELEVATION_STORAGE_KEY = 'cd.elevationLab.v4';

const V2_DEFAULTED_SETTING_KEYS = [
  'stoneTopReveal',
  'doorPanelDefault',
  'wallThickness',
  'sheetThickness',
  'fillerReturnDepth',
  'fillerReturnThickness',
  'fillerThickness',
  'fillerReturnTongue',
  'teeCover',
  'teeThickness',
  'blindFillerWidth',
  'defaultSoffitDepth',
  'defaultSoffitMolding',
  'autoEndPanelOnFreeEnd',
  'adjacentRunGap',
  'maxRunOverhang',
  'casingWidth',
  'casingThickness',
  'openingsHaveCasing',
  'defaultOpeningMeasureMode',
  'defaultDoorWidth',
  'defaultDoorHeight',
  'defaultWindowWidth',
  'defaultWindowHeight',
  'defaultWindowSillZ',
  'minOpeningWidth',
  'casingClearance',
  'pairDoorAboveWidth',
  'faceReveals',
  'defaultStyle',
  'insetFrame',
  'profiledFit',
  'woodTopReveal',
  'capturedSingleReveal',
  'stackedUpperBottom',
  'stackedLowerTop',
  'floatingShelfThickness',
  'standardDrawerHeights',
  'belowRunOverhang',
  'belowRunFlushReveal',
  'bottomPartHeights',
  'drawerBoxHeights',
  'drawerBoxOrder',
  'drawerBoxAdjustment',
  'rolloutHeight',
  'rolloutSpacer',
  'shelfSpacing',
  'shelfWidthClearance',
  'shelfSetback',
  'glassShelfThickness',
  'shelfNosingHeight',
  'shelfNosingThickness',
  'foldedNosingExtra',
  'shoeShelfAngle',
  'shoeShelfClear',
  'baseCutoutFoot',
  'baseCutoutHeight',
  'furnitureBaseScribe',
  'woodTopScribe',
  'toeKickTopGap',
  'pullHeight',
  'runFlex',
];

/** Keep only explicit, non-negative core-edge overhangs; an empty pick inherits defaults. */
function normalizeRunTopOverhang(run) {
  const { topOverhang, ...rest } = run;
  const entries = topOverhang && typeof topOverhang === 'object' && !Array.isArray(topOverhang)
    ? Object.entries(topOverhang).filter(([side, value]) => TOP_OVERHANG_SIDES.includes(side)
      && isFiniteNumber(value) && value >= 0)
    : [];
  return entries.length ? { ...rest, topOverhang: Object.fromEntries(entries) } : rest;
}

/** A side object enables its waterfall; only a true base-to-leg override is persisted. */
function normalizeRunWaterfall(run) {
  const { waterfall, ...rest } = run;
  const entries = waterfall && typeof waterfall === 'object' && !Array.isArray(waterfall)
    ? Object.entries(waterfall)
      .filter(([side, pick]) => ['left', 'right'].includes(side)
        && Boolean(pick) && typeof pick === 'object' && !Array.isArray(pick))
      .map(([side, pick]) => [side, pick.baseToLeg === true ? { baseToLeg: true } : {}])
    : [];
  return entries.length ? { ...rest, waterfall: Object.fromEntries(entries) } : rest;
}

/** Fill current settings and preserve room integrity before validation. */
export function normalizeElevationDocument(document) {
  if (!document || document.schemaVersion !== ELEVATION_SCHEMA_VERSION) return document;
  let settings = document.settings;
  if (settings && typeof settings === 'object') {
    settings = { ...settings };
    settings.report = { ...DEFAULT_SETTINGS.report, ...settings.report };
    for (const key of V2_DEFAULTED_SETTING_KEYS) {
      if (settings[key] === undefined) settings[key] = DEFAULT_SETTINGS[key];
    }
    if (settings.teamDoorStyle === undefined) {
      settings.teamDoorStyle = structuredClone(DEFAULT_DOOR_STYLE);
    }
    if (settings.doorDesigns === undefined) settings.doorDesigns = structuredClone(DOOR_DESIGNS);
    else if (Array.isArray(settings.doorDesigns)) {
      settings.doorDesigns = settings.doorDesigns.map(migrateDoorDesign);
      for (const seed of DOOR_DESIGNS) {
        if (!settings.doorDesigns.some((design) => design?.id === seed.id)) {
          settings.doorDesigns.push(structuredClone(seed));
        }
      }
    }
    if (settings.pulls === undefined) settings.pulls = structuredClone(BUILT_IN_PULLS);
    else if (Array.isArray(settings.pulls)) {
      settings.pulls = settings.pulls.map(withPricingDefaults);
      for (const seed of BUILT_IN_PULLS) {
        if (!settings.pulls.some((pull) => pull?.id === seed.id)) {
          settings.pulls.push(structuredClone(seed));
        }
      }
    }
    if (settings.slides === undefined) settings.slides = structuredClone(BUILT_IN_SLIDES);
    else if (Array.isArray(settings.slides)) {
      settings.slides = settings.slides.map((slide) => withPricingDefaults(withSlideDefaults(withoutRetiredSlideKeys(slide))));
      for (const seed of BUILT_IN_SLIDES) {
        if (!settings.slides.some((slide) => slide?.id === seed.id)) {
          settings.slides.push(structuredClone(seed));
        }
      }
    }
    if (settings.accessories === undefined) settings.accessories = [];
    else if (Array.isArray(settings.accessories)) settings.accessories = settings.accessories.map(withAccessoryDefaults);
    if (settings.sectionProfiles === undefined) settings.sectionProfiles = [];
    else if (Array.isArray(settings.sectionProfiles)) settings.sectionProfiles = settings.sectionProfiles.map(migrateSectionProfile);
    if (settings.shapes === undefined) settings.shapes = [];
  }
  return {
    ...document,
    settings,
    rooms: Array.isArray(document.rooms) ? document.rooms.map((room) => {
      if (!room || typeof room !== 'object') return room;
      const normalized = {
        ...room,
        partNumberStart: room.partNumberStart ?? 1,
        partNumberOverrides: room.partNumberOverrides ?? {},
        reportParts: room.reportParts ?? {},
        reportNote: room.reportNote ?? '',
        profile: isPlainObject(room.profile) ? Object.fromEntries(
          Object.entries(room.profile).filter(([key, value]) => (
            !Object.hasOwn(settings?.defaultProfile ?? {}, key)
            || value !== settings.defaultProfile[key]
          )),
        ) : room.profile,
        walls: Array.isArray(room.walls) ? room.walls.map((wall) => {
          if (!wall || typeof wall !== 'object') return wall;
          const joints = wall.joints === undefined ? [] : wall.joints;
          const jointIds = new Set(
            Array.isArray(joints) ? joints.map((joint) => joint?.id) : [],
          );
          return {
            ...wall,
            numberOverride: wall.numberOverride ?? null,
            elevationForced: wall.elevationForced ?? false,
            thicknessOverride: wall.thicknessOverride ?? null,
            joints,
            openings: Array.isArray(wall.openings) ? wall.openings.map((opening) => (
              opening && typeof opening === 'object'
                ? {
                    ...opening,
                    offsetAnchor: opening.offsetAnchor === undefined
                      ? 'edge'
                      : opening.offsetAnchor,
                }
                : opening
            )) : (wall.openings === undefined ? [] : wall.openings),
            runs: Array.isArray(wall.runs) ? wall.runs.map((run) => {
              if (!run || typeof run !== 'object') return run;
              return {
                ...normalizeRunWaterfall(normalizeRunTopOverhang(run)),
                anchors: run.anchors && typeof run.anchors === 'object'
                  ? Object.fromEntries(Object.entries(run.anchors).map(([side, anchor]) => [
                      side,
                      anchor?.to === 'joint' && !jointIds.has(anchor.jointId)
                        ? false
                        : anchor,
                    ]))
                  : run.anchors,
              };
            }) : wall.runs,
          };
        }) : room.walls,
      };
      if (isPlainObject(room.settingsOverrides)) {
        const overrides = cleanOverrides(room.settingsOverrides, 'room');
        if (Object.keys(overrides).length) normalized.settingsOverrides = overrides;
        else delete normalized.settingsOverrides;
      }
      if (Array.isArray(normalized.walls)) {
        normalized.wallOrder = computeWallOrder(
          normalized,
          Array.isArray(room.wallOrder) ? room.wallOrder : [],
        );
      }
      return normalized;
    }) : document.rooms,
  };
}

function readStored(key) {
  try {
    const serialized = window.localStorage.getItem(key);
    return serialized ? JSON.parse(serialized) : null;
  } catch {
    return null;
  }
}

/** Load and validate the persisted elevation document. */
export function loadElevationDocument() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const current = normalizeElevationDocument(migrateDocument(readStored(ELEVATION_STORAGE_KEY)));
    return isElevationDocument(current) ? current : null;
  } catch {
    return null;
  }
}

/** One room as it is stored (localStorage and the shop's `design_rooms.document`): derived fields left out. */
export function toRoomDocument(room) {
  return {
    ...room,
    walls: room.walls.map((wall) => {
      const { _endPanelThickness, _endFlex, ...persistedWall } = wall;
      void _endPanelThickness;
      void _endFlex;
      return {
        ...persistedWall,
        thicknessOverride: wall.thicknessOverride ?? null,
        runs: wall.runs.map((run) => {
          const { _returnPins, _pinWidths, _seamGap, _frame, _plane, _doorThickness, _endThickness, _panelMiters, _insideEnds, _stepEnds, _cornerLapWidth, ...persistedRun } = run;
          void _returnPins;
          void _pinWidths;
          void _seamGap;
          void _frame;
          void _plane;
          void _doorThickness;
          void _endThickness;
          void _panelMiters;
          void _insideEnds;
          void _stepEnds;
          // Save the original span, so loading a free-ended run applies its lap exactly once.
          if (_cornerLapWidth) persistedRun.width -= _cornerLapWidth;
          return normalizeRunWaterfall(normalizeRunTopOverhang(persistedRun));
        }),
      };
    }),
  };
}

/**
 * A stored room document → a room ready for the editor, or a
 * readable failure. `settings` only feeds the same load-time normalization a full document gets.
 * → { ok: true, room } | { ok: false, reason: 'bad_document' | 'schema', message }
 */
export function roomFromDocument(document, schemaVersion, settings) {
  if (typeof schemaVersion === 'number' && schemaVersion > ELEVATION_SCHEMA_VERSION) {
    return { ok: false, reason: 'schema', message: 'This room was saved by a newer version of the designer. Reload the page to update, then open it again.' };
  }
  try {
    const migrated = migrateDocument({
      schemaVersion, settings, rooms: [document], activeRoomId: null, activeWallId: null, view: 'plan',
    });
    if (migrated.schemaVersion !== ELEVATION_SCHEMA_VERSION) {
      return { ok: false, reason: 'schema', message: `This room uses an unsupported older format (version ${schemaVersion}).` };
    }
    if (!isPlainObject(migrated.rooms?.[0])) {
      return { ok: false, reason: 'bad_document', message: 'This room\'s saved drawing could not be read.' };
    }
    const normalized = normalizeElevationDocument({
      ...migrated, rooms: [structuredClone(migrated.rooms[0])],
    });
    const room = normalized?.rooms?.[0];
    if (!isRoom(room)) return { ok: false, reason: 'bad_document', message: 'This room\'s saved drawing could not be read.' };
    return { ok: true, room };
  } catch {
    return { ok: false, reason: 'bad_document', message: 'This room\'s saved drawing could not be read.' };
  }
}

/** Return only the current document fields that belong in localStorage. */
export function toElevationDocument(elevationState) {
  return {
    schemaVersion: elevationState.schemaVersion,
    settings: Object.fromEntries(Object.entries(elevationState.settings)
      .filter(([key]) => !Object.hasOwn(DEFAULT_PREFS, key))),
    rooms: elevationState.rooms.map(toRoomDocument),
    activeRoomId: elevationState.activeRoomId,
    activeWallId: elevationState.activeWallId,
    view: elevationState.view,
  };
}

/** Persist a current elevation document without allowing storage failures to escape. */
export function persistElevationDocument(elevationState) {
  // Shop (Supabase) data and issued versions never overwrite this browser's sandbox document (SPEC-DB4, DB8a).
  if (elevationState?.source === 'cloud' || elevationState?.source === 'version') return;
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(
      ELEVATION_STORAGE_KEY,
      JSON.stringify(toElevationDocument(elevationState)),
    );
  } catch {
    // Storage may be unavailable, full, or disabled. The in-memory editor still works.
  }
}

/** Attach debounced elevation persistence to a Redux store. */
export function setupElevationPersistence(store, delay = 300) {
  let previous = store.getState().elevation;
  let timeoutId = null;

  return store.subscribe(() => {
    const current = store.getState().elevation;
    if (current === previous) return;
    previous = current;

    if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    timeoutId = globalThis.setTimeout(() => {
      persistElevationDocument(current);
      timeoutId = null;
    }, delay);
  });
}
