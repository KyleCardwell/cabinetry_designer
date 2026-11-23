import { bandParts } from './bandParts.js';
import { bandPaths } from './bandPaths.js';
import { cornerLegBandParts } from './bandSweep.js';
import { buildCacheFor } from './buildCache.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { planPointToWallX, wallLength } from './geometry.js';
import { compareRuns } from './parts.js';
import { ccw, clipToSide, lineIntersection, signedArea, toPlan } from './planPolygons.js';
import { wallNumbers } from './topology.js';
import { WALL_SIDES, wallSideFrame, wallSideView } from './wallSides.js';
import { woodTopGroups } from './woodTopGroups.js';

const EPSILON = 1e-6;
const SIDES = ['left', 'right'];
const same = (a, b) => Math.abs(a - b) <= EPSILON;
const refKey = (wallId, side, bandId) => `${wallId}|${side}|${bandId}`;
const planPoint = ({ x, y }) => [x, -y];
const wallX = (frame, [x, y]) => planPointToWallX(frame, { x, y: -y });
const line = (piece, v) => toPlan(piece.frame, [[piece.u0, v], [piece.u1, v]]);
const farEnd = (piece, end) => toPlan(piece.frame,
  [[end === 'left' ? piece.u1 : piece.u0, (piece.v0 + piece.v1) / 2]])[0];
const extend = (piece, end, at) => { piece[end === 'left' ? 'u0' : 'u1'] = wallX(piece.frame, at); };
const rectangle = ({ frame, u0, u1, v0, v1 }) => ccw(toPlan(frame,
  [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]));
const ruleKey = (member, z, end) => `${member.memberKey ?? member.runId}|countertop|${z}|${end}`;

/** One polygon per countertop piece, in the plan drawing's piece order (y up). */
export function bandFootprints(room, settings = DEFAULT_SETTINGS) {
  const cache = buildCacheFor(room);
  const build = () => buildFootprints(room, settings);
  return cache ? cache.byRoom('bandFootprints', room, settings, build) : build();
}

function buildFootprints(room, settings) {
  const { paths, ends } = bandPaths(room, settings);
  const tops = paths.filter(({ kind }) => kind === 'countertop');
  const parts = new Map(woodTopGroups(room, settings).flatMap(({ key, bandRefs = [] }) =>
    bandRefs.map(({ wallId, side, bandId }) => [refKey(wallId, side, bandId), key])));
  const pieces = [];
  const members = new Map();
  for (const path of tops) for (const member of path.segments) {
    if (!member.corner && !member.return) members.set(`${member.wallId}|${member.face}|${member.runId}`, { path, member });
  }
  const byMember = new Map();
  for (const wall of room?.walls ?? []) for (const side of WALL_SIDES) {
    const frame = wallSideFrame(room, wall, side);
    for (const band of bandParts(room, wall, side, settings).filter(({ kind }) => kind === 'countertop')) {
      const ref = refKey(wall.id, side, band.id);
      const piece = { ref, wallId: wall.id, side, band, frame,
        u0: band.x, u1: band.x + band.width, v0: band.back, v1: band.front,
        surface: band.z + band.height, part: parts.get(ref) ?? 'stone' };
      pieces.push(piece);
      const match = members.get(`${wall.id}|${side}|${band.runId}`);
      if (match && same(piece.surface, match.path.z + match.path.height)) {
        if (!byMember.has(match.member)) byMember.set(match.member, []);
        byMember.get(match.member).push(piece);
      }
    }
  }
  // Only the outermost piece on a split run can reach a path end.
  const endPiece = (member, end) => (byMember.get(member) ?? []).reduce((best, piece) => {
    if (!best) return piece;
    return (end === 'left' ? piece.u0 < best.u0 : piece.u1 > best.u1) ? piece : best;
  }, null);
  const endAt = (member, path, vertex) => SIDES.find((end) => {
    const rule = ends.get(ruleKey(member, path.z, end));
    return rule?.type === vertex.type && rule.at
      && same(rule.at.x, vertex.at.x) && same(rule.at.y, vertex.at.y);
  });
  const numbers = wallNumbers(room);
  const runOrder = new Map();
  for (const wall of room?.walls ?? []) for (const side of WALL_SIDES) {
    [...wallSideView(wall, side).runs].sort(compareRuns).forEach((run, i) => {
      runOrder.set(`${wall.id}|${side}|${run.id}`, i);
    });
  }
  const walkOrder = (a, b) => numbers.get(a.wallId) - numbers.get(b.wallId)
    || WALL_SIDES.indexOf(a.face) - WALL_SIDES.indexOf(b.face)
    || runOrder.get(`${a.wallId}|${a.face}|${a.runId}`) - runOrder.get(`${b.wallId}|${b.face}|${b.runId}`);
  const cuts = [];
  for (const path of tops) path.vertices.forEach((vertex, i) => {
    if (vertex.type !== 'mitre') return;
    const a = path.segments[i];
    const b = path.segments[(i + 1) % path.segments.length];
    const aEnd = endAt(a, path, vertex);
    const bEnd = endAt(b, path, vertex);
    const x = endPiece(a, aEnd);
    const y = endPiece(b, bEnd);
    if (!x || !y || !aEnd || !bEnd) return;
    const back = lineIntersection(line(x, x.v0), line(y, y.v0));
    const front = lineIntersection(line(x, x.v1), line(y, y.v1));
    if (!back || !front || (same(back[0], front[0]) && same(back[1], front[1]))) return;
    if (vertex.mode === 'butt' && Math.abs(Math.abs(vertex.turn) - 90) <= 0.01) {
      const [first, second, secondEnd] = walkOrder(a, b) <= 0
        ? [x, y, bEnd] : [y, x, aEnd];
      extend(second, secondEnd, back);
      cuts.push([second, secondEnd, ...line(first, first.v0)]);
    } else {
      extend(x, aEnd, back);
      extend(y, bEnd, back);
      cuts.push([x, aEnd, back, front], [y, bEnd, back, front]);
    }
  });
  // Unequal-front stone copes keep their overlap, with the reach read from the target's back line.
  for (const { path, member } of members.values()) for (const end of SIDES) {
    const rule = ends.get(ruleKey(member, path.z, end));
    const piece = endPiece(member, end);
    if (rule?.type !== 'cope' || rule.against?.kind !== 'run' || piece?.part !== 'stone') continue;
    const other = pieces.find((candidate) => candidate.band.runId === rule.against.id
      && candidate.wallId !== piece.wallId && same(candidate.surface, piece.surface));
    if (!other) continue;
    const back = lineIntersection(line(piece, piece.v0), line(other, other.v0));
    const front = lineIntersection(line(piece, piece.v0), line(other, other.v1));
    if (!back || !front) continue;
    const at = end === 'left' ? piece.u0 : piece.u1;
    const xs = [wallX(piece.frame, back), wallX(piece.frame, front)];
    if (at >= Math.min(...xs) - EPSILON && at <= Math.max(...xs) + EPSILON) extend(piece, end, back);
  }
  // Bridges use the extended spans, just as the existing plan pieces do.
  const ordered = [];
  for (const wall of room?.walls ?? []) {
    const onWall = pieces.filter(({ wallId }) => wallId === wall.id);
    ordered.push(...onWall);
    const length = wallLength(wall);
    for (const top of onWall.filter(({ side }) => side === 'front')) {
      for (const back of onWall.filter(({ side }) => side === 'back')) {
        const u0 = Math.max(top.u0, length - back.u1);
        const u1 = Math.min(top.u1, length - back.u0);
        if (u1 - u0 > EPSILON && same(top.surface, back.surface)) {
          ordered.push({ ref: `${top.ref}|bridge|${back.band.id}`, wallId: wall.id, side: 'front', frame: top.frame,
            u0, u1, v0: -(wall.thickness ?? 0) - back.band.back, v1: top.band.back,
            surface: top.surface, part: top.part, bridge: true });
        }
      }
    }
  }
  for (const piece of ordered) piece.polygon = rectangle(piece);
  for (const [piece, end, a, b] of cuts) piece.polygon = clipToSide(piece.polygon, a, b, farEnd(piece, end));
  ordered.push(...cornerPieces(room, settings, tops, pieces));
  return ordered.filter(({ polygon }) => polygon.length >= 3 && Math.abs(signedArea(polygon)) > EPSILON);
}

/** Corner leg rectangles and 45 fills inherit the owner's surface and part. */
function cornerPieces(room, settings, paths, pieces) {
  const result = [];
  for (const wall of room?.walls ?? []) for (const side of WALL_SIDES) {
    const ownerFrame = wallSideFrame(room, wall, side);
    for (const run of wallSideView(wall, side).runs) for (const end of SIDES) {
      const matches = (tag) => tag?.ownerWallId === wall.id && tag.runId === run.id && tag.side === end;
      const path = paths.find((path) => path.vertices.some(({ type, corner }) => type === 'turn' && matches(corner)));
      if (!path) continue;
      const legMember = path.segments.find(({ corner }) => matches(corner) && corner.leg === 'b');
      const diagonal = path.segments.find((member) => member.diagonal && matches(member.corner));
      let returned = legMember;
      if (!returned && diagonal) {
        const index = path.segments.indexOf(diagonal);
        returned = [path.segments[index - 1], path.segments[(index + 1) % path.segments.length]]
          .find((member) => member && member.wallId !== wall.id);
      }
      if (!returned) continue;
      const frame = wallSideFrame(room, room.walls.find(({ id }) => id === returned.wallId), returned.face);
      const faceLine = (frame) => toPlan(frame, [[0, 0], [frame.length, 0]]);
      const corner = lineIntersection(faceLine(ownerFrame), faceLine(frame));
      if (!corner) continue;
      const leg = cornerLegBandParts(room, wall.id, run, end, settings).find(({ kind }) => kind === 'countertop');
      if (!leg) continue;
      const ownerX = wallX(ownerFrame, corner) + (end === 'left' ? 1 : -1) * leg.front;
      const owner = pieces.find((piece) => piece.wallId === wall.id && piece.side === side
        && piece.band.runId === run.id && same(piece.surface, leg.z + leg.height)
        && same(end === 'left' ? piece.band.x : piece.band.x + piece.band.width, ownerX));
      if (!owner) continue;
      const add = (polygon) => result.push({ surface: owner.surface, part: owner.part, polygon: ccw(polygon) });
      const start = wallX(frame, corner);
      const far = Math.abs(start - leg.x) < Math.abs(start - leg.x - leg.width) ? leg.x + leg.width : leg.x;
      add(toPlan(frame, [[start, leg.back], [far, leg.back], [far, leg.front], [start, leg.front]]));
      if (diagonal) {
        // The diagonal's own endpoints identify A/B even when the path walks it backwards.
        const turns = path.vertices.filter(({ type, corner }) => type === 'turn' && matches(corner));
        const a = turns.find(({ at }) => same(at.x, diagonal.from.x) && same(at.y, diagonal.from.y))?.at;
        const b = turns.find(({ at }) => same(at.x, diagonal.to.x) && same(at.y, diagonal.to.y))?.at;
        if (!a || !b) continue;
        const project = (frame, at) => toPlan(frame, [[planPointToWallX(frame, at), 0]])[0];
        add([corner, project(ownerFrame, a), planPoint(a), planPoint(b), project(frame, b)]);
      }
    }
  }
  return result;
}
