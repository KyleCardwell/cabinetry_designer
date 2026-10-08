import { v4 as uuid } from 'uuid';
import { isExtendTarget } from '../../model/extensions.js';
import { setGridCellBlind } from '../../model/grid.js';
import { isSheetCell, panelThickness } from '../../model/panelThickness.js';
import {
  addGridPanel,
  equalizeGridCells,
  findCell,
  findLeaf,
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
} from '../../model/cellTree.js';
import {
  runLocation,
  syncRoomAt,
} from './helpers.js';

export const cellReducers = {
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
        panelThickness(location.room, location.wall, location.run, findLeaf(grid, cellId), state.settings, { sheet: isSheetCell(findLeaf(grid, cellId)) }));
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
      before, cellId, through,
      panelThickness(location.room, location.wall, location.run, null, state.settings, { sheet: true }),
      uuid, Boolean(bottom),
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
    const grid = setGridPanelType(before, cellId, type,
      panelThickness(location.room, location.wall, location.run, findLeaf(before, cellId), state.settings, { sheet: type !== 'back' }));
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
    const grid = addGridPanel(before, cellId, side,
      panelThickness(location.room, location.wall, location.run, null, state.settings, { sheet: true }), uuid);
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
};
