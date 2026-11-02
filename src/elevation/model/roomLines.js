import { add, cross, planPointToWallX, scale } from './geometry.js';
import { attachmentsTo, isLayoutLine, lineX } from './layoutLines.js';
import { WALL_SIDES, wallSideFrame, wallSideOf, wallSideView } from './wallSides.js';

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

/** Drop lines whose reference face is gone, removing the room key when the last line goes. */
export function pruneRoomLines(room) {
  if (!room.roomLines) return room;
  const wallIds = new Set(room.walls.map((wall) => wall.id));
  const roomLines = room.roomLines.filter((line) => wallIds.has(line.wallId)
    && WALL_SIDES.includes(line.wallSide ?? 'front'));
  if (roomLines.length && roomLines.length === room.roomLines.length) return room;
  const next = { ...room };
  if (roomLines.length) next.roomLines = roomLines;
  else delete next.roomLines;
  return next;
}

/** A room line's nearest point on a face; nonparallel faces see only their attached lines. */
export function roomLineOnFace(room, wall, side, roomLineId) {
  const line = findRoomLine(room, roomLineId);
  const reference = line && roomLineFrame(room, line);
  if (!reference || !WALL_SIDES.includes(side)) return null;
  const frame = wallSideFrame(room, wall, side);
  const square = Math.abs(cross(frame.r, reference.frame.r)) <= 1e-6;
  if (!square && !attachmentsTo(wallSideView(wall, side), roomLineId).length) return null;
  const value = Math.round(planPointToWallX(frame, reference.point) * 1e9) / 1e9;
  return {
    id: line.id, label: line.label,
    ...(side === 'back' ? { wallSide: 'back' } : {}),
    from: 'left', value: value === 0 ? 0 : value, roomLine: true, square,
  };
}

/** Rebuild derived face projections without adding empty keys or changing unaffected walls. */
export function projectRoomLines(room) {
  let changed = false;
  const walls = room.walls.map((wall) => {
    const projected = (room.roomLines ?? []).flatMap((line) => WALL_SIDES
      .map((side) => roomLineOnFace(room, wall, side, line.id)).filter(Boolean));
    if (!projected.length && !Object.hasOwn(wall, '_roomLines')) return wall;
    if (projected.length && JSON.stringify(projected) === JSON.stringify(wall._roomLines)) return wall;
    changed = true;
    const next = { ...wall };
    if (projected.length) next._roomLines = projected;
    else delete next._roomLines;
    return next;
  });
  return changed ? { ...room, walls } : room;
}
