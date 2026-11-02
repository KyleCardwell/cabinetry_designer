import { describe, expect, it } from 'vitest';
import { attach, line, room, roomLine, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { cloneRoom } from '../roomClone.js';
import { canAttachWall, heldBy } from '../wallGroups.js';
import { ELEVATION_SCHEMA_VERSION, isRoom } from '../../store/documentValidation.js';
import { roomFromDocument, toRoomDocument } from '../../store/persistence.js';

const roomI = room({
  walls: [
    wall({ id: 'wall-1', x1: 0, y1: 0, x2: 240, y2: 0 }),
    wall({ id: 'wall-2', x1: 180, y1: 96, x2: 60, y2: 96, runs: [run({
      id: 'sink', x: 0, width: 36,
      ends: { left: { type: 'none' }, right: { type: 'none' } }, attach: attach('R1'),
    })] }),
    wall({ id: 'wall-3', x1: 300, y1: 0, x2: 300, y2: 120 }),
  ],
  wallOrder: ['wall-1', 'wall-2', 'wall-3'],
  roomLines: [roomLine('R1', { from: 'right', value: 120 })],
});

describe('LL8 b wall attachment data', () => {
  it('anchor 1: validates, saves/loads and independently clones a wall attachment', () => {
    const subject = cloneRoom(roomI);
    subject.walls[1].attach = attach('R1');
    expect(isRoom(subject)).toBe(true);
    const saved = JSON.parse(JSON.stringify(toRoomDocument(subject)));
    expect(roomFromDocument(saved, ELEVATION_SCHEMA_VERSION, DEFAULT_SETTINGS))
      .toEqual({ ok: true, room: subject });
    const copy = cloneRoom(subject);
    expect(copy.walls[1].attach).toEqual(subject.walls[1].attach);
    expect(copy.walls[1].attach).not.toBe(subject.walls[1].attach);
    copy.walls[1].attach.offset = 7;
    expect(subject.walls[1].attach.offset).toBe(0);
  });

  it('anchor 2: preserves absent attachments through clone and save/load and rejects at: top', () => {
    expect(cloneRoom(roomI).walls.every((entry) => !Object.hasOwn(entry, 'attach'))).toBe(true);
    const saved = JSON.parse(JSON.stringify(toRoomDocument(roomI)));
    expect(saved.walls.every((entry) => !Object.hasOwn(entry, 'attach'))).toBe(true);
    const loaded = roomFromDocument(saved, ELEVATION_SCHEMA_VERSION, DEFAULT_SETTINGS);
    expect(loaded).toEqual({ ok: true, room: roomI });
    expect(loaded.room.walls.every((entry) => !Object.hasOwn(entry, 'attach'))).toBe(true);
    const invalid = cloneRoom(roomI);
    invalid.walls[1].attach = attach('R1', 'top');
    expect(isRoom(invalid)).toBe(false);
  });

  it('anchor 3: allows the square island, rejects the perpendicular wall and missing room lines', () => {
    expect(canAttachWall(roomI, 'wall-2', 'R1')).toEqual({ ok: true, reason: null });
    expect(canAttachWall(roomI, 'wall-3', 'R1')).toEqual({ ok: false, reason: 'not-square' });
    expect(canAttachWall(roomI, 'wall-2', 'R9')).toEqual({ ok: false, reason: 'no-line' });
  });

  it('anchor 4: rejects a line measured from the attached wall itself', () => {
    const subject = cloneRoom(roomI);
    subject.roomLines.push(roomLine('R2', { wallId: 'wall-2' }));
    expect(canAttachWall(subject, 'wall-2', 'R2')).toEqual({ ok: false, reason: 'own-group' });
  });

  it('anchor 5: finds the held wall from either leg and rejects a second attachment in the group', () => {
    const subject = cloneRoom(roomI);
    subject.walls[1].attach = attach('R1');
    subject.walls[1].connections.end = { wallId: 'wall-5', endpoint: 'start' };
    subject.walls.push(wall({ id: 'wall-5', x1: 60, y1: 96, x2: 60, y2: 150,
      connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }));
    expect(canAttachWall(subject, 'wall-5', 'R1')).toEqual({ ok: false, reason: 'group-held' });
    for (const id of ['wall-2', 'wall-5']) {
      const held = heldBy(subject, id);
      expect(held).toEqual({ wall: subject.walls[1], attach: subject.walls[1].attach, line: subject.roomLines[0] });
      expect(held.wall).toBe(subject.walls[1]);
      expect(held.attach).toBe(subject.walls[1].attach);
      expect(held.line).toBe(subject.roomLines[0]);
    }
  });

  it('anchor 6: rejects attachment chains in either order', () => {
    const subject = cloneRoom(roomI);
    subject.walls.push(wall({ id: 'wall-4', x1: 180, y1: 160, x2: 60, y2: 160 }));
    subject.roomLines.push(roomLine('R3', { wallId: 'wall-2' }));
    subject.walls[1].attach = attach('R1');
    expect(canAttachWall(subject, 'wall-4', 'R3')).toEqual({ ok: false, reason: 'chained' });
    delete subject.walls[1].attach;
    subject.walls[3].attach = attach('R3');
    expect(canAttachWall(subject, 'wall-2', 'R1')).toEqual({ ok: false, reason: 'chained' });
  });

  it('uses attachment shape validation without checking line references', () => {
    const subject = cloneRoom(roomI);
    for (const at of ['left', 'center', 'right']) {
      subject.walls[1].attach = attach('gone', at, -7);
      expect(isRoom(subject)).toBe(true);
    }
    for (const invalid of [null, [], {}, attach('', 'center'), attach('R1', 'center', '1'),
      attach('R1', 'center', NaN), attach('R1', 'center', Infinity), { ...attach('R1'), extra: true }]) {
      subject.walls[1].attach = invalid;
      expect(isRoom(subject)).toBe(false);
    }
  });

  it('handles missing walls, face lines, back references and reattaching the same wall without mutation', () => {
    const subject = cloneRoom(roomI);
    subject.walls[1].lines = [line('L1', 60)];
    subject.walls[1].attach = attach('R1');
    subject.roomLines.push(roomLine('back', { wallSide: 'back' }), roomLine('gone', { wallId: 'missing' }));
    const before = structuredClone(subject);
    expect(canAttachWall(subject, 'missing', 'R1')).toEqual({ ok: false, reason: 'wall-not-found' });
    expect(canAttachWall(subject, 'wall-2', 'L1')).toEqual({ ok: false, reason: 'no-line' });
    expect(canAttachWall(subject, 'wall-2', 'gone')).toEqual({ ok: false, reason: 'no-line' });
    expect(canAttachWall(subject, 'wall-2', 'R1')).toEqual({ ok: true, reason: null });
    expect(canAttachWall(subject, 'wall-2', 'back')).toEqual({ ok: true, reason: null });
    expect(heldBy(subject, 'missing')).toBeNull();
    expect(heldBy(subject, 'wall-1')).toBeNull();
    expect(subject).toEqual(before);
  });
});
