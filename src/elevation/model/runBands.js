import { bottomPartSpan, runBottomParts } from './bottoms.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import { isJointAnchor, jointMembers } from './joints.js';
import { resolveProfile } from './profile.js';
import { runTop } from './tops.js';
import { wallEndPanelAt } from './wallSides.js';

/** The shop's band depths (SPEC-42): settings.bandDepths over the defaults. */
export function bandDepths(settings) {
  return { ...DEFAULT_SETTINGS.bandDepths, ...settings?.bandDepths };
}

const EPSILON = 1e-6;

function hasToeKick(run) {
  return !run.stack?.below
    && (run.cabinetTypeId === CABINET_TYPE_IDS.BASE || run.cabinetTypeId === CABINET_TYPE_IDS.TALL);
}

/**
 * How a band ends on one side of a run (SPEC-42): 'panel' over a wall end panel, 'closed' against a
 * wall, the side of the recess the run sits in, or a joined run that carries the band on (as tall
 * for a top, with its own toe kick for a toe kick), otherwise 'free'. `band` is 'toeKick' or 'top'.
 */
function bandEnd(room, wall, run, side, band, settings) {
  const anchor = run.anchors?.[side];
  if (anchor === true) {
    return band === 'top' && wallEndPanelAt(room, wall, side, settings) ? 'panel' : 'closed';
  }
  if (anchor?.to === 'wall') return 'closed';
  if (anchor?.to === 'recess') return run._plane?.recessId === anchor.recessId ? 'closed' : 'free';
  if (!isJointAnchor(anchor)) return 'free';
  const boxTop = run.z + run.height;
  const carries = jointMembers(wall, anchor.jointId)
    .filter((member) => member.runId !== run.id && member.side !== side)
    .map((member) => wall.runs.find((candidate) => candidate.id === member.runId))
    .some((other) => other && (band === 'toeKick'
      ? hasToeKick(other)
      : other.z + other.height >= boxTop - EPSILON));
  return carries ? 'closed' : 'free';
}

/**
 * The bands around a run (SPEC-42): its toe kick, its top (countertop, or top mold and crown), the
 * parts below it, and the chip lines on its end panels and fillers, in elevation coordinates. The
 * canvas and the DXF both draw from it. `wall` is the resolved wall face; `scene` is runScene's.
 * At a free end a band runs past the run by its projection (a toe kick stops short by its setback);
 * over a wall end panel a top runs past the panel; a blind panel takes every band to the wall.
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
  const depths = bandDepths(settings);
  const bandStart = (past, band) => {
    if (panelStart !== null) return panelStart;
    const end = bandEnd(room, wall, run, 'left', band, settings);
    if (end === 'panel') return -past;
    return end === 'closed' ? run.x : run.x - past;
  };
  const bandFinish = (past, band) => {
    if (panelEnd !== null) return panelEnd;
    const end = bandEnd(room, wall, run, 'right', band, settings);
    if (end === 'panel') return wall.length + past;
    return end === 'closed' ? runEnd : runEnd + past;
  };
  const profile = resolveProfile(settings, room, wall);
  const toeKickHeight = run.overrides?.toeKickHeight ?? profile.toeKickHeight;
  const top = runTop(wall, run, profile);
  const boxTop = run.z + run.height;
  const topMoldX = bandStart(depths.topMoldProjection, 'top');
  const crownX = bandStart(depths.crownProjection, 'top');
  const topMold = (top.kind === 'crown' || top.kind === 'topMold') ? {
    x: topMoldX,
    z: boxTop,
    width: bandFinish(depths.topMoldProjection, 'top') - topMoldX,
    height: profile.topMoldHeight,
  } : null;
  const crown = top.kind === 'crown' ? {
    x: crownX,
    z: boxTop + profile.crownStackHeight - profile.crownHeight,
    width: bandFinish(depths.crownProjection, 'top') - crownX,
    height: profile.crownHeight,
  } : null;
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
  const toeKickPast = -Math.min(depths.toeKickSetback, run.width / 2);
  const toeKickX = bandStart(toeKickPast, 'toeKick');
  const toeKickWidth = Math.max(0, bandFinish(toeKickPast, 'toeKick') - toeKickX);
  const toeKick = hasToeKick(run) && toeKickWidth > 0 ? {
    x: toeKickX,
    z: 0,
    width: toeKickWidth,
    height: toeKickHeight,
  } : null;
  const countertopX = bandStart(depths.countertopOverhang, 'top');
  const countertop = (top.kind === 'stone' || top.kind === 'wood') ? {
    x: countertopX,
    z: boxTop,
    width: bandFinish(depths.countertopOverhang, 'top') - countertopX,
    height: top.height,
  } : null;
  return { top, toeKick, countertop, topMold, crown, bottomParts, chipLines };
}
