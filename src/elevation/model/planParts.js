import { cellPieces } from './cells.js';
import { layoutRun, runFaceLayouts } from './faceLayouts.js';
import { runLegs } from './legs.js';
import { runLegFills } from './legFills.js';
import { elevationToPlan, wallFrame } from './geometry.js';
import { openingGeometry } from './openings.js';
import { wallEndPanelPartKey } from './parts.js';
import { planRunPieces } from './planPieces.js';
import { planTopEdges } from './planTops.js';
import { openingPlanDepths, projectionTightSides, recessPlanShape } from './recesses.js';
import { resolveWall } from './room.js';
import { wallEndPanelPolygon, wallEndPanels } from './wallEndPanels.js';
import { wallOutline } from './wallOutline.js';
import { wallSideFrame, wallSideOf } from './wallSides.js';

function flipPoint({ x, y }) {
  return [x + 0, 0 - y];
}

function planPoints(frame, points) {
  // The final y flip reverses arcs when the wall-to-plan frame preserves orientation.
  const mirrored = frame.r.x * frame.n.y - frame.r.y * frame.n.x > 0;
  return points.map(([u, v, bulge]) => {
    const point = flipPoint(elevationToPlan(frame, u, v));
    return bulge === undefined ? point : [...point, (mirrored ? -bulge : bulge) || 0];
  });
}

/** Placed leg outlines in the same y-up plan coordinates as the room's parts. */
export function planShapes(room, settings) {
  return room.walls.flatMap((stored) => (stored.runs ?? []).flatMap((run) => {
    const side = wallSideOf(run);
    const frame = wallSideFrame(room, stored, side);
    const wall = resolveWall(room, stored, side);
    return runLegs(room, wall, run, settings).map(({ leg, plan }) => ({
      id: leg.id, kind: 'leg', top: plan.top,
      loops: plan.loops.map(({ closed, points }) => ({ closed, points: planPoints(frame, points) })),
    }));
  }));
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
  const solids = planSolidParts(room, settings, { bottoms: true });
  const tops = planTopEdges(room, settings, solids);
  // `bottom` only tells planTopEdges what stands through a top; it isn't a payload field.
  return [
    ...solids.map((part) => {
      const copy = { ...part };
      delete copy.bottom;
      return copy;
    }),
    ...tops.map(({ id, points, closed }) => ({ id, kind: 'countertop', points, closed })),
  ];
}

/**
 * Everything planParts sends except the top lines: walls, wall things and run parts (PT2).
 * `bottoms: true` adds each run part's and wall end panel's `bottom` (not a payload field) so
 * planTopEdges can tell what stands through a top from what hangs above it.
 */
export function planSolidParts(room, settings, { bottoms = false } = {}) {
  const parts = [];
  for (const wall of room.walls) {
    if (wall.thickness > 1e-9) {
      parts.push({ id: `${wall.id}:wall`, kind: 'wall', points: wallOutline(room, wall).map(flipPoint) });
    }

    for (const recess of wall.recesses ?? []) {
      const frame = wallSideFrame(room, wall, recess.wallSide);
      const tight = projectionTightSides(room, wall, recess, frame.length);
      const shape = recessPlanShape(recess, frame.length, wall.height, wall.thickness, tight);
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
        ...(bottoms ? { bottom: panel.bottom ?? 0 } : {}),
      });
      const frame = wallSideFrame(room, wall, 'front');
      for (const ret of panel.returns ?? []) {
        parts.push({
          id: `${wallEndPanelPartKey(wall.id, panel.endpoint)}:return-${ret.edge}`,
          kind: 'wall_end_panel',
          points: planPoints(frame, rectangle(ret.start, ret.end, ret.back, ret.front)),
          top: panel.top,
          ...(bottoms ? { bottom: panel.bottom ?? 0 } : {}),
        });
      }
    }
  }
  for (const stored of room.walls) {
    for (const run of stored.runs ?? []) {
      const side = wallSideOf(run);
      const frame = wallSideFrame(room, stored, side);
      // the face as the elevation resolves it, length and all, so pins and corner rules lay out the same (SPEC-44.2).
      const wall = resolveWall(room, stored, side);
      const layout = layoutRun(room, wall, run, settings);
      const { boxes, faces, returns, waterfallLegs = [] } = planRunPieces(
        room, wall, run, settings, layout, runFaceLayouts(room, wall, run, settings, layout),
      );
      const runPieces = [...layout.pieces, ...cellPieces(run, layout).pieces];
      const tops = new Map(runPieces.map((piece) => [piece.id, piece.z + piece.height]));
      const lows = new Map(runPieces.map((piece) => [piece.id, piece.z]));
      const topOf = (key) => tops.get(key) ?? tops.get(key.split(':')[0]) ?? run.z + run.height;
      const bottomOf = (key) => lows.get(key) ?? lows.get(key.split(':')[0]) ?? run.z;
      const addRange = (range, kind) => {
        parts.push({
          id: range.key,
          kind,
          points: planPoints(frame, range.polygon ?? rectangle(
            range.start, range.end, range.back, range.front,
          )),
          runId: run.id,
          top: range.top ?? topOf(range.key),
          ...(bottoms ? { bottom: range.bottom ?? bottomOf(range.key) } : {}),
        });
      };
      for (const box of boxes) {
        addRange(box, box.dashed ? 'shelf' : 'cabinet');
      }
      for (const range of faces) addRange(range, range.kind);
      for (const range of returns) addRange(range, 'filler');
      for (const leg of waterfallLegs) addRange(leg, leg.kind);
      for (const { id, type, bounds, back, front, face, ret, returns = [] } of runLegFills(room, wall, run, settings)) {
        const top = bounds.z + bounds.height;
        const bottom = bounds.z;
        addRange({ key: id, start: bounds.x, end: bounds.x + bounds.width,
          back: face?.back ?? back, front: face?.front ?? front, top, bottom }, type === 'panel' ? 'end_panel' : 'filler');
        if (ret) addRange({ ...ret, key: `${id}:return`, top, bottom }, 'filler');
        for (const range of returns) {
          addRange({ ...range, key: `${id}:return-${range.edge}`, top, bottom }, 'end_panel');
        }
      }
    }
  }
  return parts;
}
