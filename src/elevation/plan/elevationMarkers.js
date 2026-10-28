import { layoutDimensionRow } from '../canvas/dimensionLayout.js';
import { planSideReach } from '../model/planDimensions.js';
import { recessesOn } from '../model/recesses.js';
import { wallFaceSegments } from '../model/wallFaceRow.js';
import { wallOutline } from '../model/wallOutline.js';
import { elevationToPlan, wallFrame } from '../model/geometry.js';
import { planMarkerPlacement } from '../model/planMarkerPlacement.js';
import { elevationKey, elevationLetters } from '../model/topology.js';
import { PLAN_DIM_FONT_SIZE } from './constants.js';

export const MARKER_RADIUS = 14;
export const MARKER_FLAG_LENGTH = 10;
export const MARKER_CLEARANCE = 6;
export const MARKER_SHIFT = 24;

/** Shared canvas row positions keep the marker flag beyond the last row and its moved text. */
export function canvasDimensionRows(room, wall, settings, scale, factor = 1) {
  // SPEC-36.3.1: wing walls and, on the front, doors and windows share one row inside the wall's length.
  const faceRows = {
    front: wallFaceSegments(room, wall, 'front', settings),
    back: wallFaceSegments(room, wall, 'back', settings),
  };
  const hasFrontLandings = faceRows.front.length > 0;
  // SPEC-38.1: a recess at least as deep as the wall bumps the wall out on the other face, where that face's
  // row (and on the front, the overall length) is drawn, so those move out past the deepest one.
  const bumpOut = (side) => Math.max(0, ...recessesOn(wall, side)
    .filter((recess) => recess.kind !== 'projection' && recess.depth >= wall.thickness - 1e-6)
    .map((recess) => recess.depth));
  const outside = wall.thickness
    + Math.max(bumpOut('front'), planSideReach(room, wall, 'back', settings));
  const innerRowOffset = outside + 22 * factor / scale;
  const layouts = Object.fromEntries(Object.entries(faceRows).map(([side, segments]) => [
    side, layoutDimensionRow(segments, { scale, fontSize: PLAN_DIM_FONT_SIZE * factor, padding: 4 * factor }),
  ]));
  const endpoints = wallOutline(room, wall).slice(0, 2);
  const length = Math.hypot(endpoints[1].x - endpoints[0].x, endpoints[1].y - endpoints[0].y);
  layouts.wall = layoutDimensionRow([{ start: 0, end: length }], { scale, fontSize: PLAN_DIM_FONT_SIZE * factor, padding: 4 * factor });
  const dimensionOffset = innerRowOffset + (hasFrontLandings ? (20 + layouts.front.levels * 14) * factor / scale : 0);
  const backRowOffset = wall.thickness
    + Math.max(bumpOut('back'), planSideReach(room, wall, 'front', settings)) + 42 * factor / scale;
  return {
    segments: faceRows, layouts, outside, innerRowOffset, dimensionOffset, backRowOffset,
    nextAt: {
      back: dimensionOffset - wall.thickness + (layouts.wall.levels * 14 + 24) * factor / scale,
      front: faceRows.back.length > 0
        ? backRowOffset - wall.thickness + (layouts.back.levels * 14 + 24) * factor / scale : null,
    },
  };
}

export function elevationMarkers(room, settings, scale, factor = 1) {
  const letters = elevationLetters(room);
  const markers = [];

  for (const wall of room?.walls ?? []) {
    for (const side of ['front', 'back']) {
      const key = elevationKey(wall.id, side);
      const letter = letters.get(key);
      if (!letter) continue;

      const { frame, center, offset: reach, hasRuns } = planMarkerPlacement(room, key, settings, {
        clearance: MARKER_CLEARANCE,
        rowsAt: (faceWall, faceSide) => canvasDimensionRows(room, faceWall, settings, scale, factor).nextAt[faceSide],
      });
      const shift = hasRuns ? 0 : (side === 'front' ? 1 : -1) * MARKER_SHIFT / scale;
      const anchor = elevationToPlan(frame, center, 0);
      const offset = reach + (MARKER_RADIUS + MARKER_FLAG_LENGTH) / scale;
      const direction = frame.n;
      const d = wallFrame(room, wall).d;
      const point = {
        x: anchor.x + direction.x * offset + d.x * shift,
        y: anchor.y + direction.y * offset + d.y * shift,
      };

      markers.push({ key, wallId: wall.id, side, letter, point, direction });
    }
  }

  return markers;
}
