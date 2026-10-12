import { endEdgeX, frontContour } from './bandEnds.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { frontDepth } from './corners.js';
import { runBase } from './furnitureBase.js';
import { wallLength } from './geometry.js';
import { compareRuns } from './parts.js';
import { runBaseSegments } from './runBands.js';
import { runScene } from './runScene.js';
import { wallNumbers } from './topology.js';
import { WALL_SIDES, wallEndPanelAt, wallSideView } from './wallSides.js';

const EPSILON = 1e-6;
const same = (a, b) => Math.abs(a - b) <= EPSILON;

function baseEntries(room, wall, run, settings) {
  const scene = runScene(room, wall, run, settings);
  const base = runBase(room, wall, run, settings, scene);
  if (base.kind !== 'furniture_base') return [];
  const segments = runBaseSegments(room, wall, run, settings, scene, 'furnitureBase', base);
  return segments.map(({ start, end: segmentEnd, ends, band }, index) => {
    const bandEnds = ends.map((end, index) => {
      const side = index === 0 ? 'left' : 'right';
      let x = index === 0 ? band.x : band.x + band.width;
      if (end.type === 'cope' && end.outline) {
        x = endEdgeX(frontContour(end.outline, index === 0 ? 1 : -1), 0, index === 0 ? 1 : -1);
      }
      // Ordered bases cover the wall end panel as well as the return beyond it.
      const reachesEnd = index === 0 ? same(start, run.x) : same(segmentEnd, run.x + run.width);
      const panel = reachesEnd && run.anchors?.[side] === true && wallEndPanelAt(room, wall, side, settings);
      if (panel) x += (index === 0 ? -1 : 1) * panel.width;
      const anchor = run.anchors?.[side];
      const squareStop = reachesEnd && end.type === 'square' && (Boolean(scene.panelBySide[side])
        || anchor === true || anchor?.to === 'wall'
        || (anchor?.to === 'recess' && run._plane?.recessId === anchor.recessId));
      return { x, scribe: squareStop };
    });
    const mapX = (x) => wall.side === 'back' ? wall.length - x : x;
    const [left, right] = wall.side === 'back' ? bandEnds.toReversed() : bandEnds;
    return { run, wall, key: `furniture_base:${run.id}${index ? `:${index + 1}` : ''}`,
      height: base.height, depth: frontDepth(run, settings) + base.proud,
      start: mapX(left.x), end: mapX(right.x), leftScribe: left.scribe, rightScribe: right.scribe,
      runStart: mapX(wall.side === 'back' ? segmentEnd : start),
      runEnd: mapX(wall.side === 'back' ? start : segmentEnd) };
  });
}

function linked(a, b) {
  if (!same(a.height, b.height)) return false;
  if (a.wall.side === b.wall.side) {
    return same(a.runEnd, b.runStart) || same(b.runEnd, a.runStart);
  }
  return Math.min(a.runEnd, b.runEnd) > Math.max(a.runStart, b.runStart);
}

function groupSize(entries, settings) {
  const first = entries[0];
  const start = Math.min(...entries.map((entry) => entry.start));
  const end = Math.max(...entries.map((entry) => entry.end));
  const scribe = settings.furnitureBaseScribe ?? DEFAULT_SETTINGS.furnitureBaseScribe;
  const faces = WALL_SIDES.flatMap((side) => {
    const onFace = entries.filter((entry) => entry.wall.side === side);
    return onFace.length ? [{ wallId: first.wall.id, side, runIds: [...new Set(onFace.map(({ run }) => run.id))] }] : [];
  });
  // Constant-depth spans in front-face coordinates. Internal transitions stay at the run seam;
  // only exposed ends include the band's returns or corner cope.
  const steps = faces.flatMap(({ wallId, side }) => {
    const onFace = entries.filter((entry) => entry.wall.side === side)
      .sort((a, b) => a.runStart - b.runStart);
    const spans = [];
    onFace.forEach((entry, index) => {
      const previous = onFace[index - 1];
      const next = onFace[index + 1];
      const x1 = previous && same(previous.runEnd, entry.runStart) ? entry.runStart : entry.start;
      const x2 = next && same(entry.runEnd, next.runStart) ? entry.runEnd : entry.end;
      const last = spans.at(-1);
      if (last && same(last.x2, x1) && same(last.depth, entry.depth)) last.x2 = x2;
      else spans.push({ wallId, side, x1, x2, depth: entry.depth });
    });
    return spans;
  });
  const depths = faces.map(({ side }) => Math.max(...entries
    .filter((entry) => entry.wall.side === side).map((entry) => entry.depth)));
  return { key: first.key, runIds: [...new Set(entries.map(({ run }) => run.id))],
    height: first.height, orderedHeight: first.height + scribe, width: end - start,
    orderedWidth: end - start + scribe * (Number(entries.some((entry) => same(entry.start, start) && entry.leftScribe))
      + Number(entries.some((entry) => same(entry.end, end) && entry.rightScribe))),
    depth: depths.reduce((sum, depth) => sum + depth, 0) + (faces.length === 2 ? first.wall.thickness ?? 0 : 0),
    steps, faces };
}

/** One ordered furniture base per connected group, in roomParts' wall/face/lower-run walk order.
 * faces identify member runs; steps retain constant-depth spans in the wall's front coordinates.
 * Inside corners never link groups across walls.
 */
export function furnitureBaseGroups(room, settings = DEFAULT_SETTINGS) {
  const byId = new Map((room?.walls ?? []).map((wall) => [wall.id, wall]));
  const walls = [...wallNumbers(room)].sort((a, b) => a[1] - b[1]).map(([id]) => byId.get(id));
  return walls.flatMap((source) => {
    const entries = WALL_SIDES.flatMap((side) => {
      const wall = { ...wallSideView(source, side), length: wallLength(source) };
      return [...wall.runs].sort(compareRuns).flatMap((run) => baseEntries(room, wall, run, settings));
    });
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
      groups.push(groupSize(entries.filter((entry) => members.has(entry)), settings));
    }
    return groups;
  });
}
