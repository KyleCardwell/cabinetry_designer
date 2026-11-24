import { plotScale } from './drawingScale.js';
import { DIMENSION_TEXT_GAP, DIMENSION_TEXT_HEIGHT } from './elevationDimensions.js';
import { elevationToPlan, wallFrame } from './geometry.js';
import { openingGeometry } from './openings.js';
import { dimensionShape } from './planBoxes.js';
import { placePlanMarks } from './planMarkPlacement.js';
import { planMarkerPlacement } from './planMarkerPlacement.js';
import { openingPlanDepths, recessGeometry, recessesOn } from './recesses.js';
import { elevationKey, elevationLetters } from './topology.js';
import { formatInches } from './units.js';
import {
  PLAN_MARKER_CLEARANCE, PLAN_MARKER_HALF_BASE, planSideReach, planWallRows,
} from './planDimensions.js';
import { WALL_SIDES, wallSideFrame } from './wallSides.js';

/** Paper inches a marker moves along its wall when its face has no runs (the canvas's MARKER_SHIFT). */
const PLAN_MARKER_SHIFT = 0.5;
// Keep today's preferred point past the rows, independently of the new symbol's tip.
const PLAN_MARKER_REST_REACH = 0.4375;

const EPSILON = 1e-6;
const up = (point) => [point.x + 0, 0 - point.y];

/** A face direction as a text angle in y-up degrees, kept in (-90, 90] so it reads from the bottom or right. */
function readable(r) {
  let angle = Math.atan2(-r.y, r.x) * 180 / Math.PI + 0;
  if (angle > 90 + EPSILON) angle -= 180;
  if (angle <= -90 + EPSILON) angle += 180;
  return Math.round(angle * 1e6) / 1e6 + 0;
}

/**
 * Elevation markers and door, window and recess labels for the plan DXF (SPEC-45.1), plan inches with y up.
 * Markers sit past their side's rows, in paper units; labels just past the opposite side's runs.
 * Geometry draws the symbols.
 */
export function planMarks(room, settings, dimensions, parts) {
  const scale = plotScale(settings);
  const letters = elevationLetters(room);
  const marks = [];
  for (const wall of room.walls) {
    for (const side of WALL_SIDES) {
      const key = elevationKey(wall.id, side);
      const letter = letters.get(key);
      if (!letter) continue;
      const { frame, center, offset: reach, hasRuns } = planMarkerPlacement(room, key, settings, {
        clearance: PLAN_MARKER_CLEARANCE,
        rowsAt: (faceWall, faceSide) => planWallRows(room, faceWall, settings)
          .find((row) => row.side === faceSide)?.nextAt,
      });
      const offset = reach + PLAN_MARKER_REST_REACH * scale;
      const shift = hasRuns ? 0 : (side === 'front' ? 1 : -1) * PLAN_MARKER_SHIFT * scale;
      const { d } = wallFrame(room, wall);
      const point = elevationToPlan(frame, center, offset);
      marks.push({
        kind: 'elevation',
        at: up({ x: point.x + d.x * shift, y: point.y + d.y * shift }),
        text: letter,
        direction: up({ x: -frame.n.x, y: -frame.n.y }),
      });
    }
  }
  const past = (DIMENSION_TEXT_GAP + DIMENSION_TEXT_HEIGHT / 2) * scale;
  for (const wall of room.walls) {
    const frame = wallFrame(room, wall);
    for (const opening of wall.openings ?? []) {
      const { jamb } = openingGeometry(opening, frame.length, settings);
      const { back } = openingPlanDepths(wall, opening);
      const depth = back - planSideReach(room, wall, 'back', settings) - past;
      marks.push({
        kind: 'label',
        at: up(elevationToPlan(frame, jamb.x + jamb.width / 2, depth)),
        text: `${opening.label} · ${formatInches(jamb.width)}`,
        rotation: readable(frame.r),
      });
    }
    for (const side of WALL_SIDES) {
      const sideFrame = wallSideFrame(room, wall, side);
      const oppositeReach = planSideReach(room, wall, side === 'front' ? 'back' : 'front', settings);
      for (const recess of recessesOn(wall, side)) {
        const geometry = recessGeometry(recess, sideFrame.length, wall.height);
        const deep = recess.kind !== 'projection' && geometry.depth >= wall.thickness - EPSILON;
        const back = -wall.thickness - (deep ? geometry.depth : 0);
        marks.push({
          kind: 'label',
          at: up(elevationToPlan(sideFrame, geometry.x + geometry.width / 2, back - oppositeReach - past)),
          text: `${recess.label} · ${formatInches(geometry.width)} × ${formatInches(geometry.depth)}`,
          rotation: readable(sideFrame.r),
        });
      }
    }
  }
  const { items, blockers } = planMarkPlacementInput(dimensions, marks, parts, scale);
  const placed = new Map(placePlanMarks(items, blockers, { gap: scale / 16 })
    .map(({ key, at }) => [key, at]));
  return {
    marks: marks.map((mark, i) => ({ ...mark, at: placed.get(`mark:${i}`) })),
    dimensions: dimensions.map((record, i) => (record.textAt
      ? { ...record, textAt: placed.get(`dimension:${i}`) } : { ...record })),
  };
}

const add = (a, b) => a.map((value, i) => value + b[i]);
const times = (point, factor) => point.map((value) => value * factor);
const signedSteps = (limit) => [0, ...Array.from({ length: limit }, (_, i) => [i + 1, -i - 1]).flat()];

/** Build the payload's ordered footprints and fixed blockers, also used to audit golden fallbacks. */
export function planMarkPlacementInput(dimensions, marks, parts, scale) {
  const shapes = dimensions.map((record) => dimensionShape(record, scale));
  const linesAt = (i) => [shapes[i].line,
    [dimensions[i].start, shapes[i].line[0]], [dimensions[i].end, shapes[i].line[1]]];
  const items = [];
  dimensions.forEach((record, i) => {
    if (!record.textAt) return;
    const { axes: [u, v], half, line } = shapes[i];
    const past = half[0] + scale / 16;
    const positions = [record.textAt, add(line[1], times(u, past)), add(line[0], times(u, -past))];
    items.push({
      key: `dimension:${i}`, at: record.textAt, axes: [u, v], half, shift: [0, 0],
      overCabinets: record.row === 'depth',
      steps: positions.flatMap((point) => signedSteps(3).map((k) => (
        add(point, times(v, k * (DIMENSION_TEXT_HEIGHT + 1 / 16) * scale))
          .map((value, axis) => value - record.textAt[axis])
      ))),
      ignore: { lines: linesAt(i) },
    });
  });
  marks.forEach((mark, i) => {
    if (mark.kind !== 'label') return;
    const angle = mark.rotation * Math.PI / 180;
    const u = [Math.cos(angle), Math.sin(angle)];
    const v = [-u[1], u[0]];
    const height = DIMENSION_TEXT_HEIGHT * scale;
    items.push({
      key: `mark:${i}`, at: mark.at, axes: [u, v],
      half: [mark.text.length * 0.5 * height / 2, height / 2], shift: [0, 0],
      steps: signedSteps(8).map((k) => times(u, k * scale / 4)),
    });
  });
  marks.map((mark, i) => ({ mark, i })).filter(({ mark }) => mark.kind === 'elevation')
    .sort((a, b) => a.mark.text.localeCompare(b.mark.text)).forEach(({ mark, i }) => {
      const u = mark.direction;
      const v = [-u[1], u[0]];
      const candidates = Array.from({ length: 4 }, (_, a) => (
        Array.from({ length: 5 }, (_, j) => ({ a, b: j - 2 }))
      )).flat().sort((one, two) => one.a + Math.abs(one.b) - two.a - Math.abs(two.b)
        || one.a - two.a || two.b - one.b);
      items.push({
        key: `mark:${i}`, at: mark.at, axes: [u, v],
        half: [0.35 * scale, PLAN_MARKER_HALF_BASE * scale], shift: times(u, 0.1 * scale),
        steps: candidates.map(({ a, b }) => add(times(u, -a * 0.7625 * scale), times(v, b * 0.8125 * scale))),
      });
    });
  return {
    items,
    blockers: {
      boxes: shapes.filter((_, i) => !dimensions[i].textAt),
      lines: [
        ...dimensions.flatMap((_, i) => linesAt(i)),
        ...parts.filter(({ closed }) => closed === false)
          .flatMap(({ points }) => points.slice(1).map((point, i) => [points[i], point])),
      ],
      polygons: parts.filter(({ closed }) => closed !== false).map(({ points, kind }) => ({ points, kind })),
    },
  };
}
