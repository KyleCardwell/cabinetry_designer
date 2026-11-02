import { cross, dot, planPointToWallX, subtract, wallFrame } from './geometry.js';
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

/** Resolve a held wall's line even when its reference face is no longer square. */
export function wallAttachmentStatus(room, wallId) {
  const wall = room.walls.find((candidate) => candidate.id === wallId);
  const line = wall?.attach && findRoomLine(room, wall.attach.lineId);
  const reference = line && roomLineFrame(room, line);
  return reference ? {
    line,
    square: Math.abs(cross(wallFrame(room, wall).r, reference.frame.r)) <= 1e-6,
  } : null;
}

/** Keep the first attachment per group, then drop attachments participating in chains. */
export function pruneWallAttachments(room) {
  if (!room.walls.some((wall) => wall.attach)) return room;
  const heldGroups = new Set();
  const walls = room.walls.map((wall) => {
    if (!wall.attach) return wall;
    const line = findRoomLine(room, wall.attach.lineId);
    const group = wallGroup(room, wall.id);
    if (line && roomLineFrame(room, line) && !group.includes(line.wallId) && !heldGroups.has(wall.id)) {
      for (const id of group) heldGroups.add(id);
      return wall;
    }
    const { attach, ...rest } = wall;
    void attach;
    return rest;
  });
  const candidates = { ...room, walls };
  const pruned = walls.map((wall) => {
    if (!wall.attach) return wall;
    const group = new Set(wallGroup(candidates, wall.id));
    const line = findRoomLine(candidates, wall.attach.lineId);
    const chained = heldBy(candidates, line.wallId) || walls.some((other) => !group.has(other.id)
      && other.attach && group.has(findRoomLine(candidates, other.attach.lineId)?.wallId));
    if (!chained) return wall;
    const { attach, ...rest } = wall;
    void attach;
    return rest;
  });
  return pruned.some((wall, index) => wall !== room.walls[index]) ? { ...room, walls: pruned } : room;
}

/** Rewrite group endpoints before projecting room lines; all wall-relative data rides along. */
export function placeAttachedWalls(room) {
  let next = room;
  for (const source of room.walls) {
    if (!source.attach || !wallAttachmentStatus(next, source.id)?.square) continue;
    const wall = next.walls.find((candidate) => candidate.id === source.id);
    const reference = roomLineFrame(next, findRoomLine(next, wall.attach.lineId));
    const frame = wallFrame(next, wall);
    const atX = ({ left: 0, center: 0.5, right: 1 })[wall.attach.at] * frame.length;
    const shift = dot(subtract(reference.point, frame.leftPoint), frame.r) + wall.attach.offset - atX;
    if (Math.abs(shift) <= 1e-9) continue;
    const group = new Set(wallGroup(next, wall.id));
    next = { ...next, walls: next.walls.map((member) => group.has(member.id) ? {
      ...member,
      x1: cleanCoordinate(member.x1 + frame.r.x * shift),
      y1: cleanCoordinate(member.y1 + frame.r.y * shift),
      x2: cleanCoordinate(member.x2 + frame.r.x * shift),
      y2: cleanCoordinate(member.y2 + frame.r.y * shift),
    } : member) };
  }
  return next;
}

function cleanCoordinate(value) {
  const rounded = Math.round(value * 1e9) / 1e9;
  return rounded === 0 ? 0 : rounded;
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
  const held = heldBy(room, wallId);
  if (held && Math.abs(dot(delta, wallFrame(room, held.wall).r)) > 1e-9) {
    return refuse('attached', `${wallLabel(room, held.wall)} is attached to line ${held.line?.label ?? held.attach.lineId}: move the line, or detach.`);
  }
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
      const heldGroups = new Set(next.walls.filter((wall) => wall.attach?.lineId === line.id)
        .flatMap((wall) => wallGroup(next, wall.id)));
      const faces = next.walls.filter((wall) => !heldGroups.has(wall.id)).flatMap((wall) => WALL_SIDES.map((side) => ({
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
