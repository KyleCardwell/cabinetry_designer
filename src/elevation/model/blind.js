import { anchoredToCorner, cornerForRunSide, frontDepth } from './corners.js';
import { wallLength } from './geometry.js';
import {
  endCornerAnglesForRun,
  endMinWidthsForRun,
  pinTargetsForRun,
} from './room.js';
import { splitRun } from './splitRun.js';

const SIDES = ['left', 'right'];
const WIDTH_EPSILON = 1e-6;

function wallSideOfRun(run) {
  return run.wallSide === 'back' ? 'back' : 'front';
}

function standardLayout(room, wall, run, settings) {
  return splitRun(run, settings, {
    endMinWidths: endMinWidthsForRun(room, wall, run, settings),
    endCornerAngles: endCornerAnglesForRun(room, wall, run),
    pinTargets: pinTargetsForRun(run, wall, wallLength(wall), settings),
  });
}

function outerCabinet(pieces, side) {
  if (side === 'left') {
    return pieces.find((piece) => piece.kind === 'cabinet') ?? null;
  }
  return pieces.findLast((piece) => piece.kind === 'cabinet') ?? null;
}

function cornerNeighborRuns(room, wall, run, side) {
  const corner = cornerForRunSide(room, wall, run, side);
  if (corner.type !== 'inside') return { corner, runs: [] };

  const neighbor = room.walls.find((candidate) => candidate.id === corner.neighborWallId);
  const runs = neighbor?.runs.filter((neighborRun) => (
    wallSideOfRun(neighborRun) === corner.neighborWallSide
    && anchoredToCorner(neighborRun.anchors?.[corner.neighborSide], corner)
    && neighborRun.height > 0
  )) ?? [];
  return { corner, runs };
}

/** Merge z-ranges and report whether they cover [z, top] with no gap. */
export function isBlindCovered(ranges, z, top) {
  if (ranges.length === 0) return false;

  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let [start, end] = sorted[0];

  for (const [nextStart, nextEnd] of sorted.slice(1)) {
    if (nextStart <= end) {
      end = Math.max(end, nextEnd);
      continue;
    }
    if (start <= z && end >= top) return true;
    [start, end] = [nextStart, nextEnd];
  }

  return start <= z && end >= top;
}

/** Return z-ranges of neighbouring runs that die into this run's corner. */
export function coveredRanges(room, wall, run, side, settings) {
  void settings;
  return cornerNeighborRuns(room, wall, run, side).runs
    .map((neighborRun) => [neighborRun.z, neighborRun.z + neighborRun.height]);
}

/** How far the deepest overlapping neighbour reaches along this wall at a corner. */
export function panelDepth(room, wall, run, side, settings) {
  const { corner, runs } = cornerNeighborRuns(room, wall, run, side);
  if (corner.type !== 'inside') return 0;
  const sine = Math.sin(corner.angle * Math.PI / 180);
  if (Math.abs(sine) < 1e-9) return 0;

  return runs.reduce((depth, neighborRun) => {
    const overlap = Math.min(neighborRun.z + neighborRun.height, run.z + run.height)
      - Math.max(neighborRun.z, run.z);
    if (overlap <= WIDTH_EPSILON) return depth;
    return Math.max(depth, frontDepth(neighborRun, settings) / sine);
  }, 0);
}

/** Return blind cabinet overlay geometry and diagnostics for a run. */
export function blindEntries(room, wall, run, settings, layout = null) {
  const resolvedLayout = layout ?? standardLayout(room, wall, run, settings);
  const entries = [];
  const warnings = [];
  const cornerXs = { left: 0, right: wallLength(wall) };

  for (const side of SIDES) {
    const boxWidth = run.ends[side]?.type === 'blind' ? run.blind?.[side] : null;
    if (!(boxWidth > 0)) continue;

    const piece = outerCabinet(resolvedLayout.pieces, side);
    if (!piece) continue;

    const extension = Math.max(0, boxWidth - piece.width);
    const cornerX = cornerXs[side];
    const boxX = side === 'left'
      ? piece.x + piece.width - boxWidth
      : piece.x;
    const covered = isBlindCovered(
      coveredRanges(room, wall, run, side, settings),
      run.z,
      run.z + run.height,
    );
    const endPieceId = `${run.id}:${side}`;
    const depth = panelDepth(room, wall, run, side, settings);
    const endPiece = resolvedLayout.pieces.find(({ id }) => id === endPieceId);
    const hasEndPiece = Boolean(endPiece);
    const width = depth > WIDTH_EPSILON && endPiece ? depth + endPiece.width : 0;
    let panel = !covered && width > WIDTH_EPSILON
      ? { x: side === 'left' ? cornerX : cornerX - width, width }
      : null;

    if (extension <= WIDTH_EPSILON) {
      warnings.push({ code: 'blind-not-past', side });
    }
    if (!covered && depth > WIDTH_EPSILON && !hasEndPiece) {
      warnings.push({ code: 'blind-needs-end', side });
    }

    entries.push({
      side,
      pieceId: piece.id,
      boxWidth,
      boxX,
      extension,
      visibleWidth: piece.width,
      cornerX,
      covered,
      endPieceId: hasEndPiece ? endPieceId : null,
      panel,
    });
  }

  return { entries, warnings };
}

/** Return part-width overrides introduced by blind cabinet geometry. */
export function blindPartWidths(room, wall, run, settings, layout = null) {
  const widths = new Map();
  const { entries } = blindEntries(room, wall, run, settings, layout);
  for (const entry of entries) {
    widths.set(entry.pieceId, entry.boxWidth);
    if (!entry.endPieceId) continue;
    widths.set(entry.endPieceId, entry.panel
      ? entry.panel.width
      : run.endFiller?.[entry.side]?.width ?? settings.blindFillerWidth);
  }
  return widths;
}
