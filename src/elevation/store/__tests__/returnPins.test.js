import { describe, expect, it } from 'vitest';
import { auto, pin, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { runItems } from '../../model/grid.js';
import { syncRoom } from '../../model/room.js';
import elevationReducer, { createInitialElevationState, setItemPin } from '../elevationSlice.js';
import { isRoom, toRoomDocument } from '../persistence.js';

describe('DR3b stored return pins', () => {
  it('accepts the return shape on root tracks, sets its anchor, copies and clears it', () => {
    const initial = {
      ...createInitialElevationState(null), activeRoomId: 'room-1', activeWallId: 'H',
      rooms: [room({ walls: [wall({ id: 'H', runs: [run({ items: [auto('A'), auto('B')] })] })] })],
    };
    const at = { roomId: 'room-1', wallId: 'H', runId: 'run-1', itemId: 'B' };
    for (const edge of ['left', 'right', 'center', 'both']) {
      const returnPin = pin(1.5, { from: 'return', wallId: 'W', runId: 'R', edge,
        ...(edge === 'both' ? { valueRight: 2 } : {}) });
      const next = elevationReducer(initial, setItemPin({ ...at, pin: returnPin }));
      const currentRun = next.rooms[0].walls[0].runs[0];
      const storedPin = currentRun.grid.cols[1].pin;
      expect(storedPin).toEqual({ ...returnPin, anchor: edge === 'both' ? 'left' : edge });
      expect(storedPin).not.toBe(returnPin);
      expect(runItems(currentRun)[1].pin).toEqual(storedPin);
      expect(currentRun.autoCount).toBe(false);
      expect(isRoom(next.rooms[0])).toBe(true);
      const cleared = elevationReducer(next, setItemPin({ ...at, pin: null }));
      expect(runItems(cleared.rooms[0].walls[0].runs[0])[1].pin).toBeFalsy();
    }
    expect(initial.rooms[0].walls[0].runs[0].grid.cols[1]).not.toHaveProperty('pin');
  });

  it('validates return pin fields without requiring a live target and omits derived targets from storage', () => {
    const returnPin = pin(0, { from: 'return', wallId: 'deleted-wall', runId: 'deleted-run',
      edge: 'both', anchor: 'left', valueRight: 0 });
    const stored = syncRoom(room({ walls: [wall({
      runs: [run({ items: [{ ...auto('B'), pin: returnPin }] })],
    })] }), { ...DEFAULT_SETTINGS, runFlex: 0 });
    expect(isRoom(stored)).toBe(true);
    for (const patch of [
      { wallId: undefined }, { runId: null }, { edge: 'top' }, { value: Infinity },
      { valueRight: undefined }, { valueRight: NaN }, { anchor: 'right' },
      { openingId: 'opening' }, { openingAnchor: 'jamb-left' }, { edge: 'left', valueRight: 0 },
    ]) {
      const invalid = structuredClone(stored);
      Object.assign(invalid.walls[0].runs[0].grid.cols[0].pin, patch);
      expect(isRoom(invalid)).toBe(false);
    }
    stored.walls[0].runs[0]._returnPins = { B: { target: 999, width: 999 } };
    const synced = syncRoom(stored, { ...DEFAULT_SETTINGS, runFlex: 0 });
    expect(synced.walls[0].runs[0]._returnPins).toEqual({});
    const saved = toRoomDocument(synced);
    expect(saved.walls[0].runs[0]).not.toHaveProperty('_returnPins');
    expect(saved.walls[0].runs[0].grid.cols[0].pin).toEqual(returnPin);
    expect(isRoom(saved)).toBe(true);
  });
});
