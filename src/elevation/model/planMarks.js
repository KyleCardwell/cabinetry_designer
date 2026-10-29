import { plotScale } from './drawingScale.js';
import { DIMENSION_TEXT_GAP, DIMENSION_TEXT_HEIGHT } from './elevationDimensions.js';
import { elevationToPlan, wallFrame } from './geometry.js';
import { openingGeometry } from './openings.js';
import { planMarkerPlacement } from './planMarkerPlacement.js';
import { openingPlanDepths, recessGeometry, recessesOn } from './recesses.js';
import { elevationKey, elevationLetters } from './topology.js';
import { formatInches } from './units.js';
import {
  PLAN_MARKER_CLEARANCE, PLAN_MARKER_FLAG, PLAN_MARKER_RADIUS, planSideReach, planWallRows,
} from './planDimensions.js';
import { WALL_SIDES, wallSideFrame } from './wallSides.js';

/** Paper inches a marker moves along its wall when its face has no runs (the canvas's MARKER_SHIFT). */
const PLAN_MARKER_SHIFT = 0.5;

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
export function planMarks(room, settings) {
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
      const offset = reach + (PLAN_MARKER_RADIUS + PLAN_MARKER_FLAG) * scale;
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
  return marks;
}
