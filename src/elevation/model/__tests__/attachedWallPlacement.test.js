import { describe, expect, it } from 'vitest';
import { attach, room, roomLine, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { wallFrame } from '../geometry.js';
import { cloneRoom } from '../roomClone.js';
import { roomLineOnFace } from '../roomLines.js';
import { syncRoom } from '../roomSync.js';
import { wallLabel } from '../topology.js';
import { moveWallGroup, placeAttachedWalls, pruneWallAttachments, wallAttachmentStatus } from '../wallGroups.js';

const roomI = room({
  walls: [
    wall({ id: 'wall-1', x1: 0, y1: 0, x2: 240, y2: 0 }),
    wall({ id: 'wall-2', x1: 180, y1: 96, x2: 60, y2: 96, attach: attach('R1'), runs: [run({
      id: 'sink', x: 0, width: 36,
      ends: { left: { type: 'none' }, right: { type: 'none' } }, attach: attach('R1'),
    })] }),
    wall({ id: 'wall-3', x1: 300, y1: 0, x2: 300, y2: 120 }),
  ],
  roomLines: [roomLine('R1', { from: 'right', value: 110 })],
});
const joined = cloneRoom(roomI);
joined.walls[1].connections.end = { wallId: 'wall-5', endpoint: 'start' };
joined.walls.push(wall({ id: 'wall-5', x1: 60, y1: 96, x2: 60, y2: 150,
  connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }));

describe('walls held on room lines (LL8)', () => {
  it('places the island before projecting R1 and placing the sink', () => {
    const before = structuredClone(roomI);
    const synced = syncRoom(roomI, DEFAULT_SETTINGS);
    expect(synced.walls[1]).toMatchObject({ x1: 190, y1: 96, x2: 70, y2: 96, runs: [{ x: 42 }] });
    expect(roomLineOnFace(synced, synced.walls[1], 'front', 'R1').value).toBe(60);
    expect(wallAttachmentStatus(synced, 'wall-2')).toEqual({ line: synced.roomLines[0], square: true });
    expect(roomI).toEqual(before);
  });

  it('moving the line moves the island with the sink still centred', () => {
    const subject = syncRoom(roomI, DEFAULT_SETTINGS);
    subject.roomLines[0].value = 100;
    expect(syncRoom(subject, DEFAULT_SETTINGS).walls[1])
      .toMatchObject({ x1: 200, y1: 96, x2: 80, y2: 96, runs: [{ x: 42 }] });
  });

  it('holds the front left end on the line', () => {
    const subject = cloneRoom(roomI);
    subject.walls[1].attach = attach('R1', 'left');
    expect(syncRoom(subject, DEFAULT_SETTINGS).walls[1]).toMatchObject({ x1: 130, y1: 96, x2: 10, y2: 96 });
  });

  it('applies a positive offset toward the front elevation right', () => {
    const subject = cloneRoom(roomI);
    subject.walls[1].attach = attach('R1', 'center', 3);
    expect(syncRoom(subject, DEFAULT_SETTINGS).walls[1]).toMatchObject({ x1: 187, y1: 96, x2: 67, y2: 96 });
  });

  it('translates both legs of the connected island', () => {
    // The fixture warning applies: joining W5 flips W2's frame; keep the plan anchors below.
    expect(wallFrame(joined, joined.walls[1])).toMatchObject({ r: { x: 1, y: 0 }, n: { x: 0, y: 1 } });
    const synced = syncRoom(joined, DEFAULT_SETTINGS);
    expect(synced.walls[1]).toMatchObject({ x1: 190, y1: 96, x2: 70, y2: 96 });
    expect(synced.walls[3]).toMatchObject({ x1: 70, y1: 96, x2: 70, y2: 150 });
    expect(synced.walls[1].connections).toEqual(joined.walls[1].connections);
    expect(synced.walls[3].connections).toEqual(joined.walls[3].connections);
  });

  it('an unattached run rides along at its stored x without compensation', () => {
    const subject = cloneRoom(roomI);
    subject.walls[1].runs = [run({ x: 10, width: 36 })];
    const placed = placeAttachedWalls(subject);
    expect(placed.walls[1].runs).toBe(subject.walls[1].runs);
    expect(placed.walls[0]).toBe(subject.walls[0]);
    expect(placed.walls[2]).toBe(subject.walls[2]);
    expect(syncRoom(subject, DEFAULT_SETTINGS).walls[1].runs[0].x).toBe(10);
  });

  it('a second sync changes nothing and unattached rooms keep identity through both stages', () => {
    for (const fixture of [roomI, joined]) {
      const once = syncRoom(fixture, DEFAULT_SETTINGS);
      expect(syncRoom(once, DEFAULT_SETTINGS)).toEqual(once);
      expect(pruneWallAttachments(once)).toBe(once);
      expect(placeAttachedWalls(once)).toBe(once);
    }
    const subject = cloneRoom(roomI);
    delete subject.walls[1].attach;
    expect(pruneWallAttachments(subject)).toBe(subject);
    expect(placeAttachedWalls(subject)).toBe(subject);
    expect(wallAttachmentStatus(subject, 'wall-2')).toBeNull();
    expect(wallAttachmentStatus(subject, 'missing')).toBeNull();
  });

  it('deleting R1 drops the attachment and leaves the island at its last synced place', () => {
    const subject = syncRoom(roomI, DEFAULT_SETTINGS);
    delete subject.roomLines;
    expect(wallAttachmentStatus(subject, 'wall-2')).toBeNull();
    const synced = syncRoom(subject, DEFAULT_SETTINGS);
    expect(synced.walls[1]).not.toHaveProperty('attach');
    expect(synced.walls[1]).toMatchObject({ x1: 190, y1: 96, x2: 70, y2: 96 });
  });

  it('the later group attachment loses even when that later wall is not square', () => {
    const subject = cloneRoom(joined);
    subject.walls[3].attach = attach('R1');
    const synced = syncRoom(subject, DEFAULT_SETTINGS);
    expect(synced.walls[1]).toMatchObject({ attach: attach('R1'), x1: 190, y1: 96, x2: 70, y2: 96 });
    expect(synced.walls[3]).not.toHaveProperty('attach');
    expect(subject.walls[3].attach).toEqual(attach('R1'));
  });

  it('keeps an out-of-square attachment without placing its group', () => {
    const subject = cloneRoom(roomI);
    subject.walls[0].y2 = 10;
    expect(pruneWallAttachments(subject)).toBe(subject);
    expect(placeAttachedWalls(subject)).toBe(subject);
    const synced = syncRoom(subject, DEFAULT_SETTINGS);
    expect(synced.walls[1]).toMatchObject({ attach: attach('R1'), x1: 180, y1: 96, x2: 60, y2: 96 });
    expect(wallAttachmentStatus(synced, 'wall-2')).toEqual({ line: synced.roomLines[0], square: false });
  });

  it('locks along moves from either leg, but allows across moves', () => {
    for (const fixture of [roomI, joined]) {
      const subject = syncRoom(fixture, DEFAULT_SETTINGS);
      // With W5 joined, existing topology numbers the held wall as Wall 3.
      const label = fixture === roomI ? 'Wall 2' : wallLabel(subject, subject.walls[1]);
      for (const id of fixture === joined ? ['wall-2', 'wall-5'] : ['wall-2']) {
        const result = moveWallGroup(subject, id, { x: -10, y: 0 });
        expect(result).toEqual({ ok: false, reason: 'attached', room: subject, notes: [],
          message: `${label} is attached to line R1: move the line, or detach.` });
        expect(result.room).toBe(subject);
      }
      const across = moveWallGroup(subject, 'wall-2', { x: 0, y: -6 });
      expect(across.ok).toBe(true);
      expect(syncRoom(across.room, DEFAULT_SETTINGS).walls[1]).toMatchObject({ x1: 190, y1: 90, x2: 70, y2: 90 });
    }
  });

  it('prunes own-group attachments and attachments to removed reference walls before placement', () => {
    const own = cloneRoom(joined);
    own.roomLines[0].wallId = 'wall-5';
    const missing = cloneRoom(roomI);
    missing.roomLines[0].wallId = 'gone';
    for (const subject of [own, missing]) {
      const synced = syncRoom(subject, DEFAULT_SETTINGS);
      expect(synced.walls[1]).not.toHaveProperty('attach');
      expect(synced.walls[1]).toMatchObject({ x1: 180, y1: 96, x2: 60, y2: 96 });
    }
  });

  it('prunes both ends of a chain, including attachments that are no longer square', () => {
    const subject = cloneRoom(roomI);
    subject.roomLines.push(roomLine('R3', { wallId: 'wall-2', value: 60 }));
    subject.walls.push(wall({ id: 'wall-4', x1: 180, y1: 160, x2: 60, y2: 160, attach: attach('R3') }));
    for (const turned of [false, true]) {
      const candidate = cloneRoom(subject);
      if (turned) candidate.walls[0].y2 = 10;
      const synced = syncRoom(candidate, DEFAULT_SETTINGS);
      expect(synced.walls[1]).not.toHaveProperty('attach');
      expect(synced.walls[3]).not.toHaveProperty('attach');
      expect(synced.walls[1]).toMatchObject({ x1: 180, x2: 60 });
      expect(synced.walls[3]).toMatchObject({ x1: 180, x2: 60 });
    }
  });

  it('skips every face of a group held by the line when choosing a replacement reference', () => {
    const subject = cloneRoom(roomI);
    subject.walls[1].runs = [];
    subject.roomLines[0] = roomLine('R1', { from: 'right', value: 110 });
    // P = (130, 0) falls off W1 after the move. W2 and its joined parallel leg
    // both see P and carry attached runs, but neither may become R1's reference.
    subject.walls[1].connections.end = { wallId: 'leg', endpoint: 'start' };
    subject.walls.push(wall({ id: 'leg', x1: 60, y1: 96, x2: 200, y2: 96,
      connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null },
      runs: [run({ attach: attach('R1') })] }));
    subject.walls[1].runs = [run({ attach: attach('R1') })];
    for (const member of [subject.walls[1], subject.walls[3]]) {
      const projected = roomLineOnFace(subject, member, 'front', 'R1');
      expect(projected.value).toBeGreaterThanOrEqual(0);
      expect(projected.value).toBeLessThanOrEqual(wallFrame(subject, member).length);
    }
    subject.walls.push(wall({ id: 'fallback', x1: 0, y1: 200, x2: 240, y2: 200 }));
    const result = moveWallGroup(subject, 'wall-1', { x: 150, y: 0 });
    expect(result.ok).toBe(true);
    expect(result.room.roomLines[0]).toMatchObject({ wallId: 'fallback', from: 'right', value: 110 });
    subject.walls.pop();
    const refused = moveWallGroup(subject, 'wall-1', { x: 150, y: 0 });
    expect(refused.reason).toBe('room-line-off-walls');
    expect(refused.room).toBe(subject);
  });

  it('holds right ends and re-centres a length edit around the held point', () => {
    const right = cloneRoom(roomI);
    right.walls[1].attach = attach('R1', 'right');
    expect(syncRoom(right, DEFAULT_SETTINGS).walls[1]).toMatchObject({ x1: 250, x2: 130 });
    const longer = syncRoom(roomI, DEFAULT_SETTINGS);
    longer.walls[1].x2 = 50;
    const synced = syncRoom(longer, DEFAULT_SETTINGS);
    expect(synced.walls[1]).toMatchObject({ x1: 200, x2: 60 });
    expect(syncRoom(synced, DEFAULT_SETTINGS)).toEqual(synced);
  });

  it('cleans translated coordinates to 1e-9 and respects the move lock tolerance', () => {
    const subject = cloneRoom(roomI);
    subject.roomLines[0].value = 110.1234567894;
    const placed = placeAttachedWalls(subject);
    expect(placed.walls[1]).toMatchObject({ x1: 189.876543211, x2: 69.876543211 });
    expect(placeAttachedWalls(placed)).toBe(placed);
    expect(moveWallGroup(placed, 'wall-2', { x: 1e-10, y: -6 }).ok).toBe(true);
    expect(moveWallGroup(placed, 'wall-2', { x: 1e-8, y: -6 }).reason).toBe('attached');
  });
});
