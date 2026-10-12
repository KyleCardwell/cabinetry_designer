import { frontDepth, runBackOffset } from './corners.js';
import { furnitureBasePast, runBase } from './furnitureBase.js';
import { bandDepths, runBands } from './runBands.js';
import { moldingPast, moldingProfiles } from './moldingProfiles.js';
import { nosingProjection } from './nosing.js';
import { resolveProfile } from './profile.js';
import { resolveWall } from './room.js';
import { runScene } from './runScene.js';
import { topOverhangs } from './topOverhang.js';

const EPSILON = 1e-6;

/**
 * The bands on one wall face as geometry draws them (SPEC-42): each run's toe kick, the parts below
 * it, then its countertop or its top mold and crown, with their depths from the wall face. Run by run
 * in view order. A part below a run is flush with the boxes; the toe kick sits back from them by its
 * setback; a top runs from the run's back to past its faces by its overhang or projection.
 */
export function bandParts(room, wall, side, settings) {
  const view = resolveWall(room, wall, side);
  const depths = bandDepths(settings);
  const moldings = moldingProfiles(resolveProfile(settings, room, view), settings);
  const parts = [];

  for (const run of view.runs) {
    const bands = runBands(room, view, run, settings, runScene(room, view, run, settings));
    const back = runBackOffset(run);
    const boxFront = back + run.depth;
    const faces = frontDepth(run, settings);
    const addPart = (rect, id, kind, front, partBack = back) => {
      if (!rect || rect.width <= EPSILON || rect.height <= EPSILON) return;
      const { x, z, width, height } = rect;
      parts.push({
        id, kind, runId: run.id, x, z, width, height, back: partBack, front, coversBoxEdges: false,
        ...(rect.lines?.length ? { lines: rect.lines } : {}),
        ...(rect.outline ? { outline: rect.outline } : {}),
      });
    };

    addPart(bands.toeKick, `${run.id}:toe_kick`, 'toe_kick', boxFront - depths.toeKickSetback);
    if (bands.furnitureBase) {
      addPart(bands.furnitureBase, `${run.id}:furniture_base`, 'furniture_base',
        faces + furnitureBasePast(runBase(room, view, run, settings)));
    }
    for (const part of bands.bottomParts) {
      addPart(part, part.id, part.kind, boxFront);
    }
    const nosing = bands.top.kind === 'wood'
      ? moldingProfiles(resolveProfile(settings, room, view), settings, run).nosing : null;
    const overhangs = topOverhangs(room, view, run, settings);
    addPart(bands.countertop, `${run.id}:countertop`, 'countertop',
      faces + overhangs.front + nosingProjection(nosing), back - overhangs.back);
    addPart(bands.topMold, `${run.id}:top_mold`, 'top_mold', faces + moldingPast(moldings, 'topMold', settings));
    addPart(bands.crown, `${run.id}:crown`, 'crown', faces + moldingPast(moldings, 'crown', settings));
  }

  return parts;
}
