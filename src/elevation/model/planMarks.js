import { frontDepth } from './corners.js';
import { plotScale } from './drawingScale.js';
import { DIMENSION_TEXT_GAP, DIMENSION_TEXT_HEIGHT } from './elevationDimensions.js';
import { elevationToPlan, wallFrame } from './geometry.js';
import { openingGeometry } from './openings.js';
import { openingPlanDepths, recessGeometry, recessesOn } from './recesses.js';
import { elevationKey, elevationLetters } from './topology.js';
import { formatInches } from './units.js';
import { PLAN_MARKER_CLEARANCE, PLAN_MARKER_FLAG, PLAN_MARKER_RADIUS } from './planDimensions.js';
import { WALL_SIDES, wallSideFrame, wallSideOf } from './wallSides.js';

/** Paper inches a marker moves along its wall when its face has no runs (the canvas's MARKER_SHIFT). */
export const PLAN_MARKER_SHIFT = 0.5;

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
 * Markers sit where the canvas puts them, in paper units; labels just outside the wall. Geometry draws the
 * symbols.
 */
export function planMarks(room, settings) {
  const scale = plotScale(settings);
  const letters = elevationLetters(room);
  const marks = [];
  for (const wall of room.walls) {
    for (const side of WALL_SIDES) {
      const letter = letters.get(elevationKey(wall.id, side));
      if (!letter) continue;
      const frame = wallSideFrame(room, wall, side);
      const runs = (wall.runs ?? []).filter((run) => wallSideOf(run) === side);
      const deepest = Math.max(0, ...runs.map((run) => frontDepth(run, settings)));
      const center = runs.length > 0
        ? (Math.min(...runs.map((run) => run.x)) + Math.max(...runs.map((run) => run.x + run.width))) / 2
        : frame.length / 2;
      const offset = deepest + PLAN_MARKER_CLEARANCE + (PLAN_MARKER_RADIUS + PLAN_MARKER_FLAG) * scale;
      const shift = runs.length > 0 ? 0 : (side === 'front' ? 1 : -1) * PLAN_MARKER_SHIFT * scale;
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
      marks.push({
        kind: 'label',
        at: up(elevationToPlan(frame, jamb.x + jamb.width / 2, back - past)),
        text: `${opening.label} · ${formatInches(jamb.width)}`,
        rotation: readable(frame.r),
      });
    }
    for (const side of WALL_SIDES) {
      const sideFrame = wallSideFrame(room, wall, side);
      for (const recess of recessesOn(wall, side)) {
        const geometry = recessGeometry(recess, sideFrame.length, wall.height);
        const deep = recess.kind !== 'projection' && geometry.depth >= wall.thickness - EPSILON;
        const back = -wall.thickness - (deep ? geometry.depth : 0);
        marks.push({
          kind: 'label',
          at: up(elevationToPlan(sideFrame, geometry.x + geometry.width / 2, back - past)),
          text: `${recess.label} · ${formatInches(geometry.width)} × ${formatInches(geometry.depth)}`,
          rotation: readable(sideFrame.r),
        });
      }
    }
  }
  return marks;
}
