import { v4 as uuid } from 'uuid';
import { BOX_BACKS, BOX_KEYS, BOX_TOPS, CABINET_PURPOSE_IDS } from '../../model/constants.js';
import {
  gridLeaves,
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
import { isStoredInterior, patchShelfSettings } from '../../model/interiorTree.js';
import {
  runLocation,
  syncRoomAt,
  settingsFor,
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
      const layout = splitRun(location.run, settingsFor(state, location.room), {
        endMinWidths: endMinWidthsForRun(
          location.room,
          location.wall,
          location.run,
          settingsFor(state, location.room),
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
            width: roundTo(width, settingsFor(state, location.room).roundTo),
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
  /** IN1a: `purpose` on cabinets (any depth in the grid); null clears it. */
  setCabinetPurpose(state, action) {
    const { itemIds = [], purpose } = action.payload;
    if (purpose !== null && !CABINET_PURPOSE_IDS.has(purpose)) return;
    const location = runLocation(state, action.payload);
    if (!location?.run.grid) return;
    const targets = gridLeaves(location.run.grid)
      .filter((leaf) => leaf.kind === 'cabinet' && itemIds.includes(leaf.id));
    if (!targets.length) return;
    for (const target of targets) {
      if (purpose === null) delete target.purpose;
      else target.purpose = purpose;
    }
    syncRoomAt(state, location.roomIndex);
  },
  /** A cabinet's slide pick at any grid depth; null restores inheritance. */
  setCabinetSlide(state, action) {
    const { itemIds = [], slideId } = action.payload;
    if (slideId !== null && !(typeof slideId === 'string' && slideId.length > 0)) return;
    const location = runLocation(state, action.payload);
    if (!location?.run.grid) return;
    const targets = gridLeaves(location.run.grid)
      .filter((leaf) => leaf.kind === 'cabinet' && itemIds.includes(leaf.id));
    if (!targets.length) return;
    for (const target of targets) {
      if (slideId === null) delete target.drawerSlideId;
      else target.drawerSlideId = slideId;
    }
    syncRoomAt(state, location.roomIndex);
  },
  /** IN1b: manual box overrides at any grid depth; null restores auto for one key. */
  setCabinetBox(state, action) {
    const { itemIds = [], key, value } = action.payload;
    if (!BOX_KEYS.includes(key)) return;
    if (value !== null && !(key === 'back' ? BOX_BACKS.includes(value)
      : key === 'top' || key === 'bottom' ? BOX_TOPS.includes(value)
        : typeof value === 'boolean')) return;
    const location = runLocation(state, action.payload);
    if (!location?.run.grid) return;
    const targets = gridLeaves(location.run.grid)
      .filter((leaf) => leaf.kind === 'cabinet' && itemIds.includes(leaf.id));
    if (!targets.length) return;
    for (const target of targets) {
      if (value === null) {
        if (target.box) {
          delete target.box[key];
          if (!Object.keys(target.box).length) delete target.box;
        }
      } else {
        target.box ??= {};
        target.box[key] = value;
      }
    }
    syncRoomAt(state, location.roomIndex);
  },
  /** Store an independent edited interior per cabinet; only null restores auto. */
  setItemInterior(state, action) {
    const { itemIds = [], interior } = action.payload;
    const clear = interior === null;
    if (!clear && !isStoredInterior(interior)) return;
    const location = runLocation(state, action.payload);
    if (!location?.run.grid) return;
    const targets = gridLeaves(location.run.grid)
      .filter((leaf) => leaf.kind === 'cabinet' && itemIds.includes(leaf.id));
    if (!targets.length) return;
    for (const target of targets) {
      if (clear) delete target.interior;
      else target.interior = structuredClone(interior);
    }
    syncRoomAt(state, location.roomIndex);
  },
  /** Cabinet shelf material picks never store or alter the interior tree. */
  setItemShelves(state, action) {
    const { itemId, itemIds = itemId ? [itemId] : [], patch } = action.payload;
    if (!patchShelfSettings(undefined, patch)) return;
    const location = runLocation(state, action.payload);
    if (!location?.run.grid) return;
    const targets = gridLeaves(location.run.grid)
      .filter((leaf) => leaf.kind === 'cabinet' && itemIds.includes(leaf.id));
    if (!targets.length) return;
    for (const target of targets) {
      const shelves = patchShelfSettings(target.shelves, patch);
      if (Object.keys(shelves).length) target.shelves = shelves;
      else delete target.shelves;
    }
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
      ? { id: uuid(), kind: 'filler', width: settingsFor(state, location.room).defaultInteriorFillerWidth }
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
      state.interiorPath = null;
      state.interiorDivider = null;
    }
    syncRoomAt(state, location.roomIndex);
  },
};
