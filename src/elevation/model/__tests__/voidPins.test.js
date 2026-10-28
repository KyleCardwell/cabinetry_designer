import { describe, expect, it } from 'vitest';
import { auto, pin, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import elevationReducer, { setItemPin } from '../../store/elevationSlice.js';
import { isRoom } from '../../store/persistence.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const none = { left: { type: 'none', width: null }, right: { type: 'none', width: null } };
const openRun = (voidPin = null) => run({
  autoCount: false, ends: none,
  items: [auto('A'), { id: 'V', kind: 'void', width: 30, pin: voidPin }, auto('C')],
});
const scene = (voidPin) => {
  const synced = syncRoom(room({ walls: [wall({ length: 120, x2: 120, runs: [openRun(voidPin)] })] }), settings);
  const currentWall = synced.walls[0];
  return { synced, result: runScene(synced, currentWall, currentWall.runs[0], settings).result };
};
const open = (result) => result.pieces.find(({ id }) => id === 'V');

describe('open cells can be pinned', () => {
  it('without a pin the open cell sits where the auto cabinets leave it', () => {
    const { result } = scene(null);
    expect(open(result).x + open(result).width / 2).toBeCloseTo(60, 6);
  });

  it.each([
    ['center at 45', pin(45), (piece) => piece.x + piece.width / 2, 45],
    ['left edge at 20', pin(20, { anchor: 'left' }), (piece) => piece.x, 20],
    ['center 40 from the right end', pin(40, { from: 'right' }), (piece) => piece.x + piece.width / 2, 80],
  ])('%s', (_label, voidPin, measure, expected) => {
    const { synced, result } = scene(voidPin);
    expect(measure(open(result))).toBeCloseTo(expected, 6);
    expect(open(result).width).toBe(30);
    expect(result.warnings.some(({ code }) => code === 'pin-unreachable')).toBe(false);
    expect(isRoom(synced)).toBe(true);
  });

  it('setItemPin stores a pin on an open cell', () => {
    let state = elevationReducer(undefined, { type: '@@init' });
    const target = room({ id: 'r', walls: [wall({ length: 120, x2: 120, runs: [openRun()] })] });
    state = { ...state, rooms: [target], activeRoomId: 'r' };
    state = elevationReducer(state, setItemPin({ wallId: 'wall-1', runId: 'run-1', itemId: 'V', pin: pin(45) }));
    const stored = state.rooms[0].walls[0].runs[0];
    expect(stored.grid.cols.find(({ id }) => id === 'V:col').pin).toEqual(pin(45));
    expect(isRoom(state.rooms[0])).toBe(true);
  });
});
