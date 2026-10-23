import { combinedViewOf } from './combinedElevations.js';
import { combinedElevationPayload, shiftPayloadRecord } from './combinedPayload.js';
import { faceParts } from './drawingPayload.js';
import { planParts } from './planParts.js';
import { resolveWall } from './room.js';
import { elevationKey } from './topology.js';
import { formatInches } from './units.js';

export const MEASURE_STEP = 1 / 32;
const TIE_EPSILON = 1e-9;
const PARALLEL_SINE = Math.sin(0.1 * Math.PI / 180);
const pointKey = ({ x, y }) => `${Math.round(x * 1024)},${Math.round(y * 1024)}`;

/** Snap geometry in inches, retaining the first coordinates for each rounded key. */
export function measureGeometry(shapes) {
  const segments = [];
  const corners = new Map();
  const mids = new Map();
  const seen = new Set();
  for (const shape of shapes) {
    const { x, y, width, height } = shape;
    const points = shape.kind === 'rect'
      ? [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]
      : shape.points;
    const closed = shape.kind === 'rect' || shape.closed;
    for (let i = 0; i < points.length - (closed ? 0 : 1); i += 1) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if (Math.hypot(x2 - x1, y2 - y1) < 1e-6) continue;
      const ends = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
      const key = ends.map(pointKey).sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      segments.push({ x1, y1, x2, y2 });
      for (const point of ends) {
        if (!corners.has(pointKey(point))) corners.set(pointKey(point), point);
      }
      const mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
      if (!mids.has(pointKey(mid))) mids.set(pointKey(mid), mid);
    }
  }
  return { segments, corners: [...corners.values()], mids: [...mids.values()] };
}

function elevationShapes(parts) {
  return parts.flatMap((part) => [
    part.outline ? { kind: 'poly', points: part.outline, closed: true }
      : { kind: 'rect', x: part.x, y: part.z, width: part.width, height: part.height },
    ...(part.lines ?? []).map(({ x1, z1, x2, z2 }) => ({
      kind: 'poly', points: [[x1, z1], [x2, z2]], closed: false,
    })),
  ]);
}

/** All visible faces in the opened elevation's local x/z frame (y is z). */
export function elevationMeasureGeometry(room, wall, side, settings) {
  const combined = combinedViewOf(room, wall.id, side);
  if (!combined) {
    const view = resolveWall(room, wall, side);
    return measureGeometry([
      ...elevationShapes(faceParts(room, wall, side, settings)),
      { kind: 'rect', x: 0, y: 0, width: view.length, height: wall.height },
    ]);
  }
  const active = combined.faces.find(({ key }) => key === elevationKey(wall.id, side));
  const payload = combinedElevationPayload(room, combined, settings, (w, s, options) => ({
    parts: faceParts(room, w, s, settings, options),
  }));
  return measureGeometry([
    ...elevationShapes(payload.parts.map((part) => shiftPayloadRecord(part, -active.dx))),
    ...combined.faces.map((face) => {
      const faceWall = room.walls.find(({ id }) => id === face.wallId);
      const view = resolveWall(room, faceWall, face.side);
      return { kind: 'rect', x: face.dx - active.dx, y: 0, width: view.length, height: faceWall.height };
    }),
  ]);
}

/** Plan payload coordinates are y-up; pointer coordinates in the room are y-down. */
export function planMeasureGeometry(room, settings) {
  return measureGeometry(planParts(room, settings).map((part) => ({
    kind: 'poly', points: part.points.map(([x, y]) => [x, -y]), closed: part.closed !== false,
  })));
}

function project(point, segment, clamp = false) {
  const { x1, y1, x2, y2 } = segment;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? ((point.x - x1) * dx + (point.y - y1) * dy) / lengthSquared : 0;
  const at = clamp ? Math.max(0, Math.min(1, t)) : t;
  return { point: { x: x1 + at * dx, y: y1 + at * dy }, t };
}

export function snapMeasure(point, geometry, tolerance, { pointOnly = false } = {}) {
  if (!geometry) return { kind: 'free', point };
  let nearest;
  let distance = Infinity;
  for (const [kind, points] of [['corner', geometry.corners], ['mid', geometry.mids]]) {
    for (const candidate of points) {
      const next = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (next <= tolerance && next < distance
        && (nearest?.kind === kind || distance - next > TIE_EPSILON)) {
        nearest = { kind, point: candidate };
        distance = next;
      }
    }
  }
  if (nearest) return nearest;
  for (const segment of geometry.segments) {
    const { point: foot } = project(point, segment, true);
    const next = Math.hypot(foot.x - point.x, foot.y - point.y);
    if (next <= tolerance && next < distance) {
      nearest = { kind: pointOnly ? 'on-edge' : 'edge', point: foot, segment };
      distance = next;
    }
  }
  return nearest ?? { kind: 'free', point };
}

export function measureBetween(a, b) {
  const aLine = a.kind === 'edge';
  const bLine = b.kind === 'edge';
  let from = a.point;
  let to = b.point;
  let kind = 'points';
  let angle;
  let extension;
  let line;
  let point;
  if (aLine && bLine) {
    const adx = a.segment.x2 - a.segment.x1;
    const ady = a.segment.y2 - a.segment.y1;
    const bdx = b.segment.x2 - b.segment.x1;
    const bdy = b.segment.y2 - b.segment.y1;
    const lengths = Math.hypot(adx, ady) * Math.hypot(bdx, bdy);
    if (Math.abs(adx * bdy - ady * bdx) / lengths < PARALLEL_SINE) {
      kind = 'lines';
      line = b.segment;
      point = a.point;
    } else {
      angle = Math.acos(Math.min(1, Math.abs(adx * bdx + ady * bdy) / lengths)) * 180 / Math.PI;
    }
  } else if (aLine || bLine) {
    kind = 'point-line';
    line = aLine ? a.segment : b.segment;
    point = aLine ? b.point : a.point;
  }
  if (line) {
    const { point: foot, t } = project(point, line);
    from = aLine && !bLine ? foot : point;
    to = aLine && !bLine ? point : foot;
    if (t < -TIE_EPSILON || t > 1 + TIE_EPSILON) {
      extension = { from: foot, to: t < 0 ? { x: line.x1, y: line.y1 } : { x: line.x2, y: line.y2 } };
    }
  }
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  return { kind, distance: Math.hypot(dx, dy), from, to, dx, dy,
    ...(angle === undefined ? {} : { angle }), ...(extension ? { extension } : {}) };
}

export function formatMeasure(value) {
  const rounded = Math.round(value / MEASURE_STEP) * MEASURE_STEP;
  return `${Math.abs(value - rounded) > 0.001 ? '~' : ''}${formatInches(rounded, MEASURE_STEP)}`;
}
