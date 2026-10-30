import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLiveEntryController, resolveLiveEntryValue } from '../../canvas/useLiveEntry.js';
import { CURSORS } from '../../canvas/cursor.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { updateRootItem } from '../../model/grid.js';
import { resolveWall, syncRoom } from '../../model/room.js';
import elevationReducer, { createInitialElevationState, updateLayoutLine } from '../../store/elevationSlice.js';
import { attach, line, opening, room as roomOf, run, wall as wallOf } from '../../../test/builders.js';
import useLineDrag from './useLineDrag.js';

let effects;
vi.mock('react', async (original) => ({
  ...await original(),
  useCallback: (callback) => callback,
  useEffect: (effect) => { effects.push(effect); },
}));

// Render the hook through a component while the test supplies React's effect lifecycle.
function LineDrag(props) {
  return useLineDrag(props);
}

const WALL = '14154ec7-5eeb-4511-8d78-5d3da7b09418';
const HOOD = 'c1cb2dd4-6ec7-4d67-a1ef-1b5072bcc757';
const BASE = '8837d4ef-0f27-4ae9-aec6-2d563cadc4b3';
const LEFT = 'c3b5d002-c0bc-421b-8d22-6bbd5ee060b6';
const RIGHT = 'd63bd233-b318-473d-a13b-23c3a2b83b49';
const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
let room;
let wall;
let entry;
let entryRef;
let liveGestureRef;
let hook;
let preview;
let dispatch;
let cursor;
let render;

beforeEach(() => {
  const stored = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/room8.json', import.meta.url), 'utf8'));
  const target = stored.walls.find(({ id }) => id === WALL);
  target.lines = [line('L1', 99, { from: 'right' })];
  target.runs.find(({ id }) => id === HOOD).attach = attach('L1');
  const base = target.runs.find(({ id }) => id === BASE);
  base.autoCount = false;
  base.grid = updateRootItem(base.grid, 'e77c1c0c-b386-4716-bc71-0f23ec1e585c', { attach: attach('L1') });
  room = syncRoom(stored, settings);
  wall = resolveWall(room, room.walls.find(({ id }) => id === WALL), 'front');
  let dirty = false;
  entry = createLiveEntryController(() => { dirty = true; });
  entryRef = { current: null };
  liveGestureRef = { current: null };
  dispatch = vi.fn();
  cursor = { hold: vi.fn(), releaseHold: vi.fn() };
  preview = null;
  render = () => {
    for (let count = 0; count === 0 || dirty; count += 1) {
      if (count > 10) throw new Error('Line drag did not settle');
      dirty = false;
      effects = [];
      entryRef.current = entry.entry;
      hook = LineDrag({
        room, wall, settings, dispatch, cursor, entryRef, liveGestureRef,
        entry: entry.entry, entryValue: resolveLiveEntryValue(entry.entry),
        beginEntry: entry.begin, updateEntry: entry.update, cancelEntry: entry.cancel, commitEntry: entry.commit,
        setEntryPointer: vi.fn(), setStretchPreview: (value) => { preview = value; },
        stageRef: { current: { getPointerPosition: () => ({ x: 200, y: 100 }) } },
      });
      effects.forEach((effect) => effect());
    }
  };
  render();
});

const start = () => { hook.startLineDrag('L1'); render(); };
const update = (x) => { hook.updateLineDrag('L1', x); render(); };
const finish = (x) => { hook.finishLineDrag('L1', x); render(); };

// The live controller clears its entry before the callback; entryRef keeps the last rendered entry.
describe('LL5 b line drag', () => {
  it('anchor 2: starts from the line’s own end and commits one update at x 134', () => {
    const before = structuredClone(room);
    start();
    expect(entry.entry).toMatchObject({ kind: 'line-move', modeKey: 'from-right', value: 99, min: 0, max: 235 });
    expect(entry.entry.modes.map(({ key }) => key)).toEqual(['from-right', 'from-left']);
    expect(cursor.hold).toHaveBeenCalledWith(CURSORS.resizeX);
    update(134);
    expect(entry.entry.value).toBe(101);
    expect(dispatch).not.toHaveBeenCalled();
    finish(134);
    expect(dispatch.mock.calls).toEqual([[updateLayoutLine({ wallId: WALL, lineId: 'L1', value: 101 })]]);
    expect(preview).toBeNull();
    expect(liveGestureRef.current).toBeNull();
    expect(cursor.releaseHold).toHaveBeenCalled();
    expect(room).toEqual(before);
    const state = { ...createInitialElevationState(null), rooms: [room], activeRoomId: room.id, settings };
    const next = elevationReducer(state, dispatch.mock.calls[0][0]);
    expect(next.rooms[0].walls.find(({ id }) => id === WALL).lines[0]).toMatchObject({ from: 'right', value: 101 });
  });

  it('anchor 3: typing 130 From left commits value 105, preserving from right', () => {
    start();
    entry.cycle();
    entry.setTyped('130');
    render();
    expect(preview.wall.lines[0]).toMatchObject({ from: 'right', value: 105 });
    finish(134);
    expect(dispatch).not.toHaveBeenCalled();
    expect(entry.entry.typed).toBe('130');
    entry.commit();
    render();
    expect(dispatch.mock.calls).toEqual([[updateLayoutLine({ wallId: WALL, lineId: 'L1', value: 105 })]]);
    expect(preview).toBeNull();
  });

  it('anchor 4: cancelling clears the preview and hold, with no dispatch even on a late drag end', () => {
    start();
    update(134);
    expect(preview).not.toBeNull();
    entry.cancel();
    render();
    finish(134);
    expect(dispatch).not.toHaveBeenCalled();
    expect(preview).toBeNull();
    expect(liveGestureRef.current).toBeNull();
    expect(cursor.releaseHold).toHaveBeenCalled();
  });

  it('anchor 5: previews the changed face spans; the base’s unchanged span differs from the anchor', () => {
    start();
    update(134);
    expect(new Set(preview.runIds)).toEqual(new Set([HOOD, LEFT, RIGHT]));
    expect(preview.wall.runs.find(({ id }) => id === HOOD)).toMatchObject({ x: 94, width: 80 });
    // §1 restricts runIds to changed x/width. Anchor 5 also names BASE, whose cells alone move.
    expect(preview.wall.runs.find(({ id }) => id === BASE)).toMatchObject({ x: 38, width: 197 });
    expect(wall.runs.find(({ id }) => id === BASE)).toMatchObject({ x: 38, width: 197 });
    expect(preview.runIds).not.toContain(BASE);
    expect(preview.room).not.toBe(room);
    expect(preview.wall.side).toBe('front');
  });

  it('snaps pointer moves, keeps position when cycling modes, and preserves exact typed fractions', () => {
    start();
    update(134.3);
    expect(entry.entry.value).toBe(100.5);
    entry.cycle();
    render();
    expect(entry.entry).toMatchObject({ modeKey: 'from-left', value: 134.5 });
    entry.setTyped('134.0625');
    render();
    update(150);
    expect(preview.wall.lines[0].value).toBe(100.9375);
    entry.commit();
    render();
    expect(dispatch).toHaveBeenCalledWith(updateLayoutLine({ wallId: WALL, lineId: 'L1', value: 100.9375 }));
  });

  it('uses back-face coordinates, excludes front runs, and leaves opening changes in the preview room until release', () => {
    room = syncRoom(roomOf({ walls: [wallOf({ x2: 240,
      lines: [line('L1', 40, { wallSide: 'back', from: 'right' })],
      runs: [run({ id: 'back', wallSide: 'back', width: 30, attach: attach('L1') }), run({ id: 'front' })],
      openings: [opening({ attach: attach('L1'), offset: 160 })],
    })] }), settings);
    wall = resolveWall(room, room.walls[0], 'back');
    render();
    start();
    const openingOffset = room.walls[0].openings[0].offset;
    update(60);
    expect(preview.room.walls[0].openings[0].offset).not.toBe(openingOffset);
    expect(room.walls[0].openings[0].offset).toBe(openingOffset);
    expect(preview.runIds).toEqual(['back']);
    expect(preview.wall.runs[0]).toMatchObject({ x: 45, width: 30 });
    expect(preview.wall.side).toBe('back');
    finish(60);
    expect(dispatch.mock.calls).toEqual([[updateLayoutLine({ wallId: 'wall-1', lineId: 'L1', value: 180 })]]);
  });
});
