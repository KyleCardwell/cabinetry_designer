import { describe, expect, it } from 'vitest';
import { attach, line, room, roomLine, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { cloneRoom } from '../../model/roomClone.js';
import { moveLineTo } from '../../model/linePlacement.js';
import { roomLineValueForFaceX } from '../../model/roomLines.js';
import { syncRoom } from '../../model/roomSync.js';
import elevationReducer, {
  addRoomLine, createInitialElevationState, deleteLayoutLine, deleteRoomLine,
  promoteLayoutLine, setSelection, updateLayoutLine, updateRoomLine,
} from '../elevationSlice.js';

const roomR = syncRoom(room({
  walls: [
    wall({ id: 'wall-1', x1: 0, y1: 0, x2: 240, y2: 0 }),
    wall({ id: 'wall-2', x1: 180, y1: 96, x2: 60, y2: 96, runs: [run({
      id: 'sink', x: 0, width: 36,
      ends: { left: { type: 'none' }, right: { type: 'none' } }, attach: attach('R1'),
    })] }),
    wall({ id: 'wall-3', x1: 300, y1: 0, x2: 300, y2: 120 }),
  ],
  roomLines: [roomLine('R1', { wallId: 'wall-1', from: 'right', value: 99 })],
}), DEFAULT_SETTINGS);
const initial = {
  ...createInitialElevationState(null), rooms: [roomR], activeRoomId: roomR.id,
  activeWallId: 'wall-2', activeWallSide: 'front',
};
const reduce = (state, ...actions) => actions.reduce(elevationReducer, state);
const at = { wallId: 'wall-2' };

describe('room line editing (LL7)', () => {
  it('moves from W2 and returns the edited face distance', () => {
    const result = moveLineTo(roomR, 'wall-2', 'R1', 45, DEFAULT_SETTINGS);
    expect(result).toMatchObject({ ok: true, x: 45, value: 45 });
    expect(result.room.roomLines[0].value).toBe(105);
    expect(result.room.walls[1]._roomLines[1].value).toBe(75);
    expect(result.room.walls[1].runs[0].x).toBe(27);
    expect(roomR.roomLines[0].value).toBe(99);
  });

  it('updates the room line through the face value action and ignores other fields', () => {
    const state = reduce(initial, updateLayoutLine({ ...at, lineId: 'R1', value: 40 }));
    expect(state.rooms[0].roomLines[0].value).toBe(100);
    expect(state.rooms[0].walls[1].runs[0].x).toBe(22);
    expect(reduce(initial, updateLayoutLine({ ...at, lineId: 'R1', label: 'X' }))).toBe(initial);
    expect(reduce(initial, updateLayoutLine({ ...at, lineId: 'R1', from: 'left' }))).toBe(initial);
    const mixed = reduce(initial, updateLayoutLine({ ...at, lineId: 'R1', value: 40, label: 'X', from: 'left' }));
    expect(mixed.rooms[0].roomLines[0]).toMatchObject({ label: 'R1', from: 'right', value: 100 });
  });

  it('adds R2 referenced to the island back face', () => {
    const state = reduce(initial, addRoomLine({ ...at, wallSide: 'back', from: 'left', value: 30 }));
    expect(state.rooms[0].roomLines[1]).toMatchObject({
      id: expect.any(String), label: 'R2', wallId: 'wall-2', wallSide: 'back', from: 'left', value: 30,
    });
    expect(state.rooms[0].walls[0]._roomLines.find((entry) => entry.id !== 'R1').value).toBe(90);
  });

  it('re-references without moving, then follows the reference wall', () => {
    const state = reduce(initial, updateRoomLine({ roomLineId: 'R1', wallId: 'wall-2', from: 'left' }));
    const reference = state.rooms[0].roomLines[0];
    expect(reference).toEqual({ id: 'R1', label: 'R1', wallId: 'wall-2', from: 'left', value: 39 });
    expect(state.rooms[0].walls.map((entry) => entry.runs)).toEqual(roomR.walls.map((entry) => entry.runs));
    const moved = cloneRoom(state.rooms[0]);
    Object.assign(moved.walls[1], { x1: 190, x2: 70 });
    const synced = syncRoom(moved, DEFAULT_SETTINGS);
    expect(synced.walls[1]._roomLines[0].value).toBe(39);
    expect(synced.walls[0]._roomLines[0].value).toBe(151);
    expect(synced.walls[1].runs[0].x).toBe(21);
  });

  it('refuses an out-of-square reference', () => {
    expect(reduce(initial, updateRoomLine({ roomLineId: 'R1', wallId: 'wall-3' }))).toBe(initial);
  });

  it('switches ends without moving anything', () => {
    const state = reduce(initial, updateRoomLine({ roomLineId: 'R1', from: 'left' }));
    expect(state.rooms[0].roomLines[0]).toMatchObject({ from: 'left', value: 141 });
    expect(state.rooms[0].walls).toEqual(roomR.walls);
  });

  it('deletes the last line and keeps detached things at their last position', () => {
    const state = reduce(initial, deleteRoomLine({ roomLineId: 'R1' }));
    expect(state.rooms[0]).not.toHaveProperty('roomLines');
    expect(state.rooms[0].walls[1].runs[0]).not.toHaveProperty('attach');
    expect(state.rooms[0].walls[1].runs[0].x).toBe(21);
    expect(state.rooms[0].walls.every((entry) => !Object.hasOwn(entry, '_roomLines'))).toBe(true);
  });

  it('promotes a face line with its id, attachments and geometry intact', () => {
    for (const label of ['L1', 'Range CL']) {
      const subject = room({ walls: [
        wall({ x2: 240, lines: [line('L1', 99, { from: 'right', label })], runs: [run({
          id: 'range', width: 36, attach: attach('L1'),
          ends: { left: { type: 'none' }, right: { type: 'none' } },
        })] }),
        wall({ id: 'wall-2', x1: 180, y1: 96, x2: 60, y2: 96 }),
      ] });
      const start = { ...initial, rooms: [syncRoom(subject, DEFAULT_SETTINGS)] };
      const state = reduce(start, promoteLayoutLine({ wallId: 'wall-1', lineId: 'L1' }));
      expect(state.rooms[0].roomLines).toEqual([{
        id: 'L1', label: label === 'L1' ? 'R1' : label, wallId: 'wall-1', from: 'right', value: 99,
      }]);
      expect(state.rooms[0].walls[0].lines).toEqual([]);
      expect(state.rooms[0].walls[0].runs[0]).toEqual(start.rooms[0].walls[0].runs[0]);
      expect(state.rooms[0].walls[0].runs[0].attach.lineId).toBe('L1');
      expect(state.rooms[0].walls[1]._roomLines[0].value).toBe(39);
    }
  });

  it('ignores face-line deletion for a room line', () => {
    expect(reduce(initial, deleteLayoutLine({ ...at, lineId: 'R1' }))).toBe(initial);
  });

  it('gives room-line selection lowest priority and finds face lines across the room', () => {
    const selected = reduce(initial, setSelection({ roomLineId: 'R1' }));
    expect(selected.selection.roomLineId).toBe('R1');
    expect(selected.selection).not.toHaveProperty('lineId');
    const local = reduce(selected, setSelection({ lineId: 'X', roomLineId: 'R1' }));
    expect(local.selection.lineId).toBe('X');
    expect(local.selection).not.toHaveProperty('roomLineId');
    for (const payload of [
      { runId: 'sink' }, { openingId: 'W' }, { recessId: 'recess' },
      { soffitId: 'soffit' }, { endPanel: 'start' }, {},
    ]) {
      const state = reduce(selected, setSelection({ roomLineId: 'R1', ...payload }));
      if (Object.keys(payload).length) expect(state.selection).not.toHaveProperty('roomLineId');
    }
    expect(reduce(selected, setSelection({})).selection).not.toHaveProperty('roomLineId');
    const source = cloneRoom(roomR);
    source.walls[1].lines = [line('back', 30, { wallSide: 'back' }), line('front', 10)];
    const start = { ...initial, rooms: [source], activeWallId: 'wall-1' };
    const back = reduce(start, setSelection({ lineId: 'back' }));
    expect(back.activeWallSide).toBe('back');
    expect(reduce(back, setSelection({ lineId: 'front' })).activeWallSide).toBe('front');
  });

  it('edits from either face, snaps unless exact, and returns the face position after reference clamping', () => {
    expect(moveLineTo(roomR, 'wall-2', 'R1', 45.3, DEFAULT_SETTINGS)).toMatchObject({ x: 45.5, value: 45.5 });
    expect(moveLineTo(roomR, 'wall-2', 'R1', 45.3, DEFAULT_SETTINGS, { exact: true })).toMatchObject({ x: 45.3 });
    const back = moveLineTo(roomR, 'wall-2', 'R1', 75, DEFAULT_SETTINGS, { wallSide: 'back' });
    expect(back).toMatchObject({ ok: true, x: 75, value: 75 });
    expect(back.room.roomLines[0].value).toBe(105);
    const state = reduce({ ...initial, activeWallSide: 'back' }, updateLayoutLine({ ...at, lineId: 'R1', value: 75 }));
    expect(state.rooms[0].roomLines[0].value).toBe(105);
    const extended = cloneRoom(roomR);
    Object.assign(extended.walls[1], { x1: 300, x2: 0 });
    const result = moveLineTo(extended, 'wall-2', 'R1', 0, DEFAULT_SETTINGS);
    expect(result).toMatchObject({ ok: true, x: 60, value: 60 });
    expect(result.room.roomLines[0].value).toBe(0);
    for (const [wallId, lineId, x] of [['gone', 'R1', 10], ['wall-3', 'R1', 10], ['wall-2', 'gone', 10], ['wall-2', 'R1', NaN]]) {
      expect(moveLineTo(roomR, wallId, lineId, x, DEFAULT_SETTINGS).ok).toBe(false);
    }
  });

  it('applies reference, end and explicit distance in order and trims labels', () => {
    const referenced = reduce(initial, updateRoomLine({ roomLineId: 'R1', wallId: 'wall-2', wallSide: 'back', from: 'right' }));
    expect(referenced.rooms[0].roomLines[0]).toMatchObject({ wallId: 'wall-2', wallSide: 'back', from: 'right', value: 39 });
    expect(referenced.rooms[0].walls).toEqual(roomR.walls);
    const state = reduce(initial, updateRoomLine({
      roomLineId: 'R1', wallId: 'wall-2', wallSide: 'back', from: 'right', value: 30, label: '  Sink CL  ',
    }));
    expect(state.rooms[0].roomLines[0]).toEqual({
      id: 'R1', label: 'Sink CL', wallId: 'wall-2', wallSide: 'back', from: 'right', value: 30,
    });
    expect(state.rooms[0].walls[1]._roomLines[0].value).toBe(30);
    expect(state.rooms[0].walls[1].runs[0].x).toBe(12);
    const front = reduce(referenced, updateRoomLine({ roomLineId: 'R1', wallSide: 'front' }));
    expect(front.rooms[0].roomLines[0]).not.toHaveProperty('wallSide');
    expect(front.rooms[0].walls).toEqual(roomR.walls);
  });

  it('rejects invalid edits and honours explicit room ids without touching another room', () => {
    for (const payload of [
      {}, { roomLineId: 'gone' }, { wallId: 'gone' }, { wallId: null }, { wallSide: 'top' },
      { from: 'up' }, { value: -1 }, { value: Infinity }, { value: NaN },
      { label: '' }, { label: ' '.repeat(3) }, { label: 'x'.repeat(25) }, { label: 1 },
    ]) {
      expect(reduce(initial, updateRoomLine({ roomLineId: 'R1', ...payload }))).toBe(initial);
    }
    for (const payload of [
      { from: 'up' }, { value: -1 }, { value: Infinity }, { wallSide: 'top' }, { wallSide: null },
      { id: '' }, { id: 'R1' }, { wallId: 'gone' }, { roomId: 'gone' },
    ]) {
      expect(reduce(initial, addRoomLine({ ...at, from: 'left', value: 20, id: 'new', ...payload }))).toBe(initial);
    }
    expect(reduce(initial, deleteRoomLine({ roomLineId: 'gone' }))).toBe(initial);
    expect(reduce(initial, promoteLayoutLine({ ...at, lineId: 'gone' }))).toBe(initial);
    const other = room({ id: 'other', walls: [wall()] });
    const start = { ...initial, rooms: [roomR, other], activeRoomId: 'other' };
    const state = reduce(start, updateRoomLine({ roomId: roomR.id, roomLineId: 'R1', value: 100 }));
    expect(state.rooms[0].roomLines[0].value).toBe(100);
    expect(state.rooms[1]).toBe(other);
    const added = reduce(start, addRoomLine({ ...at, roomId: roomR.id, from: 'left', value: 10, label: '  Axis  ' }));
    expect(added.rooms[0].roomLines[1].label).toBe('Axis');
    expect(added.rooms[1]).toBe(other);
  });

  it('keeps line edits covered by read-only and issued-version guards', () => {
    const source = cloneRoom(roomR);
    source.walls[1].lines = [line('local', 10)];
    const start = { ...initial, rooms: [source] };
    const actions = [
      addRoomLine({ ...at, from: 'left', value: 10 }), updateRoomLine({ roomLineId: 'R1', value: 100 }),
      deleteRoomLine({ roomLineId: 'R1' }), promoteLayoutLine({ ...at, lineId: 'local' }),
    ];
    for (const state of [{ ...start, cloud: { room: { readOnly: true } } }, { ...start, source: 'version' }]) {
      for (const action of actions) expect(reduce(state, action)).toBe(state);
    }
  });

  it('creates the first optional room-line list and preserves other lines when deleting one', () => {
    const plain = room({ walls: [wall()] });
    const start = { ...initial, rooms: [plain], activeWallId: 'wall-1' };
    const added = reduce(start, addRoomLine({ wallId: 'wall-1', id: 'first', from: 'right', value: 20 }));
    expect(added.rooms[0].roomLines).toEqual([
      { id: 'first', label: 'R1', wallId: 'wall-1', from: 'right', value: 20 },
    ]);
    expect(plain).not.toHaveProperty('roomLines');
    const state = reduce(added,
      addRoomLine({ wallId: 'wall-1', id: 'second', from: 'left', value: 40 }),
      deleteRoomLine({ roomLineId: 'first' }));
    expect(state.rooms[0].roomLines).toEqual([
      { id: 'second', label: 'R2', wallId: 'wall-1', from: 'left', value: 40 },
    ]);
    expect(state.rooms[0].walls[0]._roomLines.map((entry) => entry.id)).toEqual(['second', 'second']);
  });

  it('converts face coordinates to the stored distance and handles missing references', () => {
    expect(roomLineValueForFaceX(roomR, roomR.walls[1], 'front', 'R1', 45)).toBe(105);
    expect(roomLineValueForFaceX(roomR, roomR.walls[1], 'back', 'R1', 75)).toBe(105);
    expect(roomLineValueForFaceX(roomR, roomR.walls[1], 'front', 'R1', -1000)).toBe(0);
    expect(roomLineValueForFaceX(roomR, roomR.walls[1], 'front', 'R1', 1000)).toBe(240);
    expect(roomLineValueForFaceX(roomR, roomR.walls[1], 'front', 'gone', 10)).toBeNull();
    expect(roomLineValueForFaceX(roomR, null, 'front', 'R1', 10)).toBeNull();
  });
});
