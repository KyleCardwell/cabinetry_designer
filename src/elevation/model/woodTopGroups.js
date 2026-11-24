import { buildCacheFor } from './buildCache.js';
import { bandParts } from './bandParts.js';
import { bandPaths } from './bandPaths.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { elevationToPlan, lineIntersection, planPointToWallX, wallLength } from './geometry.js';
import { compareRuns } from './parts.js';
import { resolveProfile } from './profile.js';
import { isOpenWallEnd, waterfallEnds } from './runBands.js';
import { runTop } from './tops.js';
import { wallNumbers } from './topology.js';
import { WALL_SIDES, wallSideFrame, wallSideView } from './wallSides.js';

const EPSILON = 1e-6;
const same = (a, b) => Math.abs(a - b) <= EPSILON;

const SIDES = ['left', 'right'];
const pathEndKey = (member, path, end) => `${member.memberKey ?? member.runId}|countertop|${path.z}|${end}`;

function topEntries(room, source, side, settings, members, pathEnds) {
  const wall = { ...wallSideView(source, side), length: wallLength(source) };
  const profile = resolveProfile(settings, room, wall);
  const bands = bandParts(room, source, side, settings).filter(({ kind }) => kind === 'countertop');
  return [...wall.runs].sort(compareRuns).flatMap((run) => {
    const top = runTop(wall, run, profile);
    const segments = new Map((run.topSegments ?? []).map((segment) => [`${run.id}:top-${segment.id}`, segment]));
    const woodBands = bands.filter((band) => band.runId === run.id
      && (segments.get(band.id)?.kind ?? top.kind) === 'wood');
    if (!woodBands.length) return [];
    const waterfall = waterfallEnds(room, wall, run, settings);
    return woodBands.map((band) => {
      const segment = segments.get(band.id);
      const match = members.get(`${source.id}|${side}|${run.id}`);
      const { path, member } = match && same(band.z + band.height, match.path.z + match.path.height)
        ? match : {};
      const start = side === 'back' ? wall.length - band.x - band.width : band.x;
      const scribe = ['left', 'right'].map((endSide, index) => {
        const reachesEnd = index === 0 ? same(band.x, run.x)
          : same(band.x + band.width, run.x + run.width);
        const anchor = run.anchors?.[endSide];
        // A wall-end anchor can be pushed inward to a taller return's face (Room 9).
        const atWallEnd = index === 0 ? same(run.x, 0) : same(run.x + run.width, wall.length);
        const endType = member && pathEnds.get(pathEndKey(member, path, endSide))?.type;
        // Only die-in and square path rules map to square countertop ends.
        return reachesEnd && ['die-in', 'square'].includes(endType)
          && ((anchor === true && atWallEnd && !isOpenWallEnd(room, wall, run, endSide, settings))
            || anchor?.to === 'wall'
            || (anchor?.to === 'recess' && run._plane?.recessId === anchor.recessId));
      });
      return { run, wall, band, path, member, segment: Boolean(segment),
        key: `wood_top:${segment ? band.id : run.id}`,
        start, end: start + band.width, surface: band.z + band.height,
        leftScribe: scribe[side === 'back' ? 1 : 0], rightScribe: scribe[side === 'back' ? 0 : 1],
        leftMiter: false, rightMiter: false,
        // A waterfall's drawn band includes its floor legs; they are notes, not top thickness.
        thickness: !segment && (waterfall.left || waterfall.right) ? top.height : band.height };
    });
  });
}

function wallEntries(room, settings, members, ends) {
  const byId = new Map((room?.walls ?? []).map((wall) => [wall.id, wall]));
  return [...wallNumbers(room)].sort((a, b) => a[1] - b[1]).map(([id]) => {
    const source = byId.get(id);
    return WALL_SIDES.flatMap((side) => topEntries(room, source, side, settings, members, ends));
  });
}

function bandRef(entry) {
  return { wallId: entry.wall.id, side: entry.wall.side, bandId: entry.band.id };
}

function groupSize(entries, key, settings) {
  const first = entries[0];
  const start = Math.min(...entries.map((entry) => entry.start));
  const end = Math.max(...entries.map((entry) => entry.end));
  const faces = WALL_SIDES.flatMap((side) => {
    const onFace = entries.filter((entry) => entry.wall.side === side);
    return onFace.length ? [{ wallId: first.wall.id, side,
      runIds: [...new Set(onFace.map(({ run }) => run.id))],
      x1: Math.min(...onFace.map((entry) => entry.start)),
      x2: Math.max(...onFace.map((entry) => entry.end)) }] : [];
  });
  const fronts = faces.map(({ side }) => Math.max(...entries
    .filter((entry) => entry.wall.side === side).map(({ band }) => band.front)));
  const depth = faces.length === 2 ? fronts[0] + fronts[1] + (first.wall.thickness ?? 0)
    : fronts[0] - Math.min(...entries.map(({ band }) => band.back));
  const scribe = {
    left: entries.some((entry) => same(entry.start, start) && entry.leftScribe),
    right: entries.some((entry) => same(entry.end, end) && entry.rightScribe),
    back: faces.length === 1 && first.wall.thickness > 0 && entries.every(({ band }) => band.back >= 0),
  };
  const allowance = settings.woodTopScribe ?? DEFAULT_SETTINGS.woodTopScribe;
  return { key, runIds: [...new Set(entries.map(({ run }) => run.id))], faces,
    bandRefs: entries.map(bandRef),
    width: end - start, depth, thickness: first.thickness, start, end,
    orderedWidth: end - start + allowance * (Number(scribe.left) + Number(scribe.right)),
    orderedDepth: depth + allowance * Number(scribe.back), scribe,
    miters: {
      left: entries.some((entry) => same(entry.start, start) && entry.leftMiter),
      right: entries.some((entry) => same(entry.end, end) && entry.rightMiter),
    },
    wallId: first.wall.id, segment: first.segment };
}

/** One wood top per connected group in wall/face/run walk order, in front-face coordinates.
 * Inserts always stand alone; inside corners never connect across walls.
 */
export function woodTopGroups(room, settings = DEFAULT_SETTINGS) {
  const cache = buildCacheFor(room);
  if (!cache) return buildWoodTopGroups(room, settings);
  return cache.byRoom('woodTopGroups', room, settings,
    () => buildWoodTopGroups(room, settings));
}

function groupsFromEntries(walls, settings, links) {
  const counts = new Map();
  return walls.flatMap((entries) => {
    const remaining = new Set(entries);
    const groups = [];
    for (const first of entries) {
      if (!remaining.delete(first)) continue;
      const connected = [first];
      for (let i = 0; i < connected.length; i += 1) {
        for (const candidate of remaining) {
          if (!links(connected[i], candidate)) continue;
          remaining.delete(candidate);
          connected.push(candidate);
        }
      }
      const members = new Set(connected);
      const count = (counts.get(first.key) ?? 0) + 1;
      counts.set(first.key, count);
      groups.push(groupSize(entries.filter((entry) => members.has(entry)),
        `${first.key}${count > 1 ? `:${count}` : ''}`, settings));
    }
    return groups;
  });
}

function buildWoodTopGroups(room, settings) {
  const { paths, ends } = bandPaths(room, settings);
  const tops = paths.filter(({ kind }) => kind === 'countertop');
  const members = new Map();
  for (const path of tops) for (const member of path.segments) {
    if (!member.corner && !member.return) {
      members.set(`${member.wallId}|${member.face}|${member.runId}`, { path, member });
    }
  }
  const walls = wallEntries(room, settings, members, ends);
  const byMember = new Map();
  const frames = new Map();
  const order = new Map();
  walls.flat().forEach((entry, index) => {
    order.set(entry, index);
    if (!entry.member) return;
    if (!byMember.has(entry.member)) byMember.set(entry.member, []);
    byMember.get(entry.member).push(entry);
    frames.set(entry.member, wallSideFrame(room, entry.wall.sideSource ?? entry.wall, entry.wall.side));
  });
  const endEntry = (member, end) => (byMember.get(member) ?? []).reduce((best, entry) => {
    if (!best) return entry;
    return (end === 'left' ? entry.band.x < best.band.x
      : entry.band.x + entry.band.width > best.band.x + best.band.width) ? entry : best;
  }, null);
  const endAt = (member, path, vertex) => SIDES.find((end) => {
    const rule = ends.get(pathEndKey(member, path, end));
    return rule?.type === vertex.type && rule.at
      && same(rule.at.x, vertex.at.x) && same(rule.at.y, vertex.at.y);
  });
  const extend = (entry, end, point, miter) => {
    const back = entry.wall.side === 'back';
    const reach = planPointToWallX(frames.get(entry.member), point);
    const side = (end === 'left') !== back ? 'left' : 'right';
    entry[side === 'left' ? 'start' : 'end'] = back ? entry.wall.length - reach : reach;
    entry[`${side}Scribe`] = false;
    entry[`${side}Miter`] = miter;
  };
  const joins = new Map();
  const join = (a, b) => {
    if (!joins.has(a)) joins.set(a, new Set());
    joins.get(a).add(b);
  };
  for (const path of tops) path.vertices.forEach((vertex, index) => {
    const a = path.segments[index];
    const b = path.segments[(index + 1) % path.segments.length];
    if (vertex.type === 'joined') {
      join(a, b);
      join(b, a);
    }
    if (vertex.type !== 'mitre') return;
    const aEnd = endAt(a, path, vertex);
    const bEnd = endAt(b, path, vertex);
    const x = endEntry(a, aEnd);
    const y = endEntry(b, bEnd);
    if (!x || !y || !aEnd || !bEnd) return;
    const af = frames.get(a);
    const bf = frames.get(b);
    const longPoint = lineIntersection(elevationToPlan(af, 0, x.band.back), af.r,
      elevationToPlan(bf, 0, y.band.back), bf.r);
    if (!longPoint) return;
    const butt = vertex.mode === 'butt' && Math.abs(Math.abs(vertex.turn) - 90) <= 0.01;
    if (butt) {
      if (order.get(x) < order.get(y)) extend(y, bEnd, longPoint, false);
      else extend(x, aEnd, longPoint, false);
    } else {
      extend(x, aEnd, longPoint, true);
      extend(y, bEnd, longPoint, true);
    }
  });
  const against = (a, b) => a.member && SIDES.some((end) => {
    const rule = ends.get(pathEndKey(a.member, a.path, end));
    return ['cope', 'step'].includes(rule?.type)
      && rule.against?.kind === 'run' && rule.against.id === b.run.id;
  });
  const links = (a, b) => {
    if (a.segment || b.segment || !same(a.surface, b.surface)) return false;
    if (a.wall.side !== b.wall.side) {
      return Math.min(a.end, b.end) > Math.max(a.start, b.start);
    }
    return Boolean(joins.get(a.member)?.has(b.member)) || against(a, b) || against(b, a);
  };
  return groupsFromEntries(walls, settings, links);
}
