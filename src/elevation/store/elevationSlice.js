import { createSlice } from '@reduxjs/toolkit';
import { DEFAULT_PREFS, DEFAULT_SETTINGS } from '../model/constants.js';
import { effectiveSettings } from '../model/effectiveSettings.js';
import { syncRoom } from '../model/room.js';
import { defaultElevationFace } from '../model/topology.js';
import {
  ELEVATION_SCHEMA_VERSION,
  loadElevationDocument,
} from './persistence.js';
import {
  copySettings,
  createRoom,
} from './slices/helpers.js';
import { roomReducers } from './slices/rooms.js';
import { wallReducers } from './slices/walls.js';
import { featureReducers } from './slices/features.js';
import { runReducers } from './slices/runs.js';
import { itemReducers } from './slices/items.js';
import { cellReducers } from './slices/cells.js';
import { styleReducers } from './slices/styles.js';
import { doorStyleReducers } from './slices/doorStyles.js';
import { doorDesignReducers } from './slices/doorDesigns.js';
import { pullReducers } from './slices/pulls.js';
import { slideReducers } from './slices/slides.js';
import { sectionProfileReducers } from './slices/sectionProfiles.js';
import { uiReducers } from './slices/ui.js';
import { cloudReducers, registerInitialStateBuilder } from './slices/cloud.js';

/** Create the elevation slice's initial persisted and transient state. */
export function createInitialElevationState(document = loadElevationDocument()) {
  const settings = copySettings(document?.settings ?? DEFAULT_SETTINGS);
  for (const key of Object.keys(DEFAULT_PREFS)) delete settings[key];
  const prefs = { ...DEFAULT_PREFS };
  const fallbackRoom = document ? null : createRoom('Room 1', settings);
  // Derived fields aren't saved (SPEC-39.1): rebuild them, or recess runs load at the wall face.
  const rooms = (document?.rooms ?? [fallbackRoom]).map((room) => syncRoom(room, effectiveSettings({ settings, prefs }, room)));
  const activeRoomId = document ? document.activeRoomId : fallbackRoom.id;
  const activeRoom = rooms.find((room) => room.id === activeRoomId) ?? null;
  const emptyActiveRoom = Boolean(activeRoom && activeRoom.walls.length === 0);
  const openFace = document?.view === 'elevation' && !document.activeWallId
    ? defaultElevationFace(activeRoom)
    : null;
  const activeWallId = document ? document.activeWallId ?? openFace?.wallId ?? null : null;
  return {
    schemaVersion: ELEVATION_SCHEMA_VERSION,
    settings,
    prefs,
    // Project / phase overrides (SPEC-DB4): `{ id, values }` or null. Never saved to localStorage.
    layers: { project: null, phase: null },
    // Where settings and the library come from (SPEC-DB4): 'local' = this browser's
    // localStorage document (Elevation Lab sandbox), 'cloud' = the team's Supabase rows,
    // 'version' = one issued room version with its own frozen settings (SPEC-DB8a, read-only).
    source: 'local',
    cloud: null,
    workspace: { loading: false, error: null },
    rooms,
    activeRoomId,
    activeWallId,
    activeWallSide: openFace?.side ?? 'front',
    view: emptyActiveRoom ? 'plan' : document?.view ?? 'plan',
    selection: {
      runId: null,
      pieceId: null,
      openingId: null,
      soffitId: null,
      recessId: null,
      wallId: document?.view === 'elevation' ? activeWallId : null,
    },
    facePath: null,
    doorsOff: false,
    interiorPath: null,
    interiorDivider: null,
    tool: emptyActiveRoom ? 'wall' : 'select',
    message: null,
  };
}

registerInitialStateBuilder(createInitialElevationState);

const elevationSlice = createSlice({
  name: 'elevation',
  initialState: createInitialElevationState(),
  reducers: {
    ...roomReducers,
    ...wallReducers,
    ...featureReducers,
    ...runReducers,
    ...itemReducers,
    ...cellReducers,
    ...styleReducers,
    ...doorStyleReducers,
    ...doorDesignReducers,
    ...pullReducers,
    ...slideReducers,
    ...sectionProfileReducers,
    ...uiReducers,
    ...cloudReducers,
  },
});

export const {
  addRoom,
  renameRoom,
  deleteRoom,
  setActiveRoom,
  setRoomSetting,
  updateRoomProfile,
  useAutoHeightsForRoom,
  setRoomPartNumberStart,
  setPartNumberOverride,
  setReportPartField,
  setRoomReportNote,
  centerRoomOnOrigin,
  addWall,
  addWallSegment,
  moveWallEndpoint,
  moveWallPerpendicular,
  connectWalls,
  disconnectWallEndpoint,
  setWallLength,
  setWallEndPanel,
  setWallLanding,
  detachWallLanding,
  updateWall,
  deleteWall,
  setActiveWall,
  setActiveWallSide,
  setCombinedElevation,
  setCombinedFace,
  flipWall,
  addRun,
  addSoffit,
  updateSoffit,
  setSoffitAnchor,
  deleteSoffit,
  addRecess,
  updateRecess,
  resizeRecess,
  deleteRecess,
  setRunRecess,
  addOpening,
  updateOpening,
  resizeOpening,
  setOpeningMeasureMode,
  setOpeningOffsetAnchor,
  setOpeningOffsetSide,
  moveOpening,
  deleteOpening,
  replaceRun,
  updateRun,
  deleteRun,
  setRunEnd,
  setRunType,
  setRunHeightMode,
  setRunOverride,
  setRunTopOverhang,
  toggleRunWaterfall,
  setRunWaterfallBaseToLeg,
  addBaseCutout,
  updateBaseCutout,
  removeBaseCutout,
  setRunAnchor,
  joinRunEdges,
  setRunJointOffset,
  joinRunStack,
  setRunStackOffset,
  freeRunStack,
  dissolveJoint,
  resizeRun,
  replaceWallLayout,
  setRunCornerClearance,
  setRunBlind,
  setRunEndFiller,
  setAutoCount,
  setMaxCabinetWidth,
  setRunSeamGap,
  setRunHoldWidth,
  setRunTFiller,
  setItemTFiller,
  setItemWidth,
  setItemPin,
  setItemAbsorb,
  setCabinetPurpose,
  setCabinetBox,
  setItemInterior,
  lockItem,
  unlockItem,
  splitItem,
  addItemAfter,
  removeItem,
  splitCell,
  removeCell,
  equalizeCells,
  unsplitCell,
  setTrackSize,
  setTrackGap,
  setCellBlind,
  setCellKind,
  setCellDepth,
  setCellBaseUnder,
  setCellShelves,
  wrapCell,
  setPanelType,
  addPanel,
  setPanelDoors,
  setRunEndExtend,
  setCellExtend,
  setItemFace,
  setRoomStyle,
  setRunStyle,
  setRunFaceOptions,
  setRunBottom,
  setItemStyle,
  setItemReveals,
  addDoorStyle,
  updateDoorStyle,
  deleteDoorStyle,
  importDoorDesigns,
  addDoorDesign,
  updateDoorDesign,
  deleteDoorDesign,
  setPullPick,
  setCabinetPullHeight,
  moveMissingPull,
  addPull,
  updatePull,
  deletePull,
  addSlide,
  updateSlide,
  deleteSlide,
  setTeamDoorStyle,
  moveMissingDoorDesign,
  addSectionProfile,
  updateSectionProfile,
  setSectionProfileArchived,
  deleteSectionProfile,
  importSectionProfiles,
  setDoorStylePick,
  setRoomDoorDrawing,
  setPartStyle,
  setFacePath,
  setDoorsOff,
  setInteriorPath,
  setSelection,
  clearSelection,
  setTool,
  setMessage,
  setView,
  setPref,
  setSetting,
  updateSettings,
  setLayerSetting,
  localWorkspaceLoaded,
  cloudWorkspaceLoading,
  cloudWorkspaceFailed,
  cloudWorkspaceLoaded,
  layersLoaded,
  cloudSaved,
  cloudSaveStatus,
  cloudRoomLoaded,
  cloudRoomRecovered,
  cloudRoomPatch,
  roomVersionLoaded,
} = elevationSlice.actions;

/**
 * Read-only rooms (SPEC-DB6a.1): while `cloud.room.readOnly` is set, every action that edits
 * the room is ignored, wherever it comes from. Built from the room-editing reducer groups, so
 * a reducer added to one of them is covered too. Selection, views, prefs, the library, shop
 * settings and the cloud bookkeeping still work.
 */
const VIEW_ONLY_ROOM_ACTIONS = new Set(['setActiveRoom', 'setActiveWall', 'setActiveWallSide']);
export const ROOM_EDIT_ACTION_TYPES = new Set([
  ...[roomReducers, wallReducers, featureReducers, runReducers, itemReducers, cellReducers, styleReducers, doorStyleReducers]
    .flatMap((group) => Object.keys(group))
    .filter((name) => !VIEW_ONLY_ROOM_ACTIONS.has(name)),
  'moveMissingDoorDesign',
  'setPullPick',
  'setCabinetPullHeight',
  'moveMissingPull',
  'cloudRoomRecovered',
].map((name) => `${elevationSlice.name}/${name}`));

/**
 * An issued version (SPEC-DB8a, `source: 'version'`) is frozen: besides the room edits, its
 * settings snapshot and library can't be changed either (nothing would save them anyway).
 */
export const VERSION_LOCKED_ACTION_TYPES = new Set([
  ...ROOM_EDIT_ACTION_TYPES,
  ...[doorDesignReducers, sectionProfileReducers, pullReducers, slideReducers].flatMap((group) => Object.keys(group))
    .map((name) => `${elevationSlice.name}/${name}`),
  ...['setSetting', 'updateSettings', 'setLayerSetting'].map((name) => `${elevationSlice.name}/${name}`),
]);

export default function elevationReducer(state, action) {
  if (state?.cloud?.room?.readOnly && ROOM_EDIT_ACTION_TYPES.has(action.type)) return state;
  if (state?.source === 'version' && VERSION_LOCKED_ACTION_TYPES.has(action.type)) return state;
  return elevationSlice.reducer(state, action);
}
