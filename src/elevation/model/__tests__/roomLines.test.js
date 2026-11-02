import { describe, expect, it } from 'vitest';
import { attach, room, roomLine, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS, findRoomLine, isRoomLine, nextRoomLineLabel, roomLineFrame } from '../index.js';
import { cloneRoom } from '../roomClone.js';
import { ELEVATION_SCHEMA_VERSION, isRoom } from '../../store/documentValidation.js';
import { roomFromDocument, toRoomDocument } from '../../store/persistence.js';

const roomR = room({
  walls: [
    wall({ id: 'wall-1', x1: 0, y1: 0, x2: 240, y2: 0 }),
    wall({ id: 'wall-2', x1: 180, y1: 96, x2: 60, y2: 96, runs: [run({
      id: 'sink', x: 0, width: 36,
      ends: { left: { type: 'none' }, right: { type: 'none' } }, attach: attach('R1'),
    })] }),
    wall({ id: 'wall-3', x1: 300, y1: 0, x2: 300, y2: 120 }),
  ],
  wallOrder: ['wall-1', 'wall-2', 'wall-3'],
  roomLines: [roomLine('R1', { wallId: 'wall-1', from: 'right', value: 99 })],
});

describe('LL7 a room line data', () => {
  it('anchor 1: accepts Room R and saves/loads it unchanged', () => {
    expect(isRoom(roomR)).toBe(true);
    const saved = JSON.parse(JSON.stringify(toRoomDocument(roomR)));
    expect(roomFromDocument(saved, ELEVATION_SCHEMA_VERSION, DEFAULT_SETTINGS))
      .toEqual({ ok: true, room: roomR });
  });

  it('anchor 2: rejects malformed room lines and duplicate ids without checking references', () => {
    for (const overrides of [
      { extra: true }, { label: '' }, { value: -1 }, { from: 'up' },
      { id: '' }, { id: 1 }, { label: ' '.repeat(2) }, { label: 'a'.repeat(25) },
      { label: ' R1 ' }, { label: null }, { wallId: '' }, { wallId: 1 },
      { wallSide: 'front' }, { wallSide: 'top' }, { value: Infinity }, { value: NaN }, { value: '1' },
    ]) {
      const invalid = roomLine('R1', overrides);
      expect(isRoomLine(invalid), JSON.stringify(overrides)).toBe(false);
      expect(isRoom({ ...roomR, roomLines: [invalid] })).toBe(false);
    }
    for (const roomLines of [null, {}, [null], [roomLine('R1'), roomLine('R1')]]) {
      expect(isRoom({ ...roomR, roomLines })).toBe(false);
    }
    expect(isRoom({ ...roomR, roomLines: [roomLine('R2', { wallId: 'gone', wallSide: 'back' })] })).toBe(true);
    expect(isRoomLine(roomLine('R2', { label: 'a'.repeat(24) }))).toBe(true);
  });

  it('anchor 3: clones the room line array and each line independently', () => {
    const copy = cloneRoom(roomR);
    expect(copy.roomLines).toEqual(roomR.roomLines);
    expect(copy.roomLines).not.toBe(roomR.roomLines);
    expect(copy.roomLines[0]).not.toBe(roomR.roomLines[0]);
    copy.roomLines[0].value = 12;
    expect(roomR.roomLines[0].value).toBe(99);
    const empty = room({ roomLines: [] });
    expect(cloneRoom(empty).roomLines).toEqual([]);
    expect(cloneRoom(empty).roomLines).not.toBe(empty.roomLines);
  });

  it('anchor 4: keeps roomLines absent through clone and save/load', () => {
    const plain = room({ walls: [wall()] });
    expect(cloneRoom(plain)).not.toHaveProperty('roomLines');
    const saved = JSON.parse(JSON.stringify(toRoomDocument(plain)));
    expect(saved).not.toHaveProperty('roomLines');
    const loaded = roomFromDocument(saved, ELEVATION_SCHEMA_VERSION, DEFAULT_SETTINGS);
    expect(loaded.ok).toBe(true);
    expect(loaded.room).not.toHaveProperty('roomLines');
  });

  it('anchor 5: assigns the lowest unused R label, ignoring other labels and face lines', () => {
    expect(nextRoomLineLabel(room())).toBe('R1');
    expect(nextRoomLineLabel(room({ roomLines: [
      roomLine('R1'), roomLine('Range CL'), roomLine('R3'),
    ] }))).toBe('R2');
    expect(nextRoomLineLabel(room({ roomLines: [roomLine('R01'), roomLine('L1')] }))).toBe('R1');
  });

  it('anchor 6: resolves Room R at x 141, point (141, 0), or null for a missing wall', () => {
    const reference = roomR.roomLines[0];
    const resolved = roomLineFrame(roomR, reference);
    expect(resolved).toEqual({
      wall: roomR.walls[0], side: 'front', frame: expect.objectContaining({
        leftPoint: { x: 0, y: 0 }, r: { x: 1, y: 0 }, n: { x: 0, y: 1 }, length: 240,
      }), x: 141, point: { x: 141, y: 0 },
    });
    expect(resolved.wall).toBe(roomR.walls[0]);
    expect(roomLineFrame(roomR, { ...reference, wallId: 'gone' })).toBeNull();
    expect(roomLineFrame(roomR, roomLine('back', { wallSide: 'back', value: 99 })))
      .toMatchObject({ side: 'back', x: 99, point: { x: 141, y: -4.5 } });
    expect(findRoomLine(roomR, 'R1')).toBe(reference);
    expect(findRoomLine(roomR, 'gone')).toBeNull();
    expect(findRoomLine(room(), 'R1')).toBeNull();
  });
});
