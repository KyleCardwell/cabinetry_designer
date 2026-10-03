import { createSlice } from '@reduxjs/toolkit';
import { DEFAULT_SETTINGS } from '../model/constants.js';
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
import { uiReducers } from './slices/ui.js';

/** Create the elevation slice's initial persisted and transient state. */
export function createInitialElevationState(document = loadElevationDocument()) {
  const settings = copySettings(document?.settings ?? DEFAULT_SETTINGS);
  const fallbackRoom = document ? null : createRoom('Room 1', settings);
  const rooms = document?.rooms ?? [fallbackRoom];
  const activeRoomId = document ? document.activeRoomId : fallbackRoom.id;
  const activeRoom = rooms.find((room) => room.id === activeRoomId) ?? null;
  const activeWallId = document ? document.activeWallId : null;
  const emptyActiveRoom = Boolean(activeRoom && activeRoom.walls.length === 0);
  return {
    schemaVersion: ELEVATION_SCHEMA_VERSION,
    settings,
    rooms,
    activeRoomId,
    activeWallId,
    activeWallSide: 'front',
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
    tool: emptyActiveRoom ? 'wall' : 'select',
    message: null,
  };
}

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
    ...uiReducers,
  },
});

export const {
  addRoom,
  renameRoom,
  deleteRoom,
  setActiveRoom,
  updateRoomProfile,
  useAutoHeightsForRoom,
  setRoomPartNumberStart,
  setPartNumberOverride,
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
  setRunTFiller,
  setItemTFiller,
  setItemWidth,
  setItemPin,
  setItemAbsorb,
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
  setFacePath,
  setSelection,
  clearSelection,
  setTool,
  setMessage,
  setView,
  updateSettings,
} = elevationSlice.actions;

export default elevationSlice.reducer;
