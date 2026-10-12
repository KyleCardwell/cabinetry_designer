import { bottomPartSpan, runBottomParts } from './bottoms.js';
import { bandDepths, hasToeKick } from './bandDepths.js';
import { bandOutline, endEdgeX, frontContour, placeAtEnd } from './bandEnds.js';
import { cornerBandEdge, lazyCornerShapes } from './cornerBands.js';
import { frontDepth, runBackOffset } from './corners.js';
import { floorOpenings } from './floorOpenings.js';
import { furnitureBaseBand, furnitureBasePast, runBase, runBaseProfile } from './furnitureBase.js';
import { runScene } from './runScene.js';
import { moldingPast, moldingProfiles } from './moldingProfiles.js';
import { nosingProjection, woodTopSection } from './nosing.js';
import { resolveProfile } from './profile.js';
import { outlineBounds, sectionProfileOutline } from './sectionProfileOutline.js';
import { isCountertop, runTop } from './tops.js';
import { topOverhangs } from './topOverhang.js';
import { wallEndPanelAt } from './wallSides.js';
import { waterfallBand } from './waterfall.js';

export { bandDepths, hasToeKick } from './bandDepths.js';

const EPSILON = 1e-6;

function countertopProfile(room, wall, run, settings) {
  const profile = resolveProfile(settings, room, wall);
  const top = runTop(wall, run, profile);
  return {
    picked: top.kind === 'wood' ? moldingProfiles(profile, settings, run).nosing : null,
    reference: run.z + run.height + top.height,
    overhangs: topOverhangs(room, wall, run, settings),
  };
}

/**
 * How far a band runs past a free end of a run (SPEC-42.1): a top by its overhang or projection; a
 * toe kick stops short (negative), 1" from an end panel's face, else 1/4" from the cabinet's side.
 */
function bandPast(room, wall, run, side, band, settings) {
  if (band === 'furnitureBase') return furnitureBasePast(runBaseProfile(room, wall, run, settings));
  const depths = bandDepths(settings);
  if (band === 'countertop') {
    const { picked, overhangs } = countertopProfile(room, wall, run, settings);
    return overhangs[side] + nosingProjection(picked);
  }
  if (band !== 'toeKick') {
    return moldingPast(moldingProfiles(resolveProfile(settings, room, wall), settings), band, settings);
  }
  const setback = run.ends?.[side]?.type === 'end_panel'
    ? depths.toeKickEndPanelSetback
    : depths.toeKickSideSetback;
  return -Math.min(setback, run.width / 2);
}

/** Where a band ends at a free end of a run. */
function freeEdge(room, wall, run, side, band, settings) {
  return side === 'left'
    ? run.x - bandPast(room, wall, run, side, band, settings)
    : run.x + run.width + bandPast(room, wall, run, side, band, settings);
}

/** Whether a run carries this top family or floor base kind. */
function carries(room, wall, run, band, settings) {
  if (band === 'toeKick') return runBaseProfile(room, wall, run, settings).kind === 'toe_kick';
  if (band === 'furnitureBase') return runBaseProfile(room, wall, run, settings).kind === 'furniture_base';
  const { kind } = runTop(wall, run, resolveProfile(settings, room, wall));
  if (band === 'countertop') return isCountertop(kind);
  if (band === 'topMold') return kind === 'topMold' || kind === 'crown';
  return kind === 'crown';
}

/** Runs meeting this side: other floor bases, or runs overlapping the box in height. */
function touching(wall, run, side, floorBase = false) {
  const edge = side === 'left' ? run.x : run.x + run.width;
  return wall.runs.filter((other) => other.id !== run.id
    && Math.abs((side === 'left' ? other.x + other.width : other.x) - edge) <= EPSILON
    && (floorBase ? hasToeKick(other)
      : Math.min(run.z + run.height, other.z + other.height) - Math.max(run.z, other.z) > EPSILON));
}

/**
 * Where a band ends on one side of a run (SPEC-42, 42.1). `band` is 'toeKick', 'countertop', 'topMold',
 * 'crown' or 'furnitureBase'. Against a run that carries the band on (a top or furniture base at the
 * same height, or a toe kick): the deeper run's band returns as at a free end, and the shallower one's
 * meets it there; at equal depths it
 * runs straight through. A top dies into a taller run. Otherwise: over a wall end panel a top runs past
 * the panel; it stops at a wall or at the side of the recess the run sits in; anything else is free.
 */
function bandEdge(room, wall, run, side, band, settings) {
  const edge = side === 'left' ? run.x : run.x + run.width;
  const square = { type: 'square', x: edge };
  if (band === 'toeKick' || band === 'furnitureBase') {
    const waterfall = waterfallEnds(room, wall, run, settings)[side];
    if (waterfall) {
      const overhang = topOverhangs(room, wall, run, settings)[side];
      if (overhang === 0 || waterfall.baseToLeg) {
        // A touching leg retains the toe kick's end-panel setback; a bridged gap does not.
        const x = band === 'toeKick' && overhang === 0 && run.ends?.[side]?.type === 'end_panel'
          ? freeEdge(room, wall, run, side, band, settings)
          : edge + (side === 'left' ? -1 : 1) * overhang;
        return { type: 'square', x };
      }
    }
  }
  const returned = (source, end) => {
    const x = freeEdge(room, wall, source, end, band, settings);
    const s = end === 'left' ? -1 : 1;
    return { type: 'return', x, side: x - s * bandPast(room, wall, source, end, band, settings), facing: s,
      ...(band === 'countertop' ? { countertop: countertopProfile(room, wall, source, settings) } : {}),
      ...(band === 'furnitureBase' ? { base: runBaseProfile(room, wall, source, settings) } : {}) };
  };
  const opposite = side === 'left' ? 'right' : 'left';
  const furniture = band === 'furnitureBase';
  const neighbors = touching(wall, run, side, furniture);
  const boxTop = run.z + run.height;
  if (band !== 'toeKick' && !furniture
    && neighbors.some((other) => other.z + other.height > boxTop + EPSILON)) return square;
  const carriers = neighbors.filter((other) => (furniture
    ? Math.abs(runBaseProfile(room, wall, other, settings).height - runBaseProfile(room, wall, run, settings).height) <= EPSILON
    : band === 'toeKick' || Math.abs(other.z + other.height - boxTop) <= EPSILON)
    && carries(room, wall, other, band, settings));
  if (carriers.length > 0) {
    const depth = frontDepth(run, settings);
    const deepest = carriers.reduce((best, other) => (
      frontDepth(other, settings) > frontDepth(best, settings) ? other : best));
    const theirs = frontDepth(deepest, settings);
    if (depth > theirs + EPSILON) return returned(run, side);
    if (depth < theirs - EPSILON) return { ...returned(deepest, opposite), type: 'cope' };
    return square;
  }
  if (furniture && neighbors.length > 0) return square;
  if (band === 'toeKick'
    && neighbors.some((other) => carries(room, wall, other, 'furnitureBase', settings))) return square;
  const anchor = run.anchors?.[side];
  if (anchor === true) {
    if (band === 'toeKick' || !wallEndPanelAt(room, wall, side, settings)) return square;
    const past = bandPast(room, wall, run, side, band, settings);
    return { type: 'return', x: side === 'left' ? -past : wall.length + past,
      side: side === 'left' ? 0 : wall.length, facing: side === 'left' ? -1 : 1 };
  }
  if (anchor?.to === 'wall') return square;
  if (anchor?.to === 'recess' && run._plane?.recessId === anchor.recessId) return square;
  return returned(run, side);
}

/** Effective waterfall picks at free countertop ends; blocked picks stay stored. */
export function waterfallEnds(room, wall, run, settings) {
  const result = { left: null, right: null, warnings: [] };
  if (!run.waterfall || !isCountertop(runTop(wall, run, resolveProfile(settings, room, wall)).kind)) {
    return result;
  }
  let scene;
  for (const side of ['left', 'right']) {
    const pick = run.waterfall[side];
    if (!pick || typeof pick !== 'object' || Array.isArray(pick)) continue;
    const anchor = run.anchors?.[side];
    // Do not resolve bandEdge's return here: its overhang consults waterfallEnds.
    const blocked = touching(wall, run, side).length > 0
      || anchor === true || anchor?.to === 'wall' || anchor?.to === 'recess'
      || (run.ends?.[side]?.type === 'blind'
        && (scene ??= runScene(room, wall, run, settings)).panelBySide[side]);
    if (blocked) result.warnings.push({ code: 'waterfall-end-blocked', runId: run.id, side });
    else result[side] = { baseToLeg: pick.baseToLeg === true };
  }
  return result;
}

export function runBandEnds(room, wall, run, settings, scene, kind, z, height, shapes = lazyCornerShapes(room, wall, settings)) {
  const { panelBySide } = scene;
  const runEnd = run.x + run.width;
  const panelStart = panelBySide.left
    ? Math.min(panelBySide.left.x, run.x)
    : null;
  const panelEnd = panelBySide.right
    ? Math.max(panelBySide.right.x + panelBySide.right.width, runEnd)
    : null;
  /**
   * A band's rectangle from its two ends: a blind panel takes it to the wall; at a corner it meets the
   * return's band (SPEC-42.3); otherwise bandEdge.
   */
  const left = (panelStart === null ? null : { type: 'square', x: panelStart })
    ?? cornerBandEdge(shapes, run, 'left', kind, z, height)
    ?? bandEdge(room, wall, run, 'left', kind, settings);
  const right = (panelEnd === null ? null : { type: 'square', x: panelEnd })
    ?? cornerBandEdge(shapes, run, 'right', kind, z, height)
    ?? bandEdge(room, wall, run, 'right', kind, settings);
  return [left, right];
}

/** Floor-base spans, retaining the run's outer ends and returning at each opening. */
export function runBaseSegments(room, wall, run, settings, scene, kind, base) {
  const outer = runBandEnds(room, wall, run, settings, scene, kind, 0, base.height);
  const segments = [];
  const depths = bandDepths(settings);
  const openingEnd = (x, side, neighbour) => {
    const facing = side === 'left' ? -1 : 1;
    const past = kind === 'furnitureBase' ? furnitureBasePast(base)
      : -(neighbour === 'panel' ? depths.toeKickEndPanelSetback : depths.toeKickSideSetback);
    return { type: 'return', x: x + facing * past, side: x, facing,
      ...(kind === 'furnitureBase' ? { base } : {}) };
  };
  let start = run.x;
  let left = outer[0];
  for (const opening of floorOpenings(run, scene.cells).filter(({ baseUnder }) => !baseUnder)) {
    const end = Math.min(opening.x, run.x + run.width);
    if (end > start + EPSILON) {
      segments.push({ start, end, ends: [left, openingEnd(end, 'right', opening.left)] });
    }
    const next = Math.min(opening.x + opening.width, run.x + run.width);
    if (next >= start) {
      start = next;
      left = openingEnd(start, 'left', opening.right);
    }
  }
  if (run.x + run.width > start + EPSILON) {
    segments.push({ start, end: run.x + run.width, ends: [left, outer[1]] });
  }
  return segments.map((segment) => {
    const [left, right] = segment.ends;
    const band = kind === 'furnitureBase' ? furnitureBaseBand(base, segment.ends)
      : { x: left.x, z: 0, width: right.x - left.x, height: base.height };
    return { ...segment, band };
  }).filter(({ band }) => band.width > 0);
}

/** Furniture bands in x order, with cutouts placed within each segment's floor ends. */
export function runFurnitureBaseBand(room, wall, run, settings, base, scene = runScene(room, wall, run, settings)) {
  return base.kind === 'furniture_base'
    ? runBaseSegments(room, wall, run, settings, scene, 'furnitureBase', base)
      .map(({ band }) => band) : [];
}

/**
 * The bands around a run (SPEC-42): its toe kick, its top (countertop, or top mold and crown), the
 * parts below it, and the chip lines on its end panels and fillers, in elevation coordinates. The
 * canvas and the DXF both draw from it. `wall` is the resolved wall face; `scene` is runScene's.
 * Each end follows bandEdge (SPEC-42.1); a blind panel takes every band to the wall.
 */
export function runBands(room, wall, run, settings, scene) {
  const { drawnPieces, hiddenIds, panelBySide, endBottom } = scene;
  const runEnd = run.x + run.width;
  const panelStart = panelBySide.left ? Math.min(panelBySide.left.x, run.x) : null;
  const panelEnd = panelBySide.right ? Math.max(panelBySide.right.x + panelBySide.right.width, runEnd) : null;
  const shapes = lazyCornerShapes(room, wall, settings);
  const endsFor = (kind, z, height) => runBandEnds(room, wall, run, settings, scene, kind, z, height, shapes);
  const band = (kind, z, height) => {
    const [left, right] = endsFor(kind, z);
    return { x: left.x, z, width: right.x - left.x, height };
  };
  const profile = resolveProfile(settings, room, wall);
  const moldings = moldingProfiles(profile, settings, run);
  const base = runBase(room, wall, run, settings, scene);
  const top = runTop(wall, run, profile);
  const boxTop = run.z + run.height;
  const topMold = (top.kind === 'crown' || top.kind === 'topMold')
    ? band('topMold', boxTop, profile.topMoldHeight)
    : null;
  const crown = top.kind === 'crown'
    ? band('crown', boxTop + profile.crownStackHeight - profile.crownHeight, profile.crownHeight)
    : null;
  for (const [rect, kind, picked, reference] of [
    [topMold, 'topMold', moldings.topMold, boxTop],
    [crown, 'crown', moldings.crown, boxTop + profile.crownStackHeight],
  ]) {
    if (!rect) continue;
    let edges;
    if (picked) {
      const loop = sectionProfileOutline(picked.geometry);
      edges = endsFor(kind, rect.z).map((end, index) => {
        const outline = end.outline ?? (loop && end.type !== 'square' && end.side !== undefined
          ? placeAtEnd(loop, end.side, moldings.overhang, reference, end.facing) : null);
        return (outline && frontContour(outline, end.facing ?? (index === 0 ? 1 : -1)))
          ?? [[end.x, rect.z, 0], [end.x, rect.z + rect.height, 0]];
      });
      rect.outline = bandOutline(...edges, rect.z, rect.height);
      const { minX, maxX } = outlineBounds(rect.outline);
      rect.x = minX;
      rect.width = maxX - minX;
    }
    rect.lines = [];
    for (const id of picked?.profile.drawnPoints.elevation ?? []) {
      const z = reference + picked.geometry.points[id][1];
      if (Math.abs(z - rect.z) <= EPSILON || Math.abs(z - rect.z - rect.height) <= EPSILON
        || rect.lines.some((line) => Math.abs(line.z1 - z) <= EPSILON)) continue;
      rect.lines.push({ x1: edges ? endEdgeX(edges[0], z, -1) : rect.x, z1: z,
        x2: edges ? endEdgeX(edges[1], z, 1) : rect.x + rect.width, z2: z });
    }
  }
  const span = bottomPartSpan(
    run,
    drawnPieces,
    { start: panelStart ?? run.x, end: panelEnd ?? runEnd },
    endBottom.chip > 0,
  );
  const bottomParts = runBottomParts(run).map((part) => ({
    id: part.id,
    kind: part.kind,
    doors: part.doors,
    x: span.start,
    z: part.z,
    width: span.end - span.start,
    height: part.height,
    ...(part.behind ? { behind: true } : {}),
  }));
  const chipLines = endBottom.chip > 0
    ? drawnPieces
      .filter((piece) => (piece.kind === 'filler' || piece.kind === 'end_panel')
        && !piece.extend?.down
        && !hiddenIds.has(piece.id))
      .map((piece) => ({
        pieceId: piece.id,
        x1: piece.x,
        x2: piece.x + piece.width,
        z: piece.z + endBottom.chip,
      }))
    : [];
  const toeKicks = base.kind === 'toe_kick'
    ? runBaseSegments(room, wall, run, settings, scene, 'toeKick', base).map(({ band }) => band) : [];
  const furnitureBases = runFurnitureBaseBand(room, wall, run, settings, base, scene);
  let countertop = isCountertop(top.kind) ? band('countertop', boxTop, top.height) : null;
  const overhangs = topOverhangs(room, wall, run, settings);
  const section = top.kind === 'wood' && woodTopSection(moldings.nosing, top.height,
    (runBackOffset(run) - overhangs.back) - (frontDepth(run, settings) + overhangs.front));
  let countertopEdges;
  if (section) {
    const reference = boxTop + top.height;
    const z = reference + section.minY;
    const height = reference - z;
    const edges = endsFor('countertop', z, height).map((end, index) => {
      const source = end.countertop ?? { picked: moldings.nosing, reference, overhangs };
      const overhang = source.overhangs[end.facing === -1 ? 'left' : 'right'];
      const loop = source.picked && sectionProfileOutline(source.picked.geometry);
      const outline = end.outline ?? (loop && end.type !== 'square' && end.side !== undefined
        ? placeAtEnd(loop, end.side, overhang, source.reference, end.facing) : null);
      return (outline && frontContour(outline, end.facing ?? (index === 0 ? 1 : -1)))
        ?? [[end.x, z, 0], [end.x, reference, 0]];
    });
    countertopEdges = edges;
    const outline = bandOutline(...edges, z, height);
    const { minX, maxX } = outlineBounds(outline);
    const lines = [];
    for (const id of moldings.nosing.profile.drawnPoints.elevation) {
      const lineZ = reference + moldings.nosing.geometry.points[id][1];
      if (lineZ <= z + EPSILON || lineZ >= reference - EPSILON
        || lines.some((line) => Math.abs(line.z1 - lineZ) <= EPSILON)) continue;
      lines.push({ x1: endEdgeX(edges[0], lineZ, -1), z1: lineZ,
        x2: endEdgeX(edges[1], lineZ, 1), z2: lineZ });
    }
    countertop = { x: minX, z, width: maxX - minX, height, outline, lines };
  }
  const waterfall = waterfallEnds(room, wall, run, settings);
  if (countertop && (waterfall.left || waterfall.right)) {
    const surface = boxTop + top.height;
    const edges = countertopEdges ?? [countertop.x, countertop.x + countertop.width]
      .map((x) => [[x, countertop.z, 0], [x, surface, 0]]);
    countertop = waterfallBand(countertop, edges, waterfall, run, top.height, surface, overhangs);
  }
  return { top, toeKicks, furnitureBases, countertop, topMold, crown, bottomParts, chipLines };
}
