import { cornerCabinetShape, cornerFaceLayout } from './cornerCabinet.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { sheetThickness } from './doorStyles.js';
import {
  cornerDepthBAuto, cornerEndActive, cornerOwnersAt, cornerReturnFootprint, cornerReturnPiece, cornerReturnRuns,
  faceFrontOffset,
} from './corners.js';
import { wallLength } from './geometry.js';
import { runItems } from './grid.js';
import { landingsOn } from './landings.js';
import { verticalStart } from './overlap.js';
import { splitOptionsForRun } from './placement.js';
import { splitRun } from './splitRun.js';
import { resolveStyle, typeStandardReveals } from './styles.js';
import { wallSideOf, wallSideView, wallViewForRun } from './wallSides.js';

export const CORNER_KINDS = [90, 45];
export const RETURN_PIECES = ['auto', 'end_panel', 'filler', 'none'];
export const LEG_B_FACES = ['door', 'panel'];

/** Replace an end with only the stored corner choices, defaulting missing parts. */
export function normalizeCornerEnd(end) {
  return {
    type: 'corner',
    width: null,
    corner: {
      kind: end.corner?.kind ?? 90,
      legB: end.corner?.legB ?? null,
      depthB: end.corner?.depthB ?? null,
      returnPiece: end.corner?.returnPiece ?? 'auto',
      returnWidth: end.corner?.returnWidth ?? null,
      doors: end.corner?.doors ?? null,
      legBFace: end.corner?.legBFace ?? null,
    },
  };
}

export { cornerDepthBAuto, defaultLegA } from './corners.js';

const WARNING_MESSAGES = {
  'corner-not-in-corner': "The corner cabinet isn't anchored into a square inside corner.",
  'corner-crossed': "A run crosses the corner where the corner cabinet's return leg would go.",
  'corner-column-not-cabinet': 'The corner column must be a single cabinet.',
  'corner-column-pinned': "The corner column can't be pinned or on a layout line.",
  'corner-legs-too-short': "The corner cabinet's legs are shorter than the depths beside them.",
  'corner-door-clips-side': "The corner door reaches behind a cabinet side's front edge; check the legs and depths.",
  'corner-doubled': 'Both runs in this corner have a corner cabinet.',
};

/** The framed diagonal's front line, bounded by its two miter points (CC6). */
function framedDiagonalLayout(shape, thickness, lap, fit) {
  const { from: a, to: b, normal } = shape.faces[0];
  const u = [(b[0] - a[0]) / shape.trueWidth, (b[1] - a[1]) / shape.trueWidth];
  const shiftA = thickness * Math.tan(shape.miters.a * Math.PI / 180);
  const shiftB = thickness * Math.tan(shape.miters.b * Math.PI / 180);
  const pa = a.map((value, i) => value + thickness * normal[i] + shiftA * u[i]);
  const pb = b.map((value, i) => value + thickness * normal[i] - shiftB * u[i]);
  const span = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
  return {
    feet: { a: pa, b: pb }, span, reveal: 2 * lap,
    ordered: span - 4 * lap - 2 * fit,
    shown: { a: span * shape.shown.a / shape.trueWidth, b: span * shape.shown.b / shape.trueWidth },
  };
}

/** Resolve the owner column, return dimensions and geometry, including inactive corner ends. */
export function cornerEnd(room, wall, run, side, settings, layout = null) {
  const end = run.ends?.[side];
  if (end?.type !== 'corner') return null;

  const view = wallViewForRun(wall, run);
  const { corner, returnWall, runs: returns } = cornerReturnRuns(room, view, run, side);
  const { active, code } = cornerEndActive(room, view, run, side);
  const resolvedLayout = layout ?? splitRun(run, settings, splitOptionsForRun(room, view, run, settings));
  const items = runItems(run);
  const item = side === 'left' ? items[0] : items.at(-1);
  const piece = item ? resolvedLayout.pieces.find((candidate) => (
    candidate.id === item.id && candidate.kind === 'cabinet'
  )) : null;
  const legA = piece?.width ?? null;
  const legB = end.corner?.legB ?? legA;
  const depthA = run.depth;
  const returnSide = cornerReturnPiece(room, view, run, side, settings);
  const depthB = end.corner?.depthB ?? cornerDepthBAuto(room, view, run, side);
  const deepestReturn = returns.reduce((deepest, candidate) => (
    !deepest || candidate.depth > deepest.depth ? candidate : deepest
  ), null);
  // SPEC-CC6: a framed corner's faces sit on the frame's front; a Euro return beside it doesn't count.
  const framed = active && Boolean(run._frame);
  const offsetA = framed ? run._frame.thickness : faceFrontOffset(run, settings);
  const offsetB = framed ? deepestReturn?._frame?.thickness ?? offsetA
    : deepestReturn ? faceFrontOffset(deepestReturn, settings) : offsetA;
  const doors = end.corner?.doors ?? settings.cornerDoors ?? DEFAULT_SETTINGS.cornerDoors;
  const kind = end.corner?.kind ?? 90;
  const construction = run._frame ? 'frame' : 'euro';
  const sideThickness = construction === 'euro' ? sheetThickness(settings) : 0;
  const geometry = legA === null ? null : cornerCabinetShape({
    kind, legA, legB, depthA, depthB, construction, sideThickness,
  });
  const warnings = [];
  const warn = (warningCode) => warnings.push({ code: warningCode, side, message: WARNING_MESSAGES[warningCode] });
  if (code) warn(code);
  if (!item || item.kind !== 'cabinet' || item.grid) warn('corner-column-not-cabinet');
  if (item?.pin || item?.attach) warn('corner-column-pinned');
  if (geometry?.errors || (legA !== null && legA <= depthB) || (legB !== null && legB <= depthA)) {
    warn('corner-legs-too-short');
  }
  if (active && returns.some((candidate) => (
    cornerEndActive(room, returnWall, candidate, corner.neighborSide).active
  ))) warn('corner-doubled');

  let cornerX = null;
  if (active) {
    if (run.anchors?.[side] === true) cornerX = side === 'left' ? 0 : wallLength(view);
    else {
      const landing = landingsOn(room, view).find((entry) => entry.wallId === run.anchors[side].wallId);
      cornerX = landing ? landing[side === 'left' ? 'b' : 'a'] : null;
    }
  }
  const result = {
    side, active, kind, construction, legA, legB, depthA, depthB, offsetA, offsetB, doors,
    returnPiece: end.corner?.returnPiece ?? 'auto',
    returnSide, reach: legB + returnSide.width,
    columnId: piece?.id ?? null,
    corner, cornerX, dir: side === 'left' ? 1 : -1,
    shape: geometry?.errors ? null : geometry,
    warnings,
  };
  const framedFaces = framed && !(run._frame.bead > 0);
  const frame = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame };
  result.faceLayout = result.shape ? cornerFaceLayout({
    ...result,
    sideThickness,
    doorThickness: offsetA - settings.bumperThickness,
    // Both framed legs stop at the frame opening, independently of the Euro long-door choice.
    doors: framedFaces ? 'equal' : doors,
    sideReveal: typeStandardReveals(resolveStyle(settings, room, run, item), run.cabinetTypeId, settings)[side === 'left' ? 'right' : 'left'],
    gap: settings.cornerDoorGap ?? DEFAULT_SETTINGS.cornerDoorGap,
    diagonalReveal: settings.cornerDiagonalReveal ?? DEFAULT_SETTINGS.cornerDiagonalReveal,
  }) : null;
  if (result.shape && framedFaces && kind === 45) {
    result.faceLayout = framedDiagonalLayout(result.shape, offsetA, frame.stile,
      settings.profiledFit?.edge ?? DEFAULT_SETTINGS.profiledFit.edge);
  }
  if (Object.values(result.faceLayout?.sideClearance ?? {}).some((clearance) => (
    clearance !== null && clearance < -1e-6
  ))) warn('corner-door-clips-side');
  return result;
}

/** Warnings from both corner ends of a run, sharing its already computed layout. */
export function cornerEndWarnings(room, wall, run, settings, layout = null) {
  return ['left', 'right'].flatMap((side) => cornerEnd(room, wall, run, side, settings, layout)?.warnings ?? []);
}

function overlapsReturn(footprint, run) {
  return Math.min(footprint.x1, run.x + run.width) - Math.max(footprint.x0, run.x) > 1e-6
    && Math.min(footprint.z1, run.z + run.height) - Math.max(footprint.z0, verticalStart(run)) > 0;
}

/** Return-end choices and return-leg overlaps, reported on both affected runs. */
export function cornerReturnWarnings(room, wall, run, settings) {
  const warnings = [];
  const sides = ['left', 'right'];
  for (const side of sides) {
    if (['end_panel', 'blind'].includes(run.ends?.[side]?.type)
      && cornerOwnersAt(room, wall, run, side).length) {
      warnings.push({
        code: 'corner-return-end', side,
        message: 'A run dying into a corner cabinet takes a filler or nothing at that end.',
      });
    }
    const footprint = cornerReturnFootprint(room, wall, run, side, settings);
    if (!footprint) continue;
    const returnWall = room.walls.find((candidate) => candidate.id === footprint.wallId);
    for (const other of wallSideView(returnWall, footprint.wallSide).runs) {
      if (overlapsReturn(footprint, other)) warnings.push({
        code: 'corner-overlap', side, runId: other.id,
        message: "A run on the return wall sits where the corner cabinet's return leg goes.",
      });
    }
  }
  for (const ownerWall of room.walls ?? []) {
    for (const owner of ownerWall.runs) {
      for (const side of sides) {
        const footprint = cornerReturnFootprint(room, ownerWall, owner, side, settings);
        if (footprint?.wallId === wall.id && footprint.wallSide === wallSideOf(run)
          && overlapsReturn(footprint, run)) warnings.push({
          code: 'corner-overlap', ownerRunId: owner.id,
          message: "This run sits where a corner cabinet's return leg goes.",
        });
      }
    }
  }
  return warnings;
}
