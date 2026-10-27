import { bandParts } from './bandParts.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { wallLength } from './geometry.js';
import { compareRuns } from './parts.js';
import { resolveProfile } from './profile.js';
import { waterfallEnds } from './runBands.js';
import { runTop } from './tops.js';
import { wallNumbers } from './topology.js';
import { WALL_SIDES, wallSideView } from './wallSides.js';

const EPSILON = 1e-6;
const TOUCH = 1 / 64;

function topEntries(room, source, side, settings) {
  const wall = { ...wallSideView(source, side), length: wallLength(source) };
  const profile = resolveProfile(settings, room, wall);
  const bands = bandParts(room, source, side, settings).filter(({ kind }) => kind === 'countertop');
  return [...wall.runs].sort(compareRuns).flatMap((run) => {
    const top = runTop(wall, run, profile);
    const segments = new Map((run.topSegments ?? []).map((segment) => [`${run.id}:top-${segment.id}`, segment]));
    const waterfall = waterfallEnds(room, wall, run, settings);
    return bands.filter(({ runId }) => runId === run.id).flatMap((band) => {
      const segment = segments.get(band.id);
      if ((segment?.kind ?? top.kind) !== 'wood') return [];
      const start = side === 'back' ? wall.length - band.x - band.width : band.x;
      return [{ run, wall, band, segment: Boolean(segment),
        key: `wood_top:${segment ? band.id : run.id}`,
        start, end: start + band.width, surface: band.z + band.height,
        // A waterfall's drawn band includes its floor legs; they are notes, not top thickness.
        thickness: !segment && (waterfall.left || waterfall.right) ? top.height : band.height }];
    });
  });
}

function linked(a, b) {
  if (a.segment || b.segment || Math.abs(a.surface - b.surface) > EPSILON) return false;
  if (a.wall.side === b.wall.side) {
    return Math.abs(a.end - b.start) <= TOUCH || Math.abs(b.end - a.start) <= TOUCH;
  }
  return Math.min(a.end, b.end) > Math.max(a.start, b.start);
}

function groupSize(entries, key) {
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
  return { key, runIds: [...new Set(entries.map(({ run }) => run.id))], faces,
    width: end - start, depth, thickness: first.thickness, start, end,
    wallId: first.wall.id, segment: first.segment };
}

/** One wood top per connected group in wall/face/run walk order, in front-face coordinates.
 * Inserts always stand alone; inside corners never connect across walls.
 */
export function woodTopGroups(room, settings = DEFAULT_SETTINGS) {
  const byId = new Map((room?.walls ?? []).map((wall) => [wall.id, wall]));
  const walls = [...wallNumbers(room)].sort((a, b) => a[1] - b[1]).map(([id]) => byId.get(id));
  const counts = new Map();
  return walls.flatMap((source) => {
    const entries = WALL_SIDES.flatMap((side) => topEntries(room, source, side, settings));
    const remaining = new Set(entries);
    const groups = [];
    for (const first of entries) {
      if (!remaining.delete(first)) continue;
      const connected = [first];
      for (let i = 0; i < connected.length; i += 1) {
        for (const candidate of remaining) {
          if (!linked(connected[i], candidate)) continue;
          remaining.delete(candidate);
          connected.push(candidate);
        }
      }
      const members = new Set(connected);
      const count = (counts.get(first.key) ?? 0) + 1;
      counts.set(first.key, count);
      groups.push(groupSize(entries.filter((entry) => members.has(entry)),
        `${first.key}${count > 1 ? `:${count}` : ''}`));
    }
    return groups;
  });
}
