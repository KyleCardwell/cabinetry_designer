import { cornerCabinetShape } from './cornerCabinet.js';
import { cornerEndActive, cornerReturnPiece, cornerReturnRuns } from './corners.js';
import { wallLength } from './geometry.js';
import { runItems } from './grid.js';
import { landingsOn } from './landings.js';
import { splitOptionsForRun } from './placement.js';
import { splitRun } from './splitRun.js';
import { wallViewForRun } from './wallSides.js';

export const CORNER_KINDS = [90, 45];
export const RETURN_PIECES = ['auto', 'end_panel', 'filler', 'none'];

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
    },
  };
}

export { defaultLegA } from './corners.js';

const WARNING_MESSAGES = {
  'corner-not-in-corner': "The corner cabinet isn't anchored into a square inside corner.",
  'corner-crossed': "A run crosses the corner where the corner cabinet's return leg would go.",
  'corner-column-not-cabinet': 'The corner column must be a single cabinet.',
  'corner-column-pinned': "The corner column can't be pinned or on a layout line.",
  'corner-legs-too-short': "The corner cabinet's legs are shorter than the depths beside them.",
  'corner-doubled': 'Both runs in this corner have a corner cabinet.',
};

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
  const depthB = end.corner?.depthB
    ?? (returns.length ? Math.max(...returns.map((candidate) => candidate.depth)) : depthA);
  const kind = end.corner?.kind ?? 90;
  const geometry = legA === null ? null : cornerCabinetShape({ kind, legA, legB, depthA, depthB });
  const warnings = [];
  const warn = (warningCode) => warnings.push({ code: warningCode, side, message: WARNING_MESSAGES[warningCode] });
  if (code) warn(code);
  if (!item || item.kind !== 'cabinet' || item.grid) warn('corner-column-not-cabinet');
  if (item?.pin || item?.attach) warn('corner-column-pinned');
  if ((legA !== null && legA <= depthB) || (legB !== null && legB <= depthA)) {
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
  return {
    side, active, kind, legA, legB, depthA, depthB,
    returnPiece: end.corner?.returnPiece ?? 'auto',
    returnSide, reach: legB + returnSide.width,
    columnId: piece?.id ?? null,
    corner, cornerX, dir: side === 'left' ? 1 : -1,
    shape: geometry?.errors ? null : geometry,
    warnings,
  };
}

/** Warnings from both corner ends of a run, sharing its already computed layout. */
export function cornerEndWarnings(room, wall, run, settings, layout = null) {
  return ['left', 'right'].flatMap((side) => cornerEnd(room, wall, run, side, settings, layout)?.warnings ?? []);
}
