import { describe, expect, it } from 'vitest';
import { attach, auto, line, opening, room, roomLine, run, wall } from '../../../test/builders.js';
import { canMoveWallGroup, DEFAULT_SETTINGS, moveWallGroup, wallFrame, wallGroup } from '../index.js';
import { layoutRun } from '../faceLayouts.js';
import { cloneRoom } from '../roomClone.js';
import { resolveWall } from '../room.js';
import { roomLineOnFace } from '../roomLines.js';
import { syncRoom } from '../roomSync.js';

const roomI = room({
  walls: [
    wall({ id: 'wall-1', x1: 0, y1: 0, x2: 240, y2: 0 }),
    wall({ id: 'wall-2', x1: 180, y1: 96, x2: 60, y2: 96, runs: [run({
      id: 'sink', x: 0, width: 36,
      ends: { left: { type: 'none' }, right: { type: 'none' } }, attach: attach('R1'),
    })] }),
    wall({ id: 'wall-3', x1: 300, y1: 0, x2: 300, y2: 120 }),
  ],
  roomLines: [roomLine('R1', { from: 'right', value: 120 })],
});

describe('LL8 a wall group move model', () => {
  it('anchor 1: finds separate walls, connected islands and landings in both directions', () => {
    for (const id of ['wall-1', 'wall-2', 'wall-3']) expect(wallGroup(roomI, id)).toEqual([id]);
    const connected = cloneRoom(roomI);
    connected.walls[1].connections.end = { wallId: 'wall-5', endpoint: 'start' };
    connected.walls.push(wall({ id: 'wall-5', x1: 60, y1: 96, x2: 60, y2: 150,
      connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }));
    for (const id of ['wall-2', 'wall-5']) expect(wallGroup(connected, id)).toEqual(['wall-2', 'wall-5']);
    const landed = cloneRoom(roomI);
    landed.walls.push(wall({ id: 'wall-6', x1: 100, y1: 96, x2: 100, y2: 150,
      landings: { start: { wallId: 'wall-2', side: 'front', ref: 'left', to: 'center', offset: 80 }, end: null } }));
    for (const id of ['wall-2', 'wall-6']) expect(wallGroup(landed, id)).toEqual(['wall-2', 'wall-6']);
  });

  it('anchor 2: permits an island but refuses a whole room joined by a landing', () => {
    expect(canMoveWallGroup(roomI, 'wall-2')).toEqual({ ok: true, reason: null });
    const subject = room({ walls: [roomI.walls[0], wall({ id: 'wall-2',
      landings: { start: { wallId: 'wall-1', side: 'front', ref: 'left', to: 'center', offset: 60 }, end: null } })] });
    expect(canMoveWallGroup(subject, 'wall-1')).toEqual({ ok: false, reason: 'whole-room' });
    expect(moveWallGroup(subject, 'wall-1', { x: 10, y: 0 })).toEqual({
      ok: false, reason: 'whole-room', room: subject, notes: [],
      message: "Every wall is joined to Wall 1, so there's nothing to move it against.",
    });
    expect(moveWallGroup(subject, 'wall-1', { x: 10, y: 0 }).room).toBe(subject);
  });

  it('anchor 3: moves W2 left without syncing, keeping the sink on the fixed room line after sync', () => {
    const before = syncRoom(roomI, DEFAULT_SETTINGS);
    expect(wallFrame(roomI, roomI.walls[1])).toMatchObject({ r: { x: -1, y: 0 }, n: { x: 0, y: -1 } });
    const result = moveWallGroup(before, 'wall-2', { x: -10, y: 0 });
    expect(result).toMatchObject({ ok: true, reason: null, message: '', notes: [] });
    expect(result.room.walls[1]).toMatchObject({ x1: 170, y1: 96, x2: 50, y2: 96 });
    expect(result.room.walls[0]).toBe(before.walls[0]);
    expect(result.room.walls[2]).toBe(before.walls[2]);
    expect(result.room.roomLines[0]).toBe(before.roomLines[0]);
    expect(result.room.walls[1].runs[0].x).toBe(42);
    const synced = syncRoom(result.room, DEFAULT_SETTINGS);
    expect(roomLineOnFace(synced, synced.walls[1], 'front', 'R1').value).toBe(50);
    expect(synced.walls[1].runs[0].x).toBe(32);
    expect(170 - (synced.walls[1].runs[0].x + 18)).toBe(120);
    expect(before.walls[1]).toMatchObject({ x1: 180, x2: 60, runs: [{ x: 42 }] });
  });

  it('anchor 4: moves across toward W1 while preserving the sink face position', () => {
    const result = moveWallGroup(roomI, 'wall-2', { x: 0, y: -6 });
    expect(result.room.walls[1]).toMatchObject({ y1: 90, y2: 90 });
    const synced = syncRoom(result.room, DEFAULT_SETTINGS);
    expect(roomLineOnFace(synced, synced.walls[1], 'front', 'R1').value).toBe(60);
    expect(synced.walls[1].runs[0].x).toBe(42);
  });

  it('anchor 5: translates both legs of an L island, retaining the connections', () => {
    const subject = cloneRoom(roomI);
    subject.walls[1].connections.end = { wallId: 'wall-5', endpoint: 'start' };
    subject.walls.push(wall({ id: 'wall-5', x1: 60, y1: 96, x2: 60, y2: 150,
      connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }));
    const result = moveWallGroup(subject, 'wall-2', { x: -10, y: 0 });
    expect(result.room.walls[3]).toMatchObject({ x1: 50, y1: 96, x2: 50, y2: 150 });
    expect(result.room.walls[1].connections).toEqual(subject.walls[1].connections);
    expect(result.room.walls[3].connections).toEqual(subject.walls[3].connections);
  });

  it('anchor 6: keeps a room line referenced to the island fixed in plan', () => {
    const subject = cloneRoom(roomI);
    subject.roomLines.push(roomLine('R2', { wallId: 'wall-2', value: 60 }));
    subject.walls[0].runs = [run({ id: 'range', width: 36, attach: attach('R2'),
      ends: { left: { type: 'none' }, right: { type: 'none' } } })];
    const before = syncRoom(subject, DEFAULT_SETTINGS);
    const result = moveWallGroup(before, 'wall-2', { x: -10, y: 0 });
    expect(result.room.roomLines[1]).toEqual(roomLine('R2', { wallId: 'wall-2', value: 50 }));
    expect(result.notes).toEqual([]);
    const synced = syncRoom(result.room, DEFAULT_SETTINGS);
    expect(roomLineOnFace(synced, synced.walls[0], 'front', 'R2').value).toBe(120);
    expect(synced.walls[0].runs[0]).toEqual(before.walls[0].runs[0]);
  });

  it('anchor 7: re-references an off-wall line to the first suitable front face', () => {
    const subject = { ...roomI, roomLines: [roomLine('R2', { wallId: 'wall-2', value: 5 })] };
    const result = moveWallGroup(subject, 'wall-2', { x: -10, y: 0 });
    expect(result.room.roomLines).toEqual([roomLine('R2', { value: 175 })]);
    expect(result.notes).toEqual(['R2 is now measured from Wall 1.']);
    expect(result.message).toBe(result.notes[0]);
  });

  it('anchor 8: prefers an attached back face over an unattached front face', () => {
    const subject = cloneRoom(roomI);
    subject.roomLines = [roomLine('R2', { wallId: 'wall-2', value: 5 })];
    subject.walls[0].runs = [run({ wallSide: 'back', attach: attach('R2') })];
    const result = moveWallGroup(subject, 'wall-2', { x: -10, y: 0 });
    expect(result.room.roomLines).toEqual([roomLine('R2', { wallSide: 'back', value: 65 })]);
  });

  it('anchor 9: refuses atomically when no square face contains the room line', () => {
    const subject = room({ walls: roomI.walls.slice(1),
      roomLines: [roomLine('R2', { wallId: 'wall-2', value: 5 })] });
    const before = structuredClone(subject);
    const result = moveWallGroup(subject, 'wall-2', { x: -10, y: 0 });
    expect(result).toEqual({ ok: false, reason: 'room-line-off-walls', room: subject, notes: [],
      message: 'R2 would end up past the end of every wall it can be measured from: move R2 first.' });
    expect(result.room).toBe(subject);
    expect(subject).toEqual(before);
  });

  it('anchor 10: flexes neighbours around the middle column while the run stays on both wall ends', () => {
    const subject = cloneRoom(roomI);
    subject.walls[1].runs = [run({ id: 'island', autoCount: false, anchors: { left: true, right: true },
      items: [auto('left'), { ...auto('middle'), attach: attach('R1') }, auto('right')] })];
    const before = syncRoom(subject, DEFAULT_SETTINGS);
    const result = moveWallGroup(before, 'wall-2', { x: -10, y: 0 });
    const after = syncRoom(result.room, DEFAULT_SETTINGS);
    const pieces = (current) => {
      const view = resolveWall(current, current.walls[1], 'front');
      return layoutRun(current, view, view.runs[0], DEFAULT_SETTINGS).pieces;
    };
    const oldColumns = pieces(before).filter((piece) => piece.kind === 'cabinet');
    const newColumns = pieces(after).filter((piece) => piece.kind === 'cabinet');
    expect(oldColumns).toHaveLength(3);
    expect(newColumns).toHaveLength(3);
    expect(oldColumns[1].x + oldColumns[1].width / 2).toBe(60);
    expect(newColumns[1].x + newColumns[1].width / 2).toBe(50);
    expect(after.walls[1].runs[0]).toMatchObject({ x: 0, width: 120 });
    expect(newColumns[0].width).toBe(oldColumns[0].width - 10);
    expect(newColumns[2].width).toBe(oldColumns[2].width + 10);
    expect(oldColumns.map(({ width }) => width)).toEqual([39, 39, 39]);
    expect(newColumns.map(({ width }) => width)).toEqual([29, 39, 49]);
    expect(pieces(after).filter((piece) => piece.kind === 'filler').map(({ width }) => width)).toEqual([1.5, 1.5]);
  });

  it('anchor 11: an unattached run rides with the island at its stored x', () => {
    const subject = cloneRoom(roomI);
    subject.walls[1].runs = [run({ x: 10, width: 36 })];
    const result = moveWallGroup(subject, 'wall-2', { x: -10, y: 0 });
    expect(syncRoom(result.room, DEFAULT_SETTINGS).walls[1].runs[0].x).toBe(10);
  });

  it('handles unknown walls, invalid deltas and a zero move without cloning', () => {
    expect(wallGroup(roomI, 'gone')).toEqual([]);
    expect(canMoveWallGroup(roomI, 'gone')).toEqual({ ok: false, reason: 'wall-not-found' });
    expect(moveWallGroup(roomI, 'gone', { x: 1, y: 0 })).toMatchObject({ ok: false, reason: 'wall-not-found', notes: [] });
    for (const delta of [null, undefined, {}, { x: 0 }, { x: '1', y: 0 }, { x: NaN, y: 0 },
      { x: 0, y: Infinity }, { x: -Infinity, y: 0 }]) {
      const result = moveWallGroup(roomI, 'wall-2', delta);
      expect(result).toMatchObject({ ok: false, reason: 'invalid-delta', notes: [] });
      expect(result.room).toBe(roomI);
    }
    const zero = moveWallGroup(roomI, 'wall-2', { x: 0, y: 0 });
    expect(zero).toEqual({ ok: true, reason: null, message: '', room: roomI, notes: [] });
    expect(zero.room).toBe(roomI);
  });

  it('traverses mixed connection and landing cycles repeatedly in room.walls order', () => {
    const subject = room({ walls: [
      wall({ id: 'c', landings: { end: { wallId: 'b' } } }),
      wall({ id: 'a', connections: { start: { wallId: 'b', endpoint: 'end' } } }),
      wall({ id: 'b', landings: { start: { wallId: 'a' } } }),
      wall({ id: 'outside' }),
    ], wallOrder: ['b', 'a', 'c', 'outside'] });
    for (const id of ['a', 'b', 'c']) expect(wallGroup(subject, id)).toEqual(['c', 'a', 'b']);
    expect(canMoveWallGroup(subject, 'a').ok).toBe(true);
    const result = moveWallGroup(subject, 'a', { x: 2, y: 3 });
    for (const wall of result.room.walls.slice(0, 3)) expect(wall).toMatchObject({ x1: 2, y1: 3, x2: 146, y2: 3 });
    expect(result.room.walls[3]).toBe(subject.walls[3]);
  });

  it('preserves every wall-relative field and supports moving the perimeter around the island', () => {
    const subject = cloneRoom(roomI);
    Object.assign(subject.walls[0], {
      runs: [run({ x: 10, width: 36 })], openings: [opening()],
      lines: [line('L1', 20)], joints: [{ id: 'j', x: 18 }],
      soffits: [{ id: 's', x: 5, width: 20 }], recesses: [{ id: 'r', x: 12, width: 10 }],
    });
    const before = structuredClone(subject);
    const result = moveWallGroup(subject, 'wall-1', { x: 12, y: -6 });
    const { x1, y1, x2, y2, ...relative } = result.room.walls[0];
    expect({ ...relative, x1: 0, y1: 0, x2: 240, y2: 0 }).toEqual(subject.walls[0]);
    expect({ x1, y1, x2, y2 }).toEqual({ x1: 12, y1: -6, x2: 252, y2: -6 });
    expect(result.room.walls[1]).toBe(subject.walls[1]);
    expect(subject).toEqual(before);
  });

  it('keeps right-end measurements, back references, endpoint limits and multiple notes', () => {
    const subject = cloneRoom(roomI);
    subject.roomLines = [
      roomLine('edge', { wallId: 'wall-2', from: 'right', value: 110 }),
      roomLine('back', { wallId: 'wall-2', wallSide: 'back', from: 'right', value: 60 }),
      roomLine('R2', { wallId: 'wall-2', value: 5 }),
      roomLine('R3', { wallId: 'wall-2', from: 'right', value: 118 }),
    ];
    const result = moveWallGroup(subject, 'wall-2', { x: -10, y: 0 });
    expect(result.room.roomLines).toEqual([
      roomLine('edge', { wallId: 'wall-2', from: 'right', value: 120 }),
      roomLine('back', { wallId: 'wall-2', wallSide: 'back', from: 'right', value: 50 }),
      roomLine('R2', { value: 175 }),
      roomLine('R3', { from: 'right', value: 62 }),
    ]);
    expect(result.notes).toEqual(['R2 is now measured from Wall 1.', 'R3 is now measured from Wall 1.']);
    expect(result.message).toBe(result.notes.join(' '));
    const atRight = moveWallGroup(room({ ...roomI, roomLines: [roomLine('R2', { wallId: 'wall-2', value: 110 })] }),
      'wall-2', { x: 10, y: 0 });
    expect(atRight.room.roomLines[0]).toMatchObject({ wallId: 'wall-2', value: 120 });
    expect(atRight.notes).toEqual([]);
  });

  it('rejects out-of-square attached faces as replacement references and leaves earlier changes unapplied', () => {
    const subject = cloneRoom(roomI);
    subject.walls = subject.walls.slice(1);
    subject.walls[1].runs = [run({ attach: attach('bad') })];
    subject.roomLines = [roomLine('good', { wallId: 'wall-2', value: 60 }),
      roomLine('bad', { wallId: 'wall-2', value: 5 })];
    const before = structuredClone(subject);
    const result = moveWallGroup(subject, 'wall-2', { x: -10, y: 0 });
    expect(result.reason).toBe('room-line-off-walls');
    expect(result.room).toBe(subject);
    expect(result.notes).toEqual([]);
    expect(subject).toEqual(before);
  });

  it('allows a cabinet to fall below minimum width and leaves that warning to existing sync/layout rules', () => {
    const subject = cloneRoom(roomI);
    subject.walls[1].runs = [run({ id: 'island', autoCount: false, anchors: { left: true, right: true },
      items: [auto('left'), { ...auto('middle'), attach: attach('R1') }, auto('right')] })];
    const before = syncRoom(subject, DEFAULT_SETTINGS);
    const result = moveWallGroup(before, 'wall-2', { x: -45, y: 0 });
    expect(result.ok).toBe(true);
    const after = syncRoom(result.room, DEFAULT_SETTINGS);
    const view = resolveWall(after, after.walls[1], 'front');
    const layout = layoutRun(after, view, view.runs[0], DEFAULT_SETTINGS);
    expect(layout.warnings.some(({ message }) => message.includes('below minimum width because of line R1'))).toBe(true);
  });
});
