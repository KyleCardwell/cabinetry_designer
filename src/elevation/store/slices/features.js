import { v4 as uuid } from 'uuid';
import { wallFrame } from '../../model/geometry.js';
import {
  resizeOpening as resizeOpeningPure,
  setMeasureMode,
  setOffsetAnchor,
  setOffsetSide,
  setOpeningReferenceX,
  validateOpeningPlacement,
} from '../../model/openings.js';
import {
  recessesOn,
  resizeRecess as resizeRecessPure,
  validateRecessPlacement,
} from '../../model/recesses.js';
import { wallSideOf } from '../../model/wallSides.js';
import {
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
  clearTransientSelection,
} from './helpers.js';

export const featureReducers = {
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
};
