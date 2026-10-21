import { layoutDimensionRow } from '../canvas/dimensionLayout.js';
import { planSideReach } from '../model/planDimensions.js';
import { recessesOn } from '../model/recesses.js';
import { wallFaceSegments } from '../model/wallFaceRow.js';
import { wallOutline } from '../model/wallOutline.js';
import { wallFrame } from '../model/geometry.js';
import { elevationKey, elevationLetters } from '../model/topology.js';
import { wallSideFrame, wallSideOf } from '../model/wallSides.js';
import { PLAN_DIM_FONT_SIZE } from './constants.js';

export const MARKER_RADIUS = 14;
export const MARKER_FLAG_LENGTH = 10;
export const MARKER_CLEARANCE = 6;
export const MARKER_SHIFT = 24;

/** Shared canvas row positions keep the marker flag beyond the last row and its moved text. */
export function canvasDimensionRows(room, wall, settings, scale) {
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
  const innerRowOffset = outside + 22 / scale;
  const layouts = Object.fromEntries(Object.entries(faceRows).map(([side, segments]) => [
    side, layoutDimensionRow(segments, { scale, fontSize: PLAN_DIM_FONT_SIZE }),
  ]));
  const endpoints = wallOutline(room, wall).slice(0, 2);
  const length = Math.hypot(endpoints[1].x - endpoints[0].x, endpoints[1].y - endpoints[0].y);
  layouts.wall = layoutDimensionRow([{ start: 0, end: length }], { scale, fontSize: PLAN_DIM_FONT_SIZE });
  const dimensionOffset = innerRowOffset + (hasFrontLandings ? (20 + layouts.front.levels * 14) / scale : 0);
  const backRowOffset = wall.thickness
    + Math.max(bumpOut('back'), planSideReach(room, wall, 'front', settings)) + 42 / scale;
  return {
    segments: faceRows, layouts, outside, innerRowOffset, dimensionOffset, backRowOffset,
    nextAt: {
      back: dimensionOffset - wall.thickness + (layouts.wall.levels * 14 + 24) / scale,
      front: faceRows.back.length > 0
        ? backRowOffset - wall.thickness + (layouts.back.levels * 14 + 24) / scale : null,
    },
  };
}

export function elevationMarkers(room, settings, scale) {
  const letters = elevationLetters(room);
  const markers = [];

  for (const wall of room?.walls ?? []) {
    const rows = canvasDimensionRows(room, wall, settings, scale);
    for (const side of ['front', 'back']) {
      const key = elevationKey(wall.id, side);
      const letter = letters.get(key);
      if (!letter) continue;

      const frame = wallSideFrame(room, wall, side);
      const sideRuns = (wall.runs ?? []).filter((run) => wallSideOf(run) === side);
      const deepest = planSideReach(room, wall, side, settings);
      const centerX = sideRuns.length > 0
        ? (Math.min(...sideRuns.map((run) => run.x))
          + Math.max(...sideRuns.map((run) => run.x + run.width))) / 2
        : frame.length / 2;
      const shift = sideRuns.length > 0 ? 0 : (side === 'front' ? 1 : -1) * MARKER_SHIFT / scale;
      const anchor = {
        x: frame.leftPoint.x + frame.r.x * centerX,
        y: frame.leftPoint.y + frame.r.y * centerX,
      };
      const offset = Math.max(deepest + MARKER_CLEARANCE, rows.nextAt[side] ?? 0)
        + (MARKER_RADIUS + MARKER_FLAG_LENGTH) / scale;
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
