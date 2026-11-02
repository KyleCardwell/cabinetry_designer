import { cross, planPointToWallX, wallFrame } from './geometry.js';
import { attachmentsTo } from './layoutLines.js';
import { cloneRoom } from './roomClone.js';
import { findRoomLine, roomLineFrame } from './roomLines.js';
import { wallLabel } from './topology.js';
import { WALL_SIDES, wallSideFrame, wallSideView } from './wallSides.js';

/** Connected and landing walls form an undirected group, in stored wall order. */
export function wallGroup(room, wallId) {
  const neighbours = new Map(room.walls.map((wall) => [wall.id, new Set()]));
  if (!neighbours.has(wallId)) return [];
  for (const wall of room.walls) {
    for (const endpoint of ['start', 'end']) {
      for (const link of [wall.connections?.[endpoint], wall.landings?.[endpoint]]) {
        if (!neighbours.has(link?.wallId)) continue;
        neighbours.get(wall.id).add(link.wallId);
        neighbours.get(link.wallId).add(wall.id);
      }
    }
  }
  const group = new Set([wallId]);
  for (const id of group) {
    for (const neighbour of neighbours.get(id)) group.add(neighbour);
  }
  return room.walls.filter((wall) => group.has(wall.id)).map((wall) => wall.id);
}

/** The first attached wall in this group, with its stored attachment and room line. */
export function heldBy(room, wallId) {
  const group = new Set(wallGroup(room, wallId));
  const wall = room.walls.find((candidate) => group.has(candidate.id) && candidate.attach);
  return wall ? { wall, attach: wall.attach, line: findRoomLine(room, wall.attach.lineId) } : null;
}

/** A wall can hold its group on one external room line, without attachment chains. */
export function canAttachWall(room, wallId, lineId) {
  const wall = room.walls.find((candidate) => candidate.id === wallId);
  if (!wall) return { ok: false, reason: 'wall-not-found' };
  const line = findRoomLine(room, lineId);
  const reference = line && roomLineFrame(room, line);
  if (!reference) return { ok: false, reason: 'no-line' };
  const group = new Set(wallGroup(room, wallId));
  if (group.has(line.wallId)) return { ok: false, reason: 'own-group' };
  if (room.walls.some((candidate) => group.has(candidate.id) && candidate.id !== wallId && candidate.attach)) {
    return { ok: false, reason: 'group-held' };
  }
  if (Math.abs(cross(wallFrame(room, wall).r, reference.frame.r)) > 1e-6) {
    return { ok: false, reason: 'not-square' };
  }
  if (heldBy(room, line.wallId) || room.walls.some((candidate) => !group.has(candidate.id)
    && candidate.attach && group.has(findRoomLine(room, candidate.attach.lineId)?.wallId))) {
    return { ok: false, reason: 'chained' };
  }
  return { ok: true, reason: null };
}

export function canMoveWallGroup(room, wallId) {
  const group = wallGroup(room, wallId);
  const reason = !group.length ? 'wall-not-found'
    : group.length === room.walls.length ? 'whole-room' : null;
  return { ok: reason === null, reason };
}

function faceX(frame, point) {
  // Match room-line projection precision, including points exactly on either end.
  return Math.round(planPointToWallX(frame, point) * 1e9) / 1e9;
}

function onWall(x, frame) {
  return x >= 0 && x <= frame.length;
}

/** Translate a group without compensating runs or syncing derived placement. */
export function moveWallGroup(room, wallId, delta) {
  const refuse = (reason, message = '') => ({ ok: false, reason, message, room, notes: [] });
  const eligibility = canMoveWallGroup(room, wallId);
  if (!eligibility.ok) {
    const wall = room.walls.find((candidate) => candidate.id === wallId);
    return refuse(eligibility.reason, eligibility.reason === 'whole-room'
      ? `Every wall is joined to ${wallLabel(room, wall)}, so there's nothing to move it against.` : '');
  }
  if (!Number.isFinite(delta?.x) || !Number.isFinite(delta?.y)) return refuse('invalid-delta');
  if (delta.x === 0 && delta.y === 0) {
    return { ok: true, reason: null, message: '', room, notes: [] };
  }

  const group = new Set(wallGroup(room, wallId));
  const next = cloneRoom(room);
  next.walls = next.walls.map((wall, index) => {
    if (!group.has(wall.id)) return room.walls[index];
    // Only endpoints change. Keep relative data exactly as stored, including absent defaults.
    return {
      ...room.walls[index],
      x1: wall.x1 + delta.x, y1: wall.y1 + delta.y,
      x2: wall.x2 + delta.x, y2: wall.y2 + delta.y,
    };
  });

  const notes = [];
  for (const [index, line] of (room.roomLines ?? []).entries()) {
    next.roomLines[index] = line;
    if (!group.has(line.wallId)) continue;
    const reference = roomLineFrame(room, line);
    const movedReference = roomLineFrame(next, line);
    let { wall, side, frame } = movedReference;
    let x = faceX(frame, reference.point);
    if (!onWall(x, frame)) {
      const faces = next.walls.flatMap((wall) => WALL_SIDES.map((side) => ({
        wall, side, frame: wallSideFrame(next, wall, side),
        attached: attachmentsTo(wallSideView(wall, side), line.id).length > 0,
      })));
      const ordered = [...faces.filter((face) => face.attached), ...faces.filter((face) => !face.attached)];
      const replacement = ordered.find((face) => Math.abs(cross(face.frame.r, reference.frame.r)) <= 1e-6
        && onWall(faceX(face.frame, reference.point), face.frame));
      if (!replacement) {
        return refuse('room-line-off-walls', `${line.label} would end up past the end of every wall it can be measured from: move ${line.label} first.`);
      }
      ({ wall, side, frame } = replacement);
      x = faceX(frame, reference.point);
      notes.push(`${line.label} is now measured from ${wallLabel(next, wall)}.`);
    }
    const updated = { ...line, wallId: wall.id, value: line.from === 'left' ? x : frame.length - x };
    if (side === 'back') updated.wallSide = 'back';
    else delete updated.wallSide;
    next.roomLines[index] = updated;
  }
  return { ok: true, reason: null, message: notes.join(' '), room: next, notes };
}
