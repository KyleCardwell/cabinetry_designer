import { describe, expect, it } from 'vitest';
import { attach, auto, line, opening, room, roomLine, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS, findRoomLine, isRoomLine, nextRoomLineLabel, roomLineFrame } from '../index.js';
import { cloneRoom } from '../roomClone.js';
import { ELEVATION_SCHEMA_VERSION, isRoom } from '../../store/documentValidation.js';
import { roomFromDocument, toRoomDocument } from '../../store/persistence.js';
import { canAttach, findLine, linesOn, nextLineLabel, pruneLines } from '../layoutLines.js';
import { projectRoomLines, pruneRoomLines, roomLineOnFace } from '../roomLines.js';
import { syncRoom } from '../roomSync.js';
import { wallSideView } from '../wallSides.js';

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

describe('LL7 b room line projection', () => {
  it('anchor 1: projects Room R onto both parallel faces and places the sink', () => {
    const synced = syncRoom(roomR, DEFAULT_SETTINGS);
    const [w1, w2, w3] = synced.walls;
    expect(w1._roomLines).toEqual([
      { id: 'R1', label: 'R1', from: 'left', value: 141, roomLine: true, square: true },
      { id: 'R1', label: 'R1', wallSide: 'back', from: 'left', value: 99, roomLine: true, square: true },
    ]);
    expect(w2._roomLines).toEqual([
      { id: 'R1', label: 'R1', from: 'left', value: 39, roomLine: true, square: true },
      { id: 'R1', label: 'R1', wallSide: 'back', from: 'left', value: 81, roomLine: true, square: true },
    ]);
    expect(w3).not.toHaveProperty('_roomLines');
    expect(w2.runs[0]).toMatchObject({ x: 21, attach: attach('R1') });
    expect(findLine(wallSideView(w2, 'front'), 'R1')).toBe(w2._roomLines[0]);
    expect(findLine(wallSideView(w2, 'back'), 'R1')).toBe(w2._roomLines[1]);
    expect(roomLineOnFace(synced, w2, 'back', 'R1')).toEqual(w2._roomLines[1]);
    expect(roomLineOnFace(synced, w3, 'front', 'R1')).toBeNull();
    expect(roomLineOnFace(synced, w2, 'front', 'gone')).toBeNull();
    expect(roomR.walls[1]).not.toHaveProperty('_roomLines');
  });

  it('anchor 2: follows a reference distance of 100', () => {
    const synced = syncRoom({ ...roomR, roomLines: [{ ...roomR.roomLines[0], value: 100 }] }, DEFAULT_SETTINGS);
    expect(synced.walls[1]._roomLines.map((entry) => entry.value)).toEqual([40, 80]);
    expect(synced.walls[1].runs[0].x).toBe(22);
  });

  it('anchor 3: keeps the sink centre at plan x 141 when its wall moves right', () => {
    const moved = cloneRoom(roomR);
    Object.assign(moved.walls[1], { x1: 190, x2: 70 });
    const synced = syncRoom(moved, DEFAULT_SETTINGS);
    expect(synced.walls[1]._roomLines.map((entry) => entry.value)).toEqual([49, 71]);
    expect(synced.walls[1].runs[0].x).toBe(31);
  });

  it('anchor 4: leaves projections and attached runs outside the wall unclamped', () => {
    const synced = syncRoom({ ...roomR, roomLines: [{ ...roomR.roomLines[0], value: 30 }] }, DEFAULT_SETTINGS);
    expect(synced.walls[1]._roomLines.map((entry) => entry.value)).toEqual([-30, 150]);
    expect(synced.walls[1].runs[0].x).toBe(-48);
  });

  it('anchor 5: retains an attached line only on the out-of-square face that uses it', () => {
    const subject = cloneRoom(roomR);
    subject.walls[2].runs = [run({
      id: 'square-run', width: 36, attach: attach('R1', 'left'),
      ends: { left: { type: 'none' }, right: { type: 'none' } },
    })];
    const synced = syncRoom(subject, DEFAULT_SETTINGS);
    expect(synced.walls[2]._roomLines).toEqual([
      { id: 'R1', label: 'R1', from: 'left', value: 0, roomLine: true, square: false },
    ]);
    expect(synced.walls[2].runs[0]).toMatchObject({ x: 0, attach: attach('R1', 'left') });
    expect(linesOn(synced.walls[2], 'back')).toEqual([]);
  });

  it('anchor 6: removes missing references and detaches at the last synced position', () => {
    const synced = syncRoom(roomR, DEFAULT_SETTINGS);
    for (const subject of [
      { ...synced, roomLines: [{ ...synced.roomLines[0], wallId: 'gone' }] },
      { ...synced, walls: synced.walls.slice(1) },
      { ...synced, roomLines: [] },
      (() => { const copy = { ...synced }; delete copy.roomLines; return copy; })(),
    ]) {
      const next = syncRoom(subject, DEFAULT_SETTINGS);
      expect(next).not.toHaveProperty('roomLines');
      expect(next.walls.every((entry) => !Object.hasOwn(entry, '_roomLines'))).toBe(true);
      const sink = next.walls.find((entry) => entry.id === 'wall-2').runs[0];
      expect(sink).not.toHaveProperty('attach');
      expect(sink.x).toBe(21);
    }
  });

  it('anchor 7: prunes attachments to nonexistent room lines', () => {
    const subject = cloneRoom(roomR);
    subject.walls[1].runs[0].attach = attach('R9');
    const synced = syncRoom(subject, DEFAULT_SETTINGS);
    expect(synced.walls[1].runs[0]).not.toHaveProperty('attach');
    expect(synced.walls[1].runs[0].x).toBe(0);
  });

  it('anchor 8: places an opening centre on the room line through unchanged LL3 rules', () => {
    const subject = cloneRoom(roomR);
    subject.walls[1].openings = [opening({ attach: attach('R1') })];
    const synced = syncRoom(subject, DEFAULT_SETTINGS);
    expect(synced.walls[1].openings[0]).toMatchObject({ offset: 21, width: 36, attach: attach('R1') });
  });

  it('anchor 9: is stable on a second sync and leaves rooms without room lines alone', () => {
    const synced = syncRoom(roomR, DEFAULT_SETTINGS);
    expect(syncRoom(synced, DEFAULT_SETTINGS)).toEqual(synced);
    expect(projectRoomLines(synced)).toBe(synced);
    const plain = room({ walls: [wall(), wall({ id: 'wall-2' })] });
    expect(pruneRoomLines(plain)).toBe(plain);
    expect(projectRoomLines(plain)).toBe(plain);
    expect(projectRoomLines(plain).walls[0]).toBe(plain.walls[0]);
    expect(projectRoomLines(plain).walls[1]).toBe(plain.walls[1]);
    const next = syncRoom(plain, DEFAULT_SETTINGS);
    expect(next).not.toHaveProperty('roomLines');
    expect(next.walls.every((entry) => !Object.hasOwn(entry, '_roomLines'))).toBe(true);
    expect(syncRoom(next, DEFAULT_SETTINGS)).toEqual(next);
  });

  it('anchor 10: strips derived projections on save and rebuilds them after load', () => {
    const synced = syncRoom(roomR, DEFAULT_SETTINGS);
    const saved = JSON.parse(JSON.stringify(toRoomDocument(synced)));
    expect(saved.walls.every((entry) => !Object.hasOwn(entry, '_roomLines'))).toBe(true);
    expect(saved.roomLines).toEqual(roomR.roomLines);
    const loaded = roomFromDocument(saved, ELEVATION_SCHEMA_VERSION, DEFAULT_SETTINGS);
    expect(loaded.ok).toBe(true);
    expect(syncRoom(loaded.room, DEFAULT_SETTINGS)).toEqual(synced);
  });

  it('keeps face lines first, excludes room lines from L labels and supports both attachment faces', () => {
    const subject = cloneRoom(roomR);
    subject.roomLines[0].label = 'L1';
    subject.walls[1].lines = [line('local', 12)];
    const synced = syncRoom(subject, DEFAULT_SETTINGS);
    const w2 = synced.walls[1];
    expect(linesOn(w2).map((entry) => entry.id)).toEqual(['local', 'R1']);
    expect(linesOn(wallSideView(w2, 'back')).map((entry) => entry.value)).toEqual([81]);
    expect(nextLineLabel(w2)).toBe('L1');
    for (const side of ['front', 'back']) {
      expect(canAttach(w2, 'run', run({ wallSide: side }), attach('R1'))).toBe(true);
    }
    const collision = { ...w2, lines: [line('R1', 12)] };
    expect(findLine(wallSideView(collision, 'back'), 'R1')).toBe(collision.lines[0]);
  });

  it('prunes runs and root columns against their own projected face', () => {
    const subject = cloneRoom(roomR);
    const back = run({ id: 'back', wallSide: 'back', attach: attach('R1'), items: [auto('column')] });
    back.grid.cols[0].attach = attach('R1');
    subject.walls[1].runs.push(back);
    const projected = projectRoomLines(subject);
    expect(pruneLines(projected.walls[1])).toBe(projected.walls[1]);
    subject.walls[2].runs = [back];
    const skewed = projectRoomLines(subject).walls[2];
    expect(skewed._roomLines).toEqual([
      { id: 'R1', label: 'R1', wallSide: 'back', from: 'left', value: 120, roomLine: true, square: false },
    ]);
    expect(pruneLines(skewed)).toBe(skewed);
    const deleted = projectRoomLines({ ...projected, roomLines: [] });
    const pruned = pruneLines(deleted.walls[1]);
    expect(pruned.runs[1]).not.toHaveProperty('attach');
    expect(pruned.runs[1].grid.cols[0]).not.toHaveProperty('attach');
  });

  it('drops invalid reference faces without removing valid room lines', () => {
    const subject = { ...roomR, roomLines: [roomR.roomLines[0], roomLine('bad', { wallSide: 'top' })] };
    expect(pruneRoomLines(subject).roomLines).toEqual(roomR.roomLines);
    expect(pruneRoomLines(roomR)).toBe(roomR);
  });

  it('uses the parallel tolerance and cleans projected coordinates to 1e-9', () => {
    const subject = room({
      walls: [wall({ x2: 240 }), wall({ id: 'near', x1: 0, y1: 96, x2: 120, y2: 96.00006 }),
        wall({ id: 'skew', x1: 0, y1: 96, x2: 120, y2: 96.00024 })],
      roomLines: [roomLine('R1', { value: 141.0000000001 })],
    });
    const projected = projectRoomLines(subject);
    expect(projected.walls[0]._roomLines[0].value).toBe(141);
    expect(projected.walls[1]._roomLines).toHaveLength(2);
    expect(projected.walls[1]._roomLines.every((entry) => entry.square)).toBe(true);
    expect(projected.walls[2]).not.toHaveProperty('_roomLines');
  });
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
