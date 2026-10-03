import { v4 as uuid } from 'uuid';
import {
  insertRootColumn,
  removeRootColumn,
  runItems,
  updateRootItem,
} from '../../model/grid.js';
import {
  endCornerAnglesForRun,
  endMinWidthsForRun,
} from '../../model/room.js';
import { splitRun } from '../../model/splitRun.js';
import { roundTo } from '../../model/units.js';
import {
  runLocation,
  syncRoomAt,
  itemIndexFor,
} from './helpers.js';

export const itemReducers = {
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
};
