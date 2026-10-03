import { createSlice } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import { isBottomPart } from '../model/bottoms.js';
import { DEFAULT_SETTINGS } from '../model/constants.js';
import { cornerAt } from '../model/corners.js';
import { isExtendTarget } from '../model/extensions.js';
import { wallFrame } from '../model/geometry.js';
import {
  gridLeaves,
  insertRootColumn,
  removeRootColumn,
  resizeGridBlind,
  runItems,
  setGridBlind,
  setGridCellBlind,
  updateRootItem,
} from '../model/grid.js';
import {
  addGridPanel,
  equalizeGridCells,
  findCell,
  removeGridCell,
  setGridCellDepth,
  setGridCellKind,
  setGridLeafExtend,
  setGridPanelDoors,
  setGridPanelType,
  setGridShelves,
  setGridTrackGap,
  setGridTrackSize,
  splitGridCell,
  unsplitGridCell,
  wrapGridCell,
} from '../model/cellTree.js';
import {
  isFollowAnchor,
  isJointAnchor,
} from '../model/joints.js';
import {
  resizeOpening as resizeOpeningPure,
  setMeasureMode,
  setOffsetAnchor,
  setOffsetSide,
  setOpeningReferenceX,
  validateOpeningPlacement,
} from '../model/openings.js';
import {
  recessEndType,
  recessesOn,
  resizeRecess as resizeRecessPure,
  validateRecessPlacement,
} from '../model/recesses.js';
import {
  dissolveJoint as dissolveJointPure,
  endCornerAnglesForRun,
  endMinWidthsForRun,
  joinEdges,
  joinStack,
  resizeRun as resizeRunPure,
} from '../model/room.js';
import { soffitEndType } from '../model/soffits.js';
import { splitRun } from '../model/splitRun.js';
import {
  REVEAL_KEYS,
  RUN_TOP_OPTIONS,
  UPPER_BOTTOM_OPTIONS,
  isStyle,
} from '../model/styles.js';
import { roundTo } from '../model/units.js';
import {
  wallSideOf,
  wallViewForRun,
} from '../model/wallSides.js';
import {
  ELEVATION_SCHEMA_VERSION,
  loadElevationDocument,
} from './persistence.js';
import {
  copySettings,
  withoutAuto,
  createRoom,
  roomIndexFor,
  roomFor,
  wallLocation,
  runLocation,
  openingLocation,
  soffitLocation,
  RECESS_KEYS,
  recessLocation,
  recessView,
  refreshRecessEnds,
  resolvedSoffitCandidate,
  syncRoomAt,
  STYLE_FIELD_KEYS,
  cleanPartial,
  withStandardDrawers,
  itemIndexFor,
  clearTransientSelection,
} from './slices/helpers.js';
import { roomReducers } from './slices/rooms.js';
import { wallReducers } from './slices/walls.js';
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
    addRun(state, action) {
      const location = wallLocation(state, action.payload);
      const run = action.payload.run ?? action.payload;
      if (!location || !run?.id) return;
      location.wall.runs.push(run);
      syncRoomAt(state, location.roomIndex);
    },
    addSoffit(state, action) {
      const location = wallLocation(state, action.payload);
      const soffit = action.payload.soffit ?? action.payload;
      if (!location || !soffit?.id) return;
      const candidate = resolvedSoffitCandidate(location.room, location.wall, soffit);
      if (!candidate) return;
      location.wall.soffits ??= [];
      location.wall.soffits.push(candidate);
      state.selection = {
        runId: null,
        pieceId: null,
        openingId: null,
        soffitId: candidate.id,
        recessId: null,
        wallId: state.selection.wallId ?? null,
      };
      state.activeWallSide = wallSideOf(candidate);
      state.facePath = null;
      syncRoomAt(state, location.roomIndex);
    },
    updateSoffit(state, action) {
      const location = soffitLocation(state, action.payload);
      if (!location) return;
      const candidate = { ...location.soffit };
      const changes = action.payload.changes ?? {};
      for (const key of ['bottom', 'depth', 'molding', 'x', 'width']) {
        if (Object.prototype.hasOwnProperty.call(changes, key)) candidate[key] = changes[key];
      }
      const resolved = resolvedSoffitCandidate(location.room, location.wall, candidate);
      if (!resolved) return;
      location.wall.soffits[location.soffitIndex] = resolved;
      syncRoomAt(state, location.roomIndex);
    },
    setSoffitAnchor(state, action) {
      const location = soffitLocation(state, action.payload);
      const { side, anchor } = action.payload;
      if (!location || (side !== 'left' && side !== 'right')) return;
      const validOffset = anchor?.offset === null || Number.isFinite(anchor?.offset);
      const validEndAnchor = anchor?.to === 'end' && validOffset;
      const validWallAnchor = anchor?.to === 'wall'
        && typeof anchor.wallId === 'string'
        && validOffset;
      if (anchor !== false && !validEndAnchor && !validWallAnchor) return;
      const candidate = {
        ...location.soffit,
        anchors: {
          ...location.soffit.anchors,
          [side]: anchor === false ? false : { ...anchor, offset: anchor.offset ?? 0 },
        },
      };
      const resolved = resolvedSoffitCandidate(location.room, location.wall, candidate);
      if (!resolved) return;
      location.wall.soffits[location.soffitIndex] = resolved;
      syncRoomAt(state, location.roomIndex);
    },
    deleteSoffit(state, action) {
      const location = soffitLocation(state, action.payload);
      if (!location) return;
      location.wall.soffits.splice(location.soffitIndex, 1);
      for (const wall of location.room.walls) {
        for (const run of wall.runs) {
          for (const side of ['left', 'right']) {
            if (run.anchors?.[side]?.to === 'soffit'
              && run.anchors[side].soffitId === location.soffit.id) {
              run.anchors[side] = false;
            }
          }
        }
      }
      if (state.selection.soffitId === location.soffit.id) clearTransientSelection(state);
      syncRoomAt(state, location.roomIndex);
    },
    addRecess(state, action) {
      const location = wallLocation(state, action.payload);
      const { recess } = action.payload;
      if (!location || !recess?.id) return;
      const validation = validateRecessPlacement(recessView(location.room, location.wall, recess), recess);
      if (!validation.ok) {
        state.message = validation.reason;
        return;
      }
      location.wall.recesses ??= [];
      location.wall.recesses.push({ ...recess });
      state.selection = {
        runId: null,
        pieceId: null,
        openingId: null,
        soffitId: null,
        recessId: recess.id,
        wallId: state.selection.wallId ?? null,
      };
      state.activeWallSide = wallSideOf(recess);
      state.facePath = null;
      state.message = null;
      syncRoomAt(state, location.roomIndex);
    },
    updateRecess(state, action) {
      const location = recessLocation(state, action.payload);
      if (!location) return;
      const candidate = { ...location.recess };
      const changes = action.payload.changes ?? {};
      for (const key of RECESS_KEYS) {
        if (Object.prototype.hasOwnProperty.call(changes, key)) candidate[key] = changes[key];
      }
      // A kind change swaps an automatic label's letter and keeps its number: R2 ↔ P2.
      if (candidate.kind !== location.recess.kind
        && !Object.prototype.hasOwnProperty.call(changes, 'label')
        && /^[RP]\d+$/.test(candidate.label)) {
        candidate.label = `${candidate.kind === 'projection' ? 'P' : 'R'}${candidate.label.slice(1)}`;
      }
      const validation = validateRecessPlacement(
        recessView(location.room, location.wall, candidate),
        candidate,
      );
      if (!validation.ok) {
        state.message = validation.reason;
        return;
      }
      location.wall.recesses[location.recessIndex] = candidate;
      state.message = null;
      for (const run of location.wall.runs) refreshRecessEnds(location.wall, run, candidate.id);
      syncRoomAt(state, location.roomIndex);
    },
    resizeRecess(state, action) {
      const location = recessLocation(state, action.payload);
      const { width, grow = 'right' } = action.payload;
      if (!location || !Number.isFinite(width) || width <= 0) return;
      const length = wallFrame(location.room, location.wall).length;
      const candidate = resizeRecessPure(location.recess, width, grow, length);
      const validation = validateRecessPlacement(
        recessView(location.room, location.wall, candidate),
        candidate,
      );
      if (!validation.ok) {
        state.message = validation.reason;
        return;
      }
      location.wall.recesses[location.recessIndex] = candidate;
      state.message = null;
      syncRoomAt(state, location.roomIndex);
    },
    deleteRecess(state, action) {
      const location = recessLocation(state, action.payload);
      if (!location) return;
      const { id } = location.recess;
      location.wall.recesses.splice(location.recessIndex, 1);
      for (const run of location.wall.runs) {
        if (run.recessId === id) delete run.recessId;
        for (const side of ['left', 'right']) {
          if (run.anchors?.[side]?.to === 'recess' && run.anchors[side].recessId === id) {
            run.anchors[side] = false;
          }
        }
      }
      for (const opening of location.wall.openings ?? []) {
        if (opening.recessId === id) delete opening.recessId;
      }
      if (state.selection.recessId === id) clearTransientSelection(state);
      syncRoomAt(state, location.roomIndex);
    },
    setRunRecess(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { recessId } = action.payload;
      if (recessId) {
        const exists = recessesOn(location.wall, wallSideOf(location.run))
          .some((recess) => recess.id === recessId);
        if (!exists) return;
        location.run.recessId = recessId;
      } else {
        delete location.run.recessId;
      }
      refreshRecessEnds(location.wall, location.run);
      syncRoomAt(state, location.roomIndex);
    },
    addOpening: {
      reducer(state, action) {
        const location = wallLocation(state, action.payload);
        const { opening } = action.payload;
        if (!location || !opening?.id) return;
        location.wall.openings ??= [];
        location.wall.openings.push(opening);
        syncRoomAt(state, location.roomIndex);
      },
      prepare(payload) {
        const opening = payload.opening ?? {};
        return {
          payload: {
            ...payload,
            opening: { ...opening, id: opening.id ?? uuid() },
          },
        };
      },
    },
    updateOpening(state, action) {
      const location = openingLocation(state, action.payload);
      if (!location) return;
      const candidate = { ...location.opening };
      const changes = action.payload.changes ?? {};
      for (const key of [
        'label',
        'kind',
        'width',
        'height',
        'sillZ',
        'offset',
        'offsetFrom',
        'offsetAnchor',
        'casing',
        'recessId',
      ]) {
        if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;
        if (key === 'recessId' && !changes[key]) {
          delete candidate.recessId;
          continue;
        }
        candidate[key] = key === 'casing' && changes[key]
          ? { ...changes[key] }
          : changes[key];
      }
      const resolvedWall = {
        ...location.wall,
        length: wallFrame(location.room, location.wall).length,
      };
      const validation = validateOpeningPlacement(resolvedWall, candidate, state.settings);
      if (!validation.ok) {
        state.message = validation.reason;
        syncRoomAt(state, location.roomIndex);
        return;
      }
      location.wall.openings[location.openingIndex] = candidate;
      state.message = null;
      syncRoomAt(state, location.roomIndex);
    },
    resizeOpening(state, action) {
      const location = openingLocation(state, action.payload);
      const { width, grow = 'right' } = action.payload;
      if (!location || !Number.isFinite(width) || width <= 0) return;
      const length = wallFrame(location.room, location.wall).length;
      const candidate = resizeOpeningPure(location.opening, width, grow, length, state.settings);
      const validation = validateOpeningPlacement(
        { ...location.wall, length },
        candidate,
        state.settings,
      );
      if (!validation.ok) {
        state.message = validation.reason;
        return;
      }
      location.wall.openings[location.openingIndex] = candidate;
      state.message = null;
      syncRoomAt(state, location.roomIndex);
    },
    setOpeningMeasureMode(state, action) {
      const location = openingLocation(state, action.payload);
      if (!location) return;
      const length = wallFrame(location.room, location.wall).length;
      location.wall.openings[location.openingIndex] = setMeasureMode(
        location.opening,
        action.payload.mode,
        length,
        state.settings,
      );
      syncRoomAt(state, location.roomIndex);
    },
    setOpeningOffsetSide(state, action) {
      const location = openingLocation(state, action.payload);
      if (!location) return;
      const length = wallFrame(location.room, location.wall).length;
      location.wall.openings[location.openingIndex] = setOffsetSide(
        location.opening,
        action.payload.side,
        length,
        state.settings,
      );
      syncRoomAt(state, location.roomIndex);
    },
    setOpeningOffsetAnchor(state, action) {
      const location = openingLocation(state, action.payload);
      if (!location) return;
      const length = wallFrame(location.room, location.wall).length;
      location.wall.openings[location.openingIndex] = setOffsetAnchor(
        location.opening,
        action.payload.anchor,
        length,
        state.settings,
      );
      syncRoomAt(state, location.roomIndex);
    },
    moveOpening(state, action) {
      const location = openingLocation(state, action.payload);
      if (!location || !Number.isFinite(action.payload.x)) return;
      const length = wallFrame(location.room, location.wall).length;
      location.wall.openings[location.openingIndex] = setOpeningReferenceX(
        location.opening,
        action.payload.x,
        length,
        state.settings,
      );
      syncRoomAt(state, location.roomIndex);
    },
    deleteOpening(state, action) {
      const location = openingLocation(state, action.payload);
      if (!location) return;
      location.wall.openings.splice(location.openingIndex, 1);
      for (const run of location.wall.runs) {
        for (const side of ['left', 'right']) {
          if (run.anchors?.[side]?.to === 'opening'
            && run.anchors[side].openingId === action.payload.openingId) {
            run.anchors[side] = false;
          }
        }
        for (const column of run.grid.cols) {
          if (column.pin?.from === 'opening'
            && column.pin.openingId === action.payload.openingId) {
            column.pin = null;
          }
        }
      }
      if (state.selection.openingId === action.payload.openingId) {
        clearTransientSelection(state);
      }
      syncRoomAt(state, location.roomIndex);
    },
    replaceRun(state, action) {
      const run = action.payload.run;
      if (!run?.id) return;
      const location = runLocation(state, {
        ...action.payload,
        runId: run.id,
      });
      if (!location) return;
      location.wall.runs[location.runIndex] = run;
      syncRoomAt(state, location.roomIndex);
    },
    updateRun(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { wallId, roomId, runId, changes, patch, ...inlineChanges } = action.payload;
      void wallId;
      void roomId;
      void runId;
      Object.assign(location.run, changes ?? patch ?? inlineChanges);
      syncRoomAt(state, location.roomIndex);
    },
    deleteRun(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      location.wall.runs.splice(location.runIndex, 1);
      if (state.selection.runId === action.payload.runId) clearTransientSelection(state);
      syncRoomAt(state, location.roomIndex);
    },
    setRunEnd(state, action) {
      const location = runLocation(state, action.payload);
      const { side } = action.payload;
      if (!location || (side !== 'left' && side !== 'right')) return;
      const end = action.payload.end ?? action.payload.value ?? {
        type: action.payload.type,
        width: action.payload.width,
      };
      const previous = location.run.ends[side]?.type;
      const { auto, ...current } = location.run.ends[side] ?? {};
      void auto;
      location.run.ends[side] = end.type === 'none'
        ? { type: end.type, width: end.width }
        : { ...current, type: end.type, width: end.width };
      if (end.type !== 'blind') location.run.grid = setGridBlind(location.run.grid, side, null);
      if (end.type === 'none' || (end.type === 'end_panel' && previous !== 'end_panel')) {
        if (location.run.endFiller) location.run.endFiller[side] = null;
      }
      syncRoomAt(state, location.roomIndex);
    },
    setRunType(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      location.run.cabinetTypeId = action.payload.typeId
        ?? action.payload.cabinetTypeId
        ?? action.payload.type;
      if (action.payload.resetToDefaults ?? action.payload.reset ?? false) {
        location.run.heightMode = 'auto';
        location.run.overrides = {};
      }
      syncRoomAt(state, location.roomIndex);
    },
    setRunHeightMode(state, action) {
      const location = runLocation(state, action.payload);
      const mode = action.payload.mode ?? action.payload.value;
      if (!location || (mode !== 'auto' && mode !== 'manual')) return;
      location.run.heightMode = mode;
      syncRoomAt(state, location.roomIndex);
    },
    setRunOverride(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { key, value } = action.payload;
      if (value === null || value === undefined) delete location.run.overrides[key];
      else location.run.overrides[key] = value;
      syncRoomAt(state, location.roomIndex);
    },
    setRunAnchor(state, action) {
      const location = runLocation(state, action.payload);
      const { side } = action.payload;
      if (!location || (side !== 'left' && side !== 'right')) return;
      const value = action.payload.anchor
        ?? action.payload.value
        ?? action.payload.anchored
        ?? false;
      const validOpeningAnchor = Boolean(value)
        && typeof value === 'object'
        && value.to === 'opening'
        && typeof value.openingId === 'string'
        && (value.edge === 'casing' || value.edge === 'jamb')
        && (value.clearance === null || Number.isFinite(value.clearance));
      const validWallAnchor = Boolean(value)
        && typeof value === 'object'
        && value.to === 'wall'
        && typeof value.wallId === 'string';
      const validSoffitAnchor = Boolean(value)
        && typeof value === 'object'
        && value.to === 'soffit'
        && typeof value.soffitId === 'string'
        && (value.offset === null || Number.isFinite(value.offset));
      const validRecessAnchor = Boolean(value)
        && typeof value === 'object'
        && value.to === 'recess'
        && typeof value.recessId === 'string'
        && (value.edge === 'left' || value.edge === 'right')
        && (value.offset === null || value.offset === undefined || Number.isFinite(value.offset));
      if (typeof value !== 'boolean'
        && !validOpeningAnchor
        && !validWallAnchor
        && !validSoffitAnchor
        && !validRecessAnchor) return;
      const previous = location.run.anchors[side];
      if ((isJointAnchor(previous) || isFollowAnchor(previous)) && !isJointAnchor(value)) {
        location.run.ends[side] = withoutAuto(location.run.ends[side]);
      }
      const anchor = validSoffitAnchor || validRecessAnchor ? { ...value, offset: value.offset ?? 0 } : value;
      location.run.anchors[side] = validOpeningAnchor || validWallAnchor || validSoffitAnchor || validRecessAnchor
        ? { ...anchor }
        : anchor;
      if (validSoffitAnchor) {
        location.run.ends[side] = {
          type: soffitEndType(location.wall, location.run, side, anchor, state.settings),
          width: null,
        };
      } else if (validRecessAnchor) {
        location.run.ends[side] = {
          type: recessEndType(wallViewForRun(location.wall, location.run), location.run, side),
          width: null,
        };
      } else if (validWallAnchor) {
        location.run.ends[side] = { type: 'filler', width: null };
      } else if (value === true) {
        const inside = cornerAt(location.room, wallViewForRun(location.wall, location.run), side).type === 'inside';
        if (inside && location.run.ends[side].type !== 'blind') {
          location.run.ends[side] = { type: 'filler', width: null };
        } else if (!inside && location.run.ends[side].type !== 'end_panel') {
          location.run.ends[side] = { type: 'end_panel', width: null };
        }
      }
      syncRoomAt(state, location.roomIndex);
    },
    joinRunEdges(state, action) {
      const location = wallLocation(state, action.payload);
      if (!location) return;
      const { runId, side, targetRunId, targetSide } = action.payload;
      const result = joinEdges(
        location.room,
        location.wall.id,
        { runId, side },
        { runId: targetRunId, side: targetSide },
        state.settings,
      );
      if (!result.ok) state.message = result.reason;
      else {
        state.rooms[location.roomIndex] = result.room;
        state.message = null;
      }
      syncRoomAt(state, location.roomIndex);
    },
    setRunJointOffset(state, action) {
      const location = runLocation(state, action.payload);
      const { side, offset } = action.payload;
      const anchor = location?.run.anchors?.[side];
      if (!location || !Number.isFinite(offset) || !anchor
        || (anchor.to !== 'joint' && anchor.to !== 'follow')) return;
      anchor.offset = offset;
      syncRoomAt(state, location.roomIndex);
    },
    joinRunStack(state, action) {
      const location = wallLocation(state, action.payload);
      if (!location) return;
      const { runId, edge, leaderRunId } = action.payload;
      const result = joinStack(
        location.room,
        location.wall.id,
        runId,
        edge,
        leaderRunId,
        state.settings,
      );
      if (!result.ok) state.message = result.reason;
      else {
        state.rooms[location.roomIndex] = result.room;
        state.message = null;
      }
      syncRoomAt(state, location.roomIndex);
    },
    setRunStackOffset(state, action) {
      const location = runLocation(state, action.payload);
      const { edge, offset } = action.payload;
      const link = location?.run.stack?.[edge];
      if (!location || !link || !Number.isFinite(offset)) return;
      link.offset = offset;
      syncRoomAt(state, location.roomIndex);
    },
    freeRunStack(state, action) {
      const location = runLocation(state, action.payload);
      const { edge } = action.payload;
      if (!location || !location.run.stack?.[edge]) return;
      location.run.stack[edge] = null;
      syncRoomAt(state, location.roomIndex);
    },
    dissolveJoint(state, action) {
      const location = wallLocation(state, action.payload);
      if (!location) return;
      const result = dissolveJointPure(
        location.room,
        location.wall.id,
        action.payload.jointId,
        state.settings,
      );
      if (!result.ok) state.message = result.reason;
      else {
        state.rooms[location.roomIndex] = result.room;
        state.message = null;
      }
      syncRoomAt(state, location.roomIndex);
    },
    resizeRun(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const result = resizeRunPure(
        location.room,
        location.wall.id,
        location.run.id,
        action.payload.width,
        action.payload.grow ?? 'right',
        state.settings,
      );
      if (!result.ok) state.message = result.reason;
      else {
        state.rooms[location.roomIndex] = result.room;
        state.message = null;
      }
      syncRoomAt(state, location.roomIndex);
    },
    replaceWallLayout(state, action) {
      const location = wallLocation(state, action.payload);
      if (!location) return;
      location.wall.runs = action.payload.runs;
      location.wall.joints = action.payload.joints;
      syncRoomAt(state, location.roomIndex);
    },
    setRunCornerClearance(state, action) {
      const location = runLocation(state, action.payload);
      const { side, value } = action.payload;
      const validValue = value === 'auto'
        || value === 'face'
        || (typeof value === 'number' && Number.isFinite(value));
      if (!location || (side !== 'left' && side !== 'right') || !validValue) return;
      location.run.cornerClearance = {
        ...(location.run.cornerClearance ?? {}),
        [side]: value,
      };
      syncRoomAt(state, location.roomIndex);
    },
    setRunBlind(state, action) {
      const location = runLocation(state, action.payload);
      const { side, width } = action.payload;
      if (!location || (side !== 'left' && side !== 'right')) return;
      const run = location.run;
      run.grid = resizeGridBlind(run.grid, side, width);
    },
    setRunEndFiller(state, action) {
      const location = runLocation(state, action.payload);
      const { side, key, value } = action.payload;
      if (!location || (side !== 'left' && side !== 'right')) return;
      if (key !== 'width' && key !== 'returnDepth' && key !== 'tFiller') return;
      const run = location.run;
      run.endFiller = { left: null, right: null, ...(run.endFiller ?? {}) };
      const current = run.endFiller[side] ?? { width: null, returnDepth: null };
      const minimum = key === 'width' ? 0 : -1;
      const next = { ...current };
      if (key === 'tFiller') {
        if (typeof value === 'boolean') next.tFiller = value;
        else delete next.tFiller;
      } else {
        next[key] = Number.isFinite(value) && value > minimum ? value : null;
      }
      run.endFiller[side] = next.width === null && next.returnDepth === null && next.tFiller === undefined
        ? null
        : next;
    },
    setAutoCount(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      location.run.autoCount = action.payload.value ?? action.payload.autoCount;
      syncRoomAt(state, location.roomIndex);
    },
    setMaxCabinetWidth(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      location.run.maxCabinetWidth = action.payload.value
        ?? action.payload.maxCabinetWidth
        ?? null;
      syncRoomAt(state, location.roomIndex);
    },
    setRunSeamGap(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { gap = null } = action.payload;
      if (gap !== null && !(Number.isFinite(gap) && gap >= 0)) return;
      if (gap === null) {
        if (location.run.seamGap === undefined) return;
        delete location.run.seamGap;
      } else {
        if (location.run.seamGap === gap) return;
        location.run.seamGap = gap;
      }
      syncRoomAt(state, location.roomIndex);
    },
    setRunTFiller(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { value = null } = action.payload;
      if (value !== null && value !== 'seams' && value !== 'all') return;
      if (value === null) delete location.run.tFiller;
      else location.run.tFiller = value;
    },
    setItemTFiller(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const leaves = new Map(gridLeaves(location.run.grid)
        .filter((leaf) => leaf.kind === 'cabinet')
        .map((leaf) => [leaf.id, leaf]));
      for (const { itemId, side, value } of action.payload.edits ?? []) {
        const leaf = leaves.get(itemId);
        if (!leaf || !['left', 'right', 'top', 'bottom'].includes(side)) continue;
        if (value !== true && value !== false && value !== null) continue;
        const next = { ...(leaf.tFiller ?? {}) };
        if (value === null) delete next[side];
        else next[side] = value;
        if (Object.keys(next).length === 0) delete leaf.tFiller;
        else leaf.tFiller = next;
      }
    },
    setItemWidth(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      if (itemIndex === -1) return;
      location.run.grid = updateRootItem(location.run.grid, action.payload.itemId, {
        width: action.payload.width ?? action.payload.value ?? null,
      });
      syncRoomAt(state, location.roomIndex);
    },
    setItemPin(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      const item = runItems(location.run)[itemIndex];
      if (!item || item.kind !== 'cabinet') return;
      const pin = action.payload.pin ?? null;
      const pinCountBefore = runItems(location.run).filter((candidate) => candidate.pin).length;
      const addsSecondPin = Boolean(pin) && !item.pin && pinCountBefore === 1;
      const addsPinToPinnedRun = Boolean(pin) && !item.pin && pinCountBefore >= 1;
      let currentWidths = null;
      if (addsPinToPinnedRun) {
        const layout = splitRun(location.run, state.settings, {
          endMinWidths: endMinWidthsForRun(
            location.room,
            location.wall,
            location.run,
            state.settings,
          ),
          endCornerAngles: endCornerAnglesForRun(
            location.room,
            location.wall,
            location.run,
          ),
          pinTargets: {},
        });
        currentWidths = new Map(layout.pieces.map((piece) => [piece.id, piece.width]));
      }
      location.run.grid = updateRootItem(location.run.grid, item.id, {
        pin: pin ? { ...pin } : null,
      });
      if (pin) location.run.autoCount = false;
      if (addsPinToPinnedRun) {
        const itemsToLock = addsSecondPin
          ? runItems(location.run).filter((candidate) => candidate.pin)
          : [item];
        for (const pinnedItem of itemsToLock) {
          const width = currentWidths.get(pinnedItem.id);
          if (Number.isFinite(width)) {
            location.run.grid = updateRootItem(location.run.grid, pinnedItem.id, {
              width: roundTo(width, state.settings.roundTo),
            });
          }
        }
      }
      syncRoomAt(state, location.roomIndex);
    },
    setItemAbsorb(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      const item = runItems(location.run)[itemIndex];
      if (!item || item.kind !== 'cabinet') return;
      location.run.grid = updateRootItem(location.run.grid, item.id, {
        absorb: Boolean(action.payload.value ?? action.payload.absorb),
      });
      syncRoomAt(state, location.roomIndex);
    },
    lockItem(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      if (itemIndex === -1) return;
      location.run.grid = updateRootItem(location.run.grid, action.payload.itemId, {
        width: action.payload.width ?? action.payload.computedWidth ?? null,
      });
      syncRoomAt(state, location.roomIndex);
    },
    unlockItem(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      if (itemIndex === -1) return;
      location.run.grid = updateRootItem(location.run.grid, action.payload.itemId, { width: null });
      syncRoomAt(state, location.roomIndex);
    },
    splitItem(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      if (itemIndex === -1 || runItems(location.run)[itemIndex].kind !== 'cabinet') return;
      let grid = insertRootColumn(location.run.grid, itemIndex + 1, { id: uuid(), kind: 'cabinet', width: null });
      grid = insertRootColumn(grid, itemIndex + 2, { id: uuid(), kind: 'cabinet', width: null });
      location.run.grid = removeRootColumn(grid, action.payload.itemId);
      location.run.autoCount = false;
      syncRoomAt(state, location.roomIndex);
    },
    addItemAfter(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      const appendToEmptyRun = action.payload.itemId == null && runItems(location.run).length === 0;
      if (itemIndex === -1 && !appendToEmptyRun) return;
      const item = action.payload.kind === 'filler'
        ? { id: uuid(), kind: 'filler', width: state.settings.defaultInteriorFillerWidth }
        : { id: uuid(), kind: 'cabinet', width: null };
      location.run.grid = insertRootColumn(
        location.run.grid,
        appendToEmptyRun ? 0 : itemIndex + 1,
        item,
      );
      location.run.autoCount = false;
      syncRoomAt(state, location.roomIndex);
    },
    removeItem(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const itemIndex = itemIndexFor(location.run, action.payload.itemId);
      if (itemIndex === -1) return;
      location.run.grid = removeRootColumn(location.run.grid, action.payload.itemId);
      location.run.autoCount = false;
      if (state.selection.pieceId === action.payload.itemId) {
        state.selection = {
          runId: location.run.id,
          pieceId: null,
          openingId: null,
          soffitId: null,
          recessId: null,
          wallId: state.selection.wallId,
        };
        state.facePath = null;
      }
      syncRoomAt(state, location.roomIndex);
    },
    splitCell(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId, direction, count } = action.payload;
      const before = location.run.grid;
      const rootAcross = direction === 'across' && findCell(before, cellId)?.depth === 0;
      const grid = splitGridCell(before, cellId, direction, count, uuid);
      if (grid === before) return;
      location.run.grid = grid;
      if (rootAcross) location.run.autoCount = false;
      syncRoomAt(state, location.roomIndex);
    },
    removeCell(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId } = action.payload;
      const before = location.run.grid;
      const atRoot = findCell(before, cellId)?.depth === 0;
      const grid = removeGridCell(before, cellId);
      if (grid === before) return;
      location.run.grid = grid;
      if (atRoot) location.run.autoCount = false;
      if (state.selection.pieceId === cellId) {
        state.selection = {
          runId: location.run.id, pieceId: null, openingId: null, soffitId: null, recessId: null,
          wallId: state.selection.wallId,
        };
        state.facePath = null;
      }
      syncRoomAt(state, location.roomIndex);
    },
    equalizeCells(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const before = location.run.grid;
      const grid = equalizeGridCells(before, action.payload.cellId);
      if (grid === before) return;
      location.run.grid = grid;
      syncRoomAt(state, location.roomIndex);
    },
    unsplitCell(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const before = location.run.grid;
      const grid = unsplitGridCell(before, action.payload.cellId);
      if (grid === before) return;
      location.run.grid = grid;
      syncRoomAt(state, location.roomIndex);
    },
    setTrackSize(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { trackId, size } = action.payload;
      const before = location.run.grid;
      const grid = setGridTrackSize(before, trackId, size ?? null);
      if (grid === before) return;
      location.run.grid = grid;
      syncRoomAt(state, location.roomIndex);
    },
    setTrackGap(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { trackId, gap = null } = action.payload;
      const before = location.run.grid;
      const grid = setGridTrackGap(before, trackId, gap);
      if (grid === before) return;
      location.run.grid = grid;
      syncRoomAt(state, location.roomIndex);
    },
    setCellBlind(state, action) {
      const location = runLocation(state, action.payload);
      const { cellId, side, width } = action.payload;
      if (!location || location.run.ends[side]?.type !== 'blind') return;
      const before = location.run.grid;
      const grid = setGridCellBlind(before, cellId, side, width ?? null);
      if (grid === before) return;
      location.run.grid = grid;
    },
    setCellKind(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId, kind } = action.payload;
      const before = location.run.grid;
      const found = findCell(before, cellId);
      let grid = setGridCellKind(before, cellId, kind);
      if (grid === before) return;
      if (kind === 'panel') {
        grid = setGridPanelType(grid, cellId, found.axis === 'row' ? 'top' : 'side',
          state.settings.endPanelThickness);
      }
      location.run.grid = grid;
      if (found.depth === 0) location.run.autoCount = false;
      if (state.selection.pieceId === cellId && kind !== 'cabinet') state.facePath = null;
      syncRoomAt(state, location.roomIndex);
    },
    setCellDepth(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId } = action.payload;
      const patch = {};
      if (Object.hasOwn(action.payload, 'depth')) {
        const depth = action.payload.depth ?? null;
        if (depth !== null && depth > location.run.depth + 1e-6) return;
        patch.depth = depth;
      }
      if (Object.hasOwn(action.payload, 'align')) patch.align = action.payload.align ?? null;
      const before = location.run.grid;
      const grid = setGridCellDepth(before, cellId, patch);
      if (grid === before) return;
      location.run.grid = grid;
    },
    setCellShelves(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId } = action.payload;
      const patch = {};
      if (Object.hasOwn(action.payload, 'count')) patch.count = action.payload.count;
      if (Object.hasOwn(action.payload, 'back')) patch.back = action.payload.back;
      const before = location.run.grid;
      const grid = setGridShelves(before, cellId, patch);
      if (grid === before) return;
      location.run.grid = grid;
    },
    wrapCell(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId, through, bottom = false } = action.payload;
      const before = location.run.grid;
      const grid = wrapGridCell(
        before, cellId, through, state.settings.endPanelThickness, uuid, Boolean(bottom),
      );
      if (grid === before) return;
      location.run.grid = grid;
      syncRoomAt(state, location.roomIndex);
    },
    setPanelType(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId, type } = action.payload;
      const before = location.run.grid;
      const grid = setGridPanelType(before, cellId, type, state.settings.endPanelThickness);
      if (grid === before) return;
      location.run.grid = grid;
      syncRoomAt(state, location.roomIndex);
    },
    addPanel(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId, side } = action.payload;
      const before = location.run.grid;
      const found = findCell(before, cellId);
      const grid = addGridPanel(before, cellId, side, state.settings.endPanelThickness, uuid);
      if (grid === before) return;
      location.run.grid = grid;
      if (found.depth === 0 && (side === 'left' || side === 'right')) location.run.autoCount = false;
      syncRoomAt(state, location.roomIndex);
    },
    setPanelDoors(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId, doors } = action.payload;
      const before = location.run.grid;
      const grid = setGridPanelDoors(before, cellId, doors ?? null);
      if (grid === before) return;
      location.run.grid = grid;
      syncRoomAt(state, location.roomIndex);
    },
    setRunEndExtend(state, action) {
      const location = runLocation(state, action.payload);
      const { side, direction, target = null } = action.payload;
      if (!location || (side !== 'left' && side !== 'right')) return;
      if (direction !== 'up' && direction !== 'down') return;
      if (target !== null && !isExtendTarget(direction, target)) return;
      const end = location.run.ends[side];
      if (!end || end.type === 'none') return;
      if (target === null) {
        if (!end.extend?.[direction]) return;
        delete end.extend[direction];
        if (!end.extend.up && !end.extend.down) delete end.extend;
      } else {
        end.extend = { ...(end.extend ?? {}), [direction]: target };
      }
      syncRoomAt(state, location.roomIndex);
    },
    setCellExtend(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId, direction, target = null } = action.payload;
      const before = location.run.grid;
      const grid = setGridLeafExtend(before, cellId, direction, target);
      if (grid === before) return;
      location.run.grid = grid;
      syncRoomAt(state, location.roomIndex);
    },
    setItemFace(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { itemIds = [], face = null } = action.payload;
      for (const item of gridLeaves(location.run.grid)) {
        if (item.kind !== 'cabinet' || !itemIds.includes(item.id)) continue;
        item.face = face === null ? null : structuredClone(face);
      }
    },
    setRoomStyle(state, action) {
      const room = roomFor(state, action.payload.roomId);
      const style = cleanPartial(action.payload.style, STYLE_FIELD_KEYS);
      if (!room || !isStyle(style)) return;
      withStandardDrawers(state, room, () => {
        if (style) room.style = style;
        else delete room.style;
      });
      syncRoomAt(state, roomIndexFor(state, action.payload.roomId));
    },
    setRunStyle(state, action) {
      const location = runLocation(state, action.payload);
      const style = cleanPartial(action.payload.style, STYLE_FIELD_KEYS);
      if (!location || !isStyle(style)) return;
      withStandardDrawers(state, location.room, () => {
        if (style) location.run.style = style;
        else delete location.run.style;
      });
      syncRoomAt(state, location.roomIndex);
    },
    setRunFaceOptions(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const allowed = { upperBottom: UPPER_BOTTOM_OPTIONS, top: RUN_TOP_OPTIONS };
      for (const [key, options] of Object.entries(allowed)) {
        const value = action.payload[key];
        if (value === null) delete location.run[key];
        else if (options.includes(value)) location.run[key] = value;
      }
      if (typeof action.payload.hanging === 'boolean') {
        if (action.payload.hanging) location.run.hanging = true;
        else delete location.run.hanging;
      }
      syncRoomAt(state, location.roomIndex);
    },
    setRunBottom(state, action) {
      const location = runLocation(state, action.payload);
      const { bottom } = action.payload;
      if (!location || !Array.isArray(bottom) || !bottom.every(isBottomPart)) return;
      if (bottom.length === 0) delete location.run.bottom;
      else location.run.bottom = bottom.map((part) => ({ ...part }));
      syncRoomAt(state, location.roomIndex);
    },
    setItemStyle(state, action) {
      const location = runLocation(state, action.payload);
      const style = cleanPartial(action.payload.style, STYLE_FIELD_KEYS);
      if (!location || !isStyle(style)) return;
      const { itemIds = [] } = action.payload;
      withStandardDrawers(state, location.room, () => {
        for (const item of gridLeaves(location.run.grid)) {
          if (item.kind !== 'cabinet' || !itemIds.includes(item.id)) continue;
          if (style) item.style = { ...style };
          else delete item.style;
        }
      });
    },
    setItemReveals(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const reveals = cleanPartial(action.payload.reveals, REVEAL_KEYS, Number.isFinite);
      const { itemIds = [] } = action.payload;
      for (const item of gridLeaves(location.run.grid)) {
        if (item.kind !== 'cabinet' || !itemIds.includes(item.id)) continue;
        if (reveals) item.reveals = { ...reveals };
        else delete item.reveals;
      }
    },
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
