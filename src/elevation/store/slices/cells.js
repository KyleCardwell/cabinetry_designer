import { v4 as uuid } from 'uuid';
import { isExtendTarget } from '../../model/extensions.js';
import { removeRootColumn, rootItems, setGridCellBlind } from '../../model/grid.js';
import { isSheetCell, panelThickness } from '../../model/panelThickness.js';
import { resolveProfile } from '../../model/profile.js';
import { defaultsForType } from '../../model/runDefaults.js';
import { isPanelOnlyRun } from '../../model/wallEndPanels.js';
import {
  addGridPanel,
  columnLayoutOf,
  equalizeGridCells,
  findCell,
  findLeaf,
  pasteColumnLayout,
  removeGridCell,
  setGridCellDepth,
  setGridCellBaseUnder,
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
  cleanEndValue,
  runLocation,
  syncRoomAt,
  settingsFor,
  writeLeafEnd,
} from './helpers.js';

export const cellReducers = {
  /** { roomId?, wallId, runId, cellId }; uses the existing columnLayout clipboard. */
  pasteColumn(state, action) {
    if (state.clipboard?.kind !== 'columnLayout') return;
    const location = runLocation(state, action.payload);
    if (!location?.run.grid) return;
    const before = location.run.grid;
    const grid = pasteColumnLayout(before, action.payload.cellId, state.clipboard.data, uuid);
    if (grid === before) return;
    location.run.grid = grid;
    syncRoomAt(state, location.roomIndex);
  },
  applyColumnToRun(state, action) {
    const location = runLocation(state, action.payload);
    if (!location?.run.grid) return;
    const before = location.run.grid;
    const layout = columnLayoutOf(before, action.payload.cellId);
    if (!layout) return;
    let grid = before;
    for (const item of rootItems(before)) {
      if (item.id !== layout.node.id) grid = pasteColumnLayout(grid, item.id, layout, uuid);
    }
    if (grid === before) return;
    location.run.grid = grid;
    syncRoomAt(state, location.roomIndex);
  },
  removeColumn(state, action) {
    const location = runLocation(state, action.payload);
    if (!location?.run.grid) return;
    const before = location.run.grid;
    const layout = columnLayoutOf(before, action.payload.cellId);
    if (!layout) return;
    const grid = removeRootColumn(before, layout.node.id);
    if (grid === before) return;
    location.run.grid = grid;
    location.run.autoCount = false;
    const selected = state.selection.pieceId;
    if (findCell(before, selected) && !findCell(grid, selected)) {
      state.selection = {
        runId: location.run.id, pieceId: null, openingId: null, soffitId: null, recessId: null,
        wallId: state.selection.wallId,
      };
      state.facePath = null;
      state.interiorPath = null;
      state.interiorDivider = null;
    }
    syncRoomAt(state, location.roomIndex);
  },
  setStepEnd(state, action) {
    const { cellId, side, value } = action.payload;
    if (side !== 'left' && side !== 'right') return;
    const cleaned = cleanEndValue(value, ['panel', 'return']);
    if (cleaned === undefined) return;
    const location = runLocation(state, action.payload);
    if (!location) return;
    const leaf = location.run.grid ? findLeaf(location.run.grid, cellId)
      : location.run.items?.find((item) => item.id === cellId);
    if (leaf?.kind !== 'cabinet') return;
    if (writeLeafEnd(leaf, 'stepEnds', side, cleaned)) syncRoomAt(state, location.roomIndex);
  },
  setInsideEnd(state, action) {
    const { cellId, side, value } = action.payload;
    if (side !== 'left' && side !== 'right') return;
    const cleaned = cleanEndValue(value, ['return']);
    if (cleaned === undefined) return;
    const location = runLocation(state, action.payload);
    const leaf = location?.run.grid && findLeaf(location.run.grid, cellId);
    if (leaf?.kind !== 'cabinet') return;
    if (writeLeafEnd(leaf, 'insideEnds', side, cleaned)) syncRoomAt(state, location.roomIndex);
  },
  setCellBaseUnder(state, action) {
    const location = runLocation(state, action.payload);
    if (!location) return;
    const { cellId, baseUnder = null } = action.payload;
    const before = location.run.grid;
    const grid = setGridCellBaseUnder(before, cellId, baseUnder);
    if (grid === before) return;
    location.run.grid = grid;
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
      state.interiorPath = null;
      state.interiorDivider = null;
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
    const wasPanelOnly = isPanelOnlyRun(location.run);
    const before = location.run.grid;
    const found = findCell(before, cellId);
    let grid = setGridCellKind(before, cellId, kind);
    if (grid === before) return;
    if (kind === 'panel') {
      grid = setGridPanelType(grid, cellId, found.axis === 'row' ? 'top' : 'side',
        panelThickness(location.room, location.wall, location.run, findLeaf(grid, cellId), settingsFor(state, location.room), { sheet: isSheetCell(findLeaf(grid, cellId)) }));
    }
    location.run.grid = grid;
    if (wasPanelOnly && !isPanelOnlyRun(location.run)
      && (kind === 'cabinet' || kind === 'shelves')) {
      const settings = settingsFor(state, location.room);
      const profile = resolveProfile(settings, location.room, location.wall);
      location.run.depth = defaultsForType(location.run.cabinetTypeId, settings, profile).depth;
    }
    if (found.depth === 0) location.run.autoCount = false;
    if (state.selection.pieceId === cellId && kind !== 'cabinet') {
      state.facePath = null;
      state.interiorPath = null;
      state.interiorDivider = null;
    }
    syncRoomAt(state, location.roomIndex);
  },
  setCellDepth(state, action) {
    const location = runLocation(state, action.payload);
    if (!location) return;
    const { cellId } = action.payload;
    const panelOnly = isPanelOnlyRun(location.run);
    const patch = {};
    if (Object.hasOwn(action.payload, 'depth')) {
      const depth = action.payload.depth ?? null;
      if (!panelOnly && depth !== null && depth > location.run.depth + 1e-6) return;
      patch.depth = depth;
    }
    if (Object.hasOwn(action.payload, 'align')) patch.align = action.payload.align ?? null;
    const before = location.run.grid;
    const grid = setGridCellDepth(before, cellId, patch);
    if (grid === before) return;
    location.run.grid = grid;
    if (panelOnly) syncRoomAt(state, location.roomIndex);
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
      panelThickness(location.room, location.wall, location.run, null, settingsFor(state, location.room), { sheet: true }),
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
      panelThickness(location.room, location.wall, location.run, findLeaf(before, cellId), settingsFor(state, location.room), { sheet: type !== 'back' }));
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
      panelThickness(location.room, location.wall, location.run, null, settingsFor(state, location.room), { sheet: true }), uuid);
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
