import { bottomPartSpan, runBottomParts } from './bottoms.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import { frontDepth } from './corners.js';
import { resolveProfile } from './profile.js';
import { isCountertop, runTop } from './tops.js';
import { wallEndPanelAt } from './wallSides.js';

/** The shop's band depths (SPEC-42): settings.bandDepths over the defaults. */
export function bandDepths(settings) {
  return { ...DEFAULT_SETTINGS.bandDepths, ...settings?.bandDepths };
}

const EPSILON = 1e-6;

export function hasToeKick(run) {
  return !run.stack?.below
    && (run.cabinetTypeId === CABINET_TYPE_IDS.BASE || run.cabinetTypeId === CABINET_TYPE_IDS.TALL);
}

const TOP_PAST = { countertop: 'countertopOverhang', topMold: 'topMoldProjection', crown: 'crownProjection' };

/**
 * How far a band runs past a free end of a run (SPEC-42.1): a top by its overhang or projection; a
 * toe kick stops short (negative), 1" from an end panel's face, else 1/4" from the cabinet's side.
 */
function bandPast(run, side, band, settings) {
  const depths = bandDepths(settings);
  if (band !== 'toeKick') return depths[TOP_PAST[band]];
  const setback = run.ends?.[side]?.type === 'end_panel'
    ? depths.toeKickEndPanelSetback
    : depths.toeKickSideSetback;
  return -Math.min(setback, run.width / 2);
}

/** Where a band ends at a free end of a run. */
function freeEdge(run, side, band, settings) {
  return side === 'left'
    ? run.x - bandPast(run, side, band, settings)
    : run.x + run.width + bandPast(run, side, band, settings);
}

/** Whether a run carries a band of this kind on: the same top family, or a toe kick of its own. */
function carries(room, wall, run, band, settings) {
  if (band === 'toeKick') return hasToeKick(run);
  const { kind } = runTop(wall, run, resolveProfile(settings, room, wall));
  if (band === 'countertop') return isCountertop(kind);
  if (band === 'topMold') return kind === 'topMold' || kind === 'crown';
  return kind === 'crown';
}

/** The runs on the same face whose opposite edge meets this side of a run, overlapping it in height. */
function touching(wall, run, side) {
  const edge = side === 'left' ? run.x : run.x + run.width;
  return wall.runs.filter((other) => other.id !== run.id
    && Math.abs((side === 'left' ? other.x + other.width : other.x) - edge) <= EPSILON
    && Math.min(run.z + run.height, other.z + other.height) - Math.max(run.z, other.z) > EPSILON);
}

/**
 * Where a band ends on one side of a run (SPEC-42, 42.1). `band` is 'toeKick', 'countertop', 'topMold'
 * or 'crown'. Against a run that carries the band on (a top at the same height, or a toe kick): the
 * deeper run's band returns as at a free end, and the shallower one's meets it there; at equal depths it
 * runs straight through. A top dies into a taller run. Otherwise: over a wall end panel a top runs past
 * the panel; it stops at a wall or at the side of the recess the run sits in; anything else is free.
 */
function bandEdge(room, wall, run, side, band, settings) {
  const edge = side === 'left' ? run.x : run.x + run.width;
  const opposite = side === 'left' ? 'right' : 'left';
  const neighbors = touching(wall, run, side);
  const boxTop = run.z + run.height;
  if (band !== 'toeKick'
    && neighbors.some((other) => other.z + other.height > boxTop + EPSILON)) return edge;
  const carriers = neighbors.filter((other) => (band === 'toeKick'
    || Math.abs(other.z + other.height - boxTop) <= EPSILON)
    && carries(room, wall, other, band, settings));
  if (carriers.length > 0) {
    const depth = frontDepth(run, settings);
    const deepest = carriers.reduce((best, other) => (
      frontDepth(other, settings) > frontDepth(best, settings) ? other : best));
    const theirs = frontDepth(deepest, settings);
    if (depth > theirs + EPSILON) return freeEdge(run, side, band, settings);
    if (depth < theirs - EPSILON) return freeEdge(deepest, opposite, band, settings);
    return edge;
  }
  const anchor = run.anchors?.[side];
  if (anchor === true) {
    if (band === 'toeKick' || !wallEndPanelAt(room, wall, side, settings)) return edge;
    const past = bandPast(run, side, band, settings);
    return side === 'left' ? -past : wall.length + past;
  }
  if (anchor?.to === 'wall') return edge;
  if (anchor?.to === 'recess' && run._plane?.recessId === anchor.recessId) return edge;
  return freeEdge(run, side, band, settings);
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
  const panelStart = panelBySide.left
    ? Math.min(panelBySide.left.x, run.x)
    : null;
  const panelEnd = panelBySide.right
    ? Math.max(panelBySide.right.x + panelBySide.right.width, runEnd)
    : null;
  /** A band's rectangle from its two ends; a blind panel takes it to the wall. */
  const band = (kind, z, height) => {
    const x = panelStart ?? bandEdge(room, wall, run, 'left', kind, settings);
    const right = panelEnd ?? bandEdge(room, wall, run, 'right', kind, settings);
    return { x, z, width: right - x, height };
  };
  const profile = resolveProfile(settings, room, wall);
  const toeKickHeight = run.overrides?.toeKickHeight ?? profile.toeKickHeight;
  const top = runTop(wall, run, profile);
  const boxTop = run.z + run.height;
  const topMold = (top.kind === 'crown' || top.kind === 'topMold')
    ? band('topMold', boxTop, profile.topMoldHeight)
    : null;
  const crown = top.kind === 'crown'
    ? band('crown', boxTop + profile.crownStackHeight - profile.crownHeight, profile.crownHeight)
    : null;
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
  const toeKickBand = band('toeKick', 0, toeKickHeight);
  const toeKick = hasToeKick(run) && toeKickBand.width > 0 ? toeKickBand : null;
  const countertop = isCountertop(top.kind) ? band('countertop', boxTop, top.height) : null;
  return { top, toeKick, countertop, topMold, crown, bottomParts, chipLines };
}
