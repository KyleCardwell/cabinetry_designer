import { cellPieces } from './cells.js';
import { layoutRun, runFaceLayouts } from './faceLayouts.js';
import { elevationToPlan, wallFrame } from './geometry.js';
import { openingGeometry } from './openings.js';
import { wallEndPanelPartKey } from './parts.js';
import { planRunPieces } from './planPieces.js';
import { openingPlanDepths, recessPlanShape } from './recesses.js';
import { wallEndPanelPolygon, wallEndPanels } from './wallEndPanels.js';
import { wallOutline } from './wallOutline.js';
import { wallSideFrame, wallSideOf } from './wallSides.js';

function flipPoint({ x, y }) {
  return [x + 0, 0 - y];
}

function planPoints(frame, points) {
  return points.map(([u, v]) => flipPoint(elevationToPlan(frame, u, v)));
}

function rectangle(u0, u1, v0, v1) {
  return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
}

/**
 * The room in plan for the DXF (SPEC-44): outlines in plan inches with y up,
 * what the plan view draws less its labels and dimensions.
 * Each part from a run and each wall end panel carries its top, so geometry
 * cuts the lines of what's under it (SPEC-44.1).
 */
export function planParts(room, settings) {
  const parts = [];
  for (const wall of room.walls) {
    if (wall.thickness > 1e-9) {
      parts.push({ id: `${wall.id}:wall`, kind: 'wall', points: wallOutline(room, wall).map(flipPoint) });
    }

    for (const recess of wall.recesses ?? []) {
      const frame = wallSideFrame(room, wall, recess.wallSide);
      const shape = recessPlanShape(recess, frame.length, wall.height, wall.thickness);
      if (shape.fill) {
        parts.push({ id: `${recess.id}:fill`, kind: 'wall', points: planPoints(frame, shape.fill) });
      }
      if (shape.knockout) {
        parts.push({ id: `${recess.id}:knockout`, kind: 'void', points: planPoints(frame, shape.knockout) });
      }
      if (shape.dashed) {
        shape.lines.slice(0, 3).forEach((line, index) => {
          parts.push({
            id: `${recess.id}:line-${index}`,
            kind: 'recess',
            points: planPoints(frame, line),
            closed: false,
            dashed: true,
          });
        });
      }
    }

    for (const opening of wall.openings ?? []) {
      const frame = wallFrame(room, wall);
      const { jamb, casing } = openingGeometry(opening, frame.length, settings);
      const depths = openingPlanDepths(wall, opening);
      parts.push({
        id: `${opening.id}:void`,
        kind: 'void',
        points: planPoints(frame, rectangle(jamb.x, jamb.x + jamb.width, depths.face, depths.back)),
      });
      const detailDepth = opening.kind === 'window' ? (depths.face + depths.back) / 2 : depths.face;
      parts.push({
        id: `${opening.id}:detail`,
        kind: 'opening',
        points: planPoints(frame, [[jamb.x, detailDepth], [jamb.x + jamb.width, detailDepth]]),
        closed: false,
      });
      if (casing) {
        parts.push({
          id: `${opening.id}:casing`,
          kind: 'casing',
          points: planPoints(frame, rectangle(
            casing.x, casing.x + casing.width, depths.face, depths.face + casing.thickness,
          )),
        });
      }
    }

    for (const soffit of wall.soffits ?? []) {
      const frame = wallSideFrame(room, wall, soffit.wallSide);
      parts.push({
        id: soffit.id,
        kind: 'soffit',
        points: planPoints(frame, rectangle(soffit.x, soffit.x + soffit.width, 0, soffit.depth)),
        dashed: true,
      });
    }

    for (const panel of wallEndPanels(room, wall, settings)) {
      parts.push({
        id: wallEndPanelPartKey(wall.id, panel.endpoint),
        kind: 'wall_end_panel',
        points: wallEndPanelPolygon(room, wall, panel).map(flipPoint),
        top: panel.top,
      });
    }
  }
  for (const wall of room.walls) {
    for (const run of wall.runs ?? []) {
      const frame = wallSideFrame(room, wall, wallSideOf(run));
      const layout = layoutRun(room, wall, run, settings);
      const { boxes, faces, returns } = planRunPieces(
        room, wall, run, settings, layout, runFaceLayouts(room, wall, run, settings, layout),
      );
      const tops = new Map([...layout.pieces, ...cellPieces(run, layout).pieces]
        .map((piece) => [piece.id, piece.z + piece.height]));
      const topOf = (key) => tops.get(key) ?? tops.get(key.split(':')[0]) ?? run.z + run.height;
      const addRange = (range, kind) => {
        parts.push({
          id: range.key,
          kind,
          points: planPoints(frame, range.polygon ?? rectangle(
            range.start, range.end, range.back, range.front,
          )),
          runId: run.id,
          top: topOf(range.key),
        });
      };
      for (const box of boxes) {
        addRange(box, box.dashed ? 'shelf' : 'cabinet');
      }
      for (const range of faces) addRange(range, range.kind);
      for (const range of returns) addRange(range, 'filler');
    }
  }
  return parts;
}
