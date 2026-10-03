import { cornerAt } from '../../model/corners.js';
import {
  gridLeaves,
  resizeGridBlind,
  setGridBlind,
} from '../../model/grid.js';
import {
  isFollowAnchor,
  isJointAnchor,
} from '../../model/joints.js';
import { recessEndType } from '../../model/recesses.js';
import {
  dissolveJoint as dissolveJointPure,
  joinEdges,
  joinStack,
  resizeRun as resizeRunPure,
} from '../../model/room.js';
import { soffitEndType } from '../../model/soffits.js';
import { wallViewForRun } from '../../model/wallSides.js';
import {
  withoutAuto,
  wallLocation,
  runLocation,
  syncRoomAt,
  clearTransientSelection,
} from './helpers.js';

export const runReducers = {
  addRun(state, action) {
    const location = wallLocation(state, action.payload);
    const run = action.payload.run ?? action.payload;
    if (!location || !run?.id) return;
    location.wall.runs.push(run);
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
};
