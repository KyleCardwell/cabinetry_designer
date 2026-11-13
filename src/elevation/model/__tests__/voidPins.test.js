import { describe, expect, it } from 'vitest';
import { attach, auto, line, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import elevationReducer, { setAttachment } from '../../store/elevationSlice.js';
import { isRoom } from '../../store/persistence.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const none = { left: { type: 'none', width: null }, right: { type: 'none', width: null } };
const openRun = (voidAttach) => run({
  autoCount: false, ends: none,
  items: [auto('A'), { id: 'V', kind: 'void', width: 30, attach: voidAttach }, auto('C')],
});
// LL4: an open cell on a layout line `[value, at, from]` (wall-end pins became lines).
const scene = (onLine) => {
  const lines = onLine ? [line('P', onLine[0], { from: onLine[2] ?? 'left' })] : [];
  const voidAttach = onLine ? attach('P', onLine[1]) : undefined;
  const synced = syncRoom(room({ walls: [wall({ length: 120, x2: 120, lines, runs: [openRun(voidAttach)] })] }), settings);
  const currentWall = synced.walls[0];
  return { synced, result: runScene(synced, currentWall, currentWall.runs[0], settings).result };
};
const open = (result) => result.pieces.find(({ id }) => id === 'V');

describe('open cells on layout lines', () => {
  it('without a line the open cell sits where the auto cabinets leave it', () => {
    const { result } = scene(null);
    expect(open(result).x + open(result).width / 2).toBeCloseTo(60, 6);
  });

  it.each([
    ['center at 45', [45, 'center'], (piece) => piece.x + piece.width / 2, 45],
    ['left edge at 20', [20, 'left'], (piece) => piece.x, 20],
    ['center 40 from the right end', [40, 'center', 'right'], (piece) => piece.x + piece.width / 2, 80],
  ])('%s', (_label, onLine, measure, expected) => {
    const { synced, result } = scene(onLine);
    expect(measure(open(result))).toBeCloseTo(expected, 6);
    expect(open(result).width).toBe(30);
    expect(result.warnings.some(({ code }) => code === 'pin-unreachable')).toBe(false);
    expect(isRoom(synced)).toBe(true);
  });

  it('setAttachment stores an attachment on an open cell', () => {
    let state = elevationReducer(undefined, { type: '@@init' });
    const target = room({ id: 'r', walls: [wall({ length: 120, x2: 120, lines: [line('P', 45)], runs: [openRun()] })] });
    state = { ...state, rooms: [target], activeRoomId: 'r' };
    state = elevationReducer(state, setAttachment({
      roomId: 'r', wallId: 'wall-1', target: { kind: 'column', runId: 'run-1', itemId: 'V' }, attach: attach('P'),
    }));
    const stored = state.rooms[0].walls[0].runs[0];
    expect(stored.grid.cols.find(({ id }) => id === 'V:col').attach).toEqual(attach('P'));
    expect(isRoom(state.rooms[0])).toBe(true);
  });
});
