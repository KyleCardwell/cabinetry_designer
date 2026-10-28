import { combinedViewOf } from './combinedElevations.js';
import { combinedElevationPayload, shiftPayloadRecord } from './combinedPayload.js';
import { faceDrawing } from './drawingPayload.js';
import { planParts } from './planParts.js';
import { resolveWall } from './room.js';
import { arcMeasure } from './sectionProfiles.js';
import { elevationKey } from './topology.js';
import { formatInches } from './units.js';

export const MEASURE_STEP = 1 / 32;
const TIE_EPSILON = 1e-9;
const PARALLEL_SINE = Math.sin(0.1 * Math.PI / 180);
const pointKey = ({ x, y }) => `${Math.round(x * 1024)},${Math.round(y * 1024)}`;

/** Snap geometry in inches, retaining the first coordinates for each rounded key. */
export function measureGeometry(shapes) {
  const segments = [];
  const arcs = [];
  const corners = new Map();
  const mids = new Map();
  const centers = new Map();
  const seen = new Set();
  const seenArcs = new Set();
  function addSegment(x1, y1, x2, y2) {
    if (Math.hypot(x2 - x1, y2 - y1) < 1e-6) return;
    const ends = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    const key = ends.map(pointKey).sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    segments.push({ x1, y1, x2, y2 });
    for (const point of ends) {
      if (!corners.has(pointKey(point))) corners.set(pointKey(point), point);
    }
    const mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
    if (!mids.has(pointKey(mid))) mids.set(pointKey(mid), mid);
  }
  function addArc(segment, points) {
    const { radius: r, start, direction, sweep } = arcMeasure(segment, points);
    if (r < 1e-6) return;
    const [cx, cy] = segment.center;
    const [x1, y1] = points[segment.from];
    const [x2, y2] = points[segment.to];
    const ends = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    const center = { x: cx, y: cy };
    const key = `${ends.map(pointKey).sort().join('|')}|${pointKey(center)}`;
    if (seenArcs.has(key)) return;
    seenArcs.add(key);
    const arc = { cx, cy, r, start, sweep: direction * sweep, x1, y1, x2, y2 };
    arcs.push(arc);
    for (const point of ends) {
      if (!corners.has(pointKey(point))) corners.set(pointKey(point), point);
    }
    const angle = start + arc.sweep / 2;
    const mid = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    if (!mids.has(pointKey(mid))) mids.set(pointKey(mid), mid);
    if (!centers.has(pointKey(center))) centers.set(pointKey(center), center);
  }
  for (const shape of shapes) {
    const { x, y, width, height } = shape;
    if (shape.kind === 'point') {
      const point = { x, y };
      if (!corners.has(pointKey(point))) corners.set(pointKey(point), point);
      continue;
    }
    if (shape.kind === 'profile') {
      const { points, loops } = shape.geometry;
      for (const loop of loops) {
        for (const segment of loop.segs) {
          if (segment.type === 'arc') addArc(segment, points);
          else addSegment(...points[segment.from], ...points[segment.to]);
        }
      }
      continue;
    }
    const points = shape.kind === 'rect'
      ? [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]
      : shape.points;
    const closed = shape.kind === 'rect' || shape.closed;
    for (let i = 0; i < points.length - (closed ? 0 : 1); i += 1) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      addSegment(x1, y1, x2, y2);
    }
  }
  return { segments, arcs, corners: [...corners.values()], mids: [...mids.values()], centers: [...centers.values()] };
}

/** Profile and section geometry stays in its own y-up inch frame. */
export function profileMeasureGeometry(geometries, { origin = false } = {}) {
  return measureGeometry([
    ...geometries.filter((geometry) => geometry != null).map((geometry) => ({ kind: 'profile', geometry })),
    ...(origin ? [{ kind: 'point', x: 0, y: 0 }] : []),
  ]);
}

export function sectionMeasureGeometry(section) {
  return profileMeasureGeometry([section?.body, ...(section?.placed ?? []).map(({ geometry }) => geometry)]);
}

/** Renderer-independent samples with exact endpoints. */
export function arcPoints(arc, steps = 24) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    if (i === 0) return { x: arc.x1, y: arc.y1 };
    if (i === steps) return { x: arc.x2, y: arc.y2 };
    const angle = arc.start + arc.sweep * i / steps;
    return { x: arc.cx + arc.r * Math.cos(angle), y: arc.cy + arc.r * Math.sin(angle) };
  });
}

const segment = ({ x1, z1, x2, z2 }) => ({ kind: 'poly', points: [[x1, z1], [x2, z2]], closed: false });
const rect = ({ x, z, width, height }) => ({ kind: 'rect', x, y: z, width, height });

function elevationShapes(parts) {
  return parts.flatMap((part) => [
    part.outline ? { kind: 'poly', points: part.outline, closed: true } : rect(part),
    ...(part.lines ?? []).map(segment),
    // Frame openings (they still show when profiled faces shrink inside them) and glass cut-outs (FX5).
    ...(part.holes ?? []).map(rect),
  ]);
}

/** Door openings, profile lines (rectangles) and miters as the drawing gets them. */
function doorDetailShapes(doorDetails) {
  return doorDetails.flatMap(({ openings = [], profileLines = [], miters = [] }) => [
    ...[...openings, ...profileLines].map(rect),
    ...miters.map(segment),
  ]);
}

/** A pull outline; a knob (every point a bulge) is its centre. */
function pullShape(outline) {
  if (outline.every((point) => point[2])) {
    const x = outline.reduce((sum, [px]) => sum + px, 0) / outline.length;
    const y = outline.reduce((sum, [, pz]) => sum + pz, 0) / outline.length;
    return { kind: 'point', x, y };
  }
  return { kind: 'poly', points: outline.map(([px, pz]) => [px, pz]), closed: true };
}

/** Everything else a face draws (FX5): visible interiors, accessory shapes, glass and swing marks, pulls. */
function drawnLineShapes(drawing) {
  return [
    ...(drawing.interiors ?? []).flatMap(({ lines }) => lines.map(segment)),
    ...(drawing.shapes ?? []).flatMap(({ loops }) => loops.map(({ closed, points }) => ({
      kind: 'poly', points: points.map(([px, pz]) => [px, pz]), closed: closed !== false,
    }))),
    ...(drawing.glassMarks ?? []).flatMap(({ lines }) => lines.map(segment)),
    ...(drawing.swingMarks ?? []).flatMap(({ lines }) => lines.map(segment)),
    ...(drawing.pulls ?? []).flatMap(({ outlines }) => outlines.map(pullShape)),
  ];
}

const DRAWN = ['parts', 'doorDetails', 'interiors', 'shapes', 'glassMarks', 'swingMarks', 'pulls'];

function drawingShapes(drawing) {
  return [...elevationShapes(drawing.parts), ...doorDetailShapes(drawing.doorDetails), ...drawnLineShapes(drawing)];
}

/** Every line the opened elevation draws, in its local x/z frame (y is z), as the DXF gets it (FX5). */
export function elevationMeasureGeometry(room, wall, side, settings) {
  const combined = combinedViewOf(room, wall.id, side);
  if (!combined) {
    const view = resolveWall(room, wall, side);
    return measureGeometry([
      ...drawingShapes(faceDrawing(room, wall, side, settings)),
      { kind: 'rect', x: 0, y: 0, width: view.length, height: wall.height },
    ]);
  }
  const active = combined.faces.find(({ key }) => key === elevationKey(wall.id, side));
  const payload = combinedElevationPayload(room, combined, settings,
    (w, s, options) => faceDrawing(room, w, s, settings, options));
  return measureGeometry([
    ...drawingShapes(Object.fromEntries(DRAWN.map((key) => [key, shiftPayloadRecord(payload[key] ?? [], -active.dx)]))),
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

function projectArc(point, arc) {
  const { cx, cy, r, start, sweep, x1, y1, x2, y2 } = arc;
  const angle = Math.atan2(point.y - cy, point.x - cx);
  const turn = 2 * Math.PI;
  const directed = (sweep < 0 ? -1 : 1) * (angle - start);
  const offset = ((directed % turn) + turn) % turn;
  if (offset <= Math.abs(sweep)) {
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }
  return Math.hypot(point.x - x1, point.y - y1) <= Math.hypot(point.x - x2, point.y - y2)
    ? { x: x1, y: y1 } : { x: x2, y: y2 };
}

export function snapMeasure(point, geometry, tolerance, { pointOnly = false } = {}) {
  if (!geometry) return { kind: 'free', point };
  let nearest;
  let distance = Infinity;
  for (const [kind, points] of [['corner', geometry.corners], ['mid', geometry.mids], ['center', geometry.centers ?? []]]) {
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
  for (const arc of geometry.arcs ?? []) {
    const foot = projectArc(point, arc);
    const next = Math.hypot(foot.x - point.x, foot.y - point.y);
    if (next <= tolerance && next < distance) {
      nearest = { kind: 'arc', point: foot, arc };
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
