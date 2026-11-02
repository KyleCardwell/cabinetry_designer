import { add, scale } from './geometry.js';
import { isLayoutLine, lineX } from './layoutLines.js';
import { wallSideFrame, wallSideOf } from './wallSides.js';

/** A stored room line: a face line plus its reference wall, with no extra keys. */
export function isRoomLine(line) {
  if (!line || typeof line !== 'object' || Array.isArray(line)) return false;
  const { wallId, ...faceLine } = line;
  return typeof wallId === 'string' && wallId.length > 0
    && isLayoutLine(faceLine)
    && line.label === line.label.trim()
    && (line.wallSide === undefined || line.wallSide === 'back');
}

export function findRoomLine(room, id) {
  return room?.roomLines?.find((line) => line.id === id) ?? null;
}

/** The lowest unused R<n> label across the room. */
export function nextRoomLineLabel(room) {
  const used = new Set((room.roomLines ?? []).map((line) => line.label));
  let n = 1;
  while (used.has(`R${n}`)) n += 1;
  return `R${n}`;
}

/** Resolve the reference face and the line's plan point without projecting onto other walls. */
export function roomLineFrame(room, roomLine) {
  const wall = room.walls.find((candidate) => candidate.id === roomLine.wallId);
  if (!wall) return null;
  const side = wallSideOf(roomLine);
  const frame = wallSideFrame(room, wall, side);
  const x = lineX(roomLine, frame.length);
  return { wall, side, frame, x, point: add(frame.leftPoint, scale(frame.r, x)) };
}
