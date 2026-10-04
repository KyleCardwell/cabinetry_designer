import { bottomPartSpan, runBottomParts } from './bottoms.js';
import { CABINET_TYPE_IDS } from './constants.js';
import { resolveProfile } from './profile.js';
import { runTop } from './tops.js';

/**
 * The bands around a run (SPEC-42): its toe kick, its top (countertop, or top mold and crown), the
 * parts below it, and the chip lines on its end panels and fillers, in elevation coordinates. The
 * canvas and the DXF both draw from it. `wall` is the resolved wall face; `scene` is runScene's.
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
  // A band (toe kick, countertop, molding) runs to the wall wherever a blind
  // panel does, and keeps its own inset or overhang wherever one does not.
  const bandStart = (inset) => panelStart ?? run.x + inset;
  const bandEnd = (inset) => panelEnd ?? runEnd - inset;
  const profile = resolveProfile(settings, room, wall);
  const toeKickHeight = run.overrides?.toeKickHeight ?? profile.toeKickHeight;
  const top = runTop(wall, run, profile);
  const boxTop = run.z + run.height;
  const bandX = bandStart(0);
  const bandWidth = bandEnd(0) - bandX;
  const topMold = (top.kind === 'crown' || top.kind === 'topMold') ? {
    x: bandX,
    z: boxTop,
    width: bandWidth,
    height: profile.topMoldHeight,
  } : null;
  const crown = top.kind === 'crown' ? {
    x: bandX,
    z: boxTop + profile.crownStackHeight - profile.crownHeight,
    width: bandWidth,
    height: profile.crownHeight,
  } : null;
  const span = bottomPartSpan(
    run,
    drawnPieces,
    { start: bandStart(0), end: bandEnd(0) },
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
  const hasToeKick = !run.stack?.below
    && (run.cabinetTypeId === CABINET_TYPE_IDS.BASE
      || run.cabinetTypeId === CABINET_TYPE_IDS.TALL);
  const toeKickInset = Math.min(3, run.width / 2);
  const toeKickX = bandStart(toeKickInset);
  const toeKickWidth = Math.max(0, bandEnd(toeKickInset) - toeKickX);
  const toeKick = hasToeKick && toeKickWidth > 0 ? {
    x: toeKickX,
    z: 0,
    width: toeKickWidth,
    height: toeKickHeight,
  } : null;
  const countertopX = bandStart(-1);
  const countertop = (top.kind === 'stone' || top.kind === 'wood') ? {
    x: countertopX,
    z: boxTop,
    width: bandEnd(-1) - countertopX,
    height: top.height,
  } : null;
  return { top, toeKick, countertop, topMold, crown, bottomParts, chipLines };
}
