import { frontDepth, runBackOffset } from './corners.js';
import { furnitureBasePast, runBaseProfile } from './furnitureBase.js';
import { bandDepths, runBands } from './runBands.js';
import { moldingPast, moldingProfiles } from './moldingProfiles.js';
import { nosingProjection } from './nosing.js';
import { resolveProfile } from './profile.js';
import { resolveWall } from './room.js';
import { runScene } from './runScene.js';
import { topOverhangs } from './topOverhang.js';
import { isCountertop, runMoldings, runTop } from './tops.js';

const EPSILON = 1e-6;

/** Front depths from the wall face for the bands this run draws. */
export function bandFronts(room, view, run, settings) {
  const depths = bandDepths(settings);
  const profile = resolveProfile(settings, room, view);
  const moldings = moldingProfiles(profile, settings);
  const base = runBaseProfile(room, view, run, settings);
  const top = runTop(view, run, profile);
  const drawn = runMoldings(view, run, profile, settings);
  const boxFront = runBackOffset(run) + run.depth;
  const faces = frontDepth(run, settings);
  const nosing = top.kind === 'wood'
    ? moldingProfiles(profile, settings, run).nosing : null;
  const overhangs = topOverhangs(room, view, run, settings);
  const topFront = faces + overhangs.front + nosingProjection(nosing);
  return {
    toeKick: base.kind === 'toe_kick' ? boxFront - depths.toeKickSetback : null,
    furnitureBase: base.kind === 'furniture_base' ? faces + furnitureBasePast(base) : null,
    countertop: isCountertop(top.kind) ? topFront : null,
    topMold: drawn.topMold ? faces + moldingPast(moldings, 'topMold', settings) : null,
    crown: drawn.crown ? faces + moldingPast(moldings, 'crown', settings) : null,
  };
}

/**
 * The bands on one wall face as geometry draws them (SPEC-42): each run's toe kick, the parts below
 * it, then its countertop or its top mold and crown, with their depths from the wall face. Run by run
 * in view order. A part below a run is flush with the boxes; the toe kick sits back from them by its
 * setback; a top runs from the run's back to past its faces by its overhang or projection.
 */
export function bandParts(room, wall, side, settings) {
  const view = resolveWall(room, wall, side);
  const parts = [];

  for (const run of view.runs) {
    const bands = runBands(room, view, run, settings, runScene(room, view, run, settings));
    const fronts = bandFronts(room, view, run, settings);
    const back = runBackOffset(run);
    const topBack = back - topOverhangs(room, view, run, settings).back;
    const boxFront = back + run.depth;
    const addPart = (rect, id, kind, front, partBack = back) => {
      if (!rect || rect.width <= EPSILON || rect.height <= EPSILON) return;
      const { x, z, width, height } = rect;
      parts.push({
        id, kind, runId: run.id, x, z, width, height, back: partBack, front, coversBoxEdges: false,
        ...(rect.lines?.length ? { lines: rect.lines } : {}),
        ...(rect.outline ? { outline: rect.outline } : {}),
      });
    };

    bands.toeKicks.forEach((band, index) => {
      addPart(band, `${run.id}:toe_kick${index ? `:${index + 1}` : ''}`, 'toe_kick', fronts.toeKick);
    });
    bands.furnitureBases.forEach((band, index) => {
      addPart(band, `${run.id}:furniture_base${index ? `:${index + 1}` : ''}`, 'furniture_base',
        fronts.furnitureBase);
    });
    for (const part of bands.bottomParts) {
      addPart(part, part.id, part.kind, boxFront);
    }
    bands.countertops.forEach((band, index) => {
      addPart(band, `${run.id}:countertop${index ? `:${index + 1}` : ''}`, 'countertop', fronts.countertop, topBack);
    });
    bands.topSegments.forEach((band) => addPart(band, band.id, 'countertop', fronts.countertop, topBack));
    addPart(bands.topMold, `${run.id}:top_mold`, 'top_mold', fronts.topMold);
    addPart(bands.crown, `${run.id}:crown`, 'crown', fronts.crown);
  }

  return parts;
}
