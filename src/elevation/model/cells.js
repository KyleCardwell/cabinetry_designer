import { isNestedGrid } from './grid.js';

export const MIN_CELL_SIZE = 1;

const EPSILON = 1e-6;

export function resolveTracks(tracks, length, gaps = []) {
  if (tracks.length === 0) return [];

  const anyAuto = tracks.some((track) => track.size === null);
  const last = tracks.length - 1;
  const isAuto = (track, index) => track.size === null || (!anyAuto && index === last);
  const fixed = tracks.reduce(
    (total, track, index) => total + (isAuto(track, index) ? 0 : track.size),
    0,
  );
  const autoCount = tracks.reduce(
    (total, track, index) => total + (isAuto(track, index) ? 1 : 0),
    0,
  );
  const spacing = gaps.reduce((total, gap) => total + gap, 0);
  const autoSize = (length - fixed - spacing) / autoCount;

  return tracks.map((track, index) => (isAuto(track, index) ? autoSize : track.size));
}

/** Where each track starts along its axis, each track's gap after it. */
function trackStarts(sizes, gaps) {
  const starts = [];
  let cursor = 0;
  sizes.forEach((size, index) => {
    starts.push(cursor);
    cursor += size + (gaps[index] ?? 0);
  });
  return starts;
}

/** What a cell covers from track `first` over `count` tracks, the gaps between them included. */
function spanLength(starts, sizes, first, count) {
  const last = first + count - 1;
  return starts[last] + sizes[last] - starts[first];
}

function isBoxNode(node) {
  return isNestedGrid(node) || node.kind === 'cabinet';
}

/**
 * The gap after each track (SPEC-36): its own `gap`, else the run's seam gap between two columns
 * of cabinets. Rows take only their own. Never after the last track.
 */
export function trackGaps(grid, key, seamGap = 0) {
  const tracks = grid[key];
  const axis = key === 'cols' ? 'col' : 'row';
  const span = key === 'cols' ? 'colSpan' : 'rowSpan';
  return tracks.map((track, index) => {
    if (index === tracks.length - 1) return 0;
    if (track.gap !== undefined) return track.gap;
    if (key !== 'cols' || !(seamGap > 0)) return 0;
    const touching = grid.cells.filter((cell) => cell[axis] + cell[span] - 1 === index
      || cell[axis] === index + 1);
    return touching.every((cell) => isBoxNode(cell.node)) ? seamGap : 0;
  });
}

/** How far apart two boxes can sit and still meet at a seam: the thickest gap. */
export function gapReach(gaps) {
  return gaps.reduce((reach, gap) => Math.max(reach, Math.min(gap.width, gap.height)), 0);
}

function axisLayout(grid, key, length, seamGap) {
  const gaps = trackGaps(grid, key, seamGap);
  const sizes = resolveTracks(grid[key], length, gaps);
  return { gaps, sizes, starts: trackStarts(sizes, gaps) };
}

function axisFor(grid) {
  return grid.rows.length > 1 ? 'row' : 'col';
}

function gridRecord(grid, columnId, depth, rectangle, cols, rows) {
  const axis = axisFor(grid);
  const { x, z, width, height } = rectangle;
  const tracks = axis === 'row'
    ? grid.rows.map((track, index) => ({
      id: track.id,
      start: z + height - rows.starts[index] - rows.sizes[index],
      end: z + height - rows.starts[index],
      manual: track.size !== null,
    }))
    : grid.cols.map((track, index) => ({
      id: track.id,
      start: x + cols.starts[index],
      end: x + cols.starts[index] + cols.sizes[index],
      manual: track.size !== null,
    }));

  return { id: grid.id, columnId, axis, depth, x, z, width, height, tracks };
}

function resolveGrid(grid, piece, rectangle, depth, grids, gaps, seamGap) {
  const cols = axisLayout(grid, 'cols', rectangle.width, seamGap);
  const rows = axisLayout(grid, 'rows', rectangle.height, seamGap);
  const top = rectangle.z + rectangle.height;
  const leaves = [];

  grids.push(gridRecord(grid, piece.id, depth, rectangle, cols, rows));
  cols.gaps.forEach((gap, index) => {
    if (gap > 0) {
      gaps.push({
        x: rectangle.x + cols.starts[index] + cols.sizes[index], z: rectangle.z, width: gap, height: rectangle.height,
      });
    }
  });
  rows.gaps.forEach((gap, index) => {
    if (gap > 0) {
      gaps.push({
        x: rectangle.x, z: top - rows.starts[index] - rows.sizes[index] - gap, width: rectangle.width, height: gap,
      });
    }
  });

  for (const cell of grid.cells) {
    const x = rectangle.x + cols.starts[cell.col];
    const cellTop = top - rows.starts[cell.row];
    const width = spanLength(cols.starts, cols.sizes, cell.col, cell.colSpan);
    const height = spanLength(rows.starts, rows.sizes, cell.row, cell.rowSpan);
    const childRectangle = { x, z: cellTop - height, width, height };

    if (isNestedGrid(cell.node)) {
      leaves.push(...resolveGrid(cell.node, piece, childRectangle, depth + 1, grids, gaps, seamGap));
      continue;
    }

    const axis = axisFor(grid);
    const track = axis === 'row' ? grid.rows[cell.row] : grid.cols[cell.col];
    leaves.push({
      id: cell.node.id,
      kind: cell.node.kind,
      role: 'item',
      cabinetTypeId: piece.cabinetTypeId,
      columnId: piece.id,
      x,
      z: cellTop - height,
      width,
      height,
      depth: cell.node.depth ?? piece.depth,
      auto: track.size === null,
      ...(cell.node.align ? { align: cell.node.align } : {}),
      ...(cell.node.doors ? { doors: cell.node.doors } : {}),
      ...(cell.node.blind ? { blind: { ...cell.node.blind } } : {}),
      ...(cell.node.shelves ? { shelves: { ...cell.node.shelves } } : {}),
      ...(cell.node.extend ? { extend: cell.node.extend } : {}),
    });
  }

  return leaves;
}

/** Gaps between the run's top-level pieces (SPEC-36). */
function rootGaps(run, layout) {
  const gaps = [];
  layout.pieces.forEach((piece, index) => {
    const next = layout.pieces[index + 1];
    const gap = next ? next.x - piece.x - piece.width : 0;
    if (gap > EPSILON) gaps.push({ x: piece.x + piece.width, z: run.z, width: gap, height: run.height });
  });
  return gaps;
}

export function cellPieces(run, layout) {
  const gaps = rootGaps(run, layout);
  if (!run.grid) return { pieces: layout.pieces, grids: [], warnings: [], gaps };

  let replaced = false;
  const pieces = [];
  const grids = [];
  const warnings = [];
  const seamGap = run._seamGap ?? run.seamGap ?? 0;

  for (const piece of layout.pieces) {
    const node = piece.role === 'item'
      ? run.grid.cells.find((candidate) => candidate.row === 0 && candidate.node.id === piece.id)?.node
      : null;
    if (!isNestedGrid(node)) {
      pieces.push(piece);
      continue;
    }

    replaced = true;
    const leaves = resolveGrid(node, piece, piece, 1, grids, gaps, seamGap);
    leaves.sort((left, right) => (
      Math.abs(left.x - right.x) > EPSILON ? left.x - right.x : left.z - right.z
    ));
    pieces.push(...leaves);
    for (const leaf of leaves) {
      if (leaf.width < MIN_CELL_SIZE - EPSILON || leaf.height < MIN_CELL_SIZE - EPSILON) {
        warnings.push({
          code: 'cell-too-small',
          pieceId: leaf.id,
          message: 'Cell is smaller than 1 inch.',
        });
      }
      if (leaf.depth > piece.depth + EPSILON) {
        warnings.push({
          code: 'cell-too-deep',
          pieceId: leaf.id,
          message: 'Cell is deeper than its run.',
        });
      }
    }
  }

  return { pieces: replaced ? pieces : layout.pieces, grids, warnings, gaps };
}

function rangesOverlap(left, right) {
  return Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x) > EPSILON;
}

export function stackedSides(pieces, pieceId, reach = 0) {
  const piece = pieces.find((candidate) => candidate.id === pieceId);
  if (!piece || piece.kind !== 'cabinet') return { top: false, bottom: false };

  let top = false;
  let bottom = false;
  for (const candidate of pieces) {
    if (candidate === piece || candidate.kind !== 'cabinet' || !rangesOverlap(piece, candidate)) {
      continue;
    }
    const above = candidate.z - piece.z - piece.height;
    const below = piece.z - candidate.z - candidate.height;
    if (above >= -EPSILON && above <= reach + EPSILON) top = true;
    if (below >= -EPSILON && below <= reach + EPSILON) bottom = true;
  }
  return { top, bottom };
}

export function blindCellWidths(pieces, columns, entries) {
  const result = new Map();
  const columnsById = new Map(columns.map((column) => [column.id, column]));

  for (const piece of pieces) {
    if (!piece.columnId) continue;
    const column = columnsById.get(piece.columnId);
    if (!column) continue;

    for (const entry of entries) {
      const boxWidth = piece.blind?.[entry.side];
      if (entry.pieceId !== piece.columnId || !(boxWidth > 0)) continue;
      const touches = entry.side === 'left'
        ? Math.abs(piece.x - column.x) <= EPSILON
        : entry.side === 'right'
          && Math.abs(piece.x + piece.width - column.x - column.width) <= EPSILON;
      if (touches) result.set(piece.id, piece.width + boxWidth - column.width);
    }
  }

  return result;
}

function overlapsVertically(a, b) {
  return Math.min(a.z + a.height, b.z + b.height) - Math.max(a.z, b.z) > EPSILON;
}

/** Whether a panel cell sits against each side of a piece (REV-005/006 inside a split). */
export function cellCaptureSides(pieces, pieceId) {
  const piece = pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) return { left: false, right: false };
  const panels = pieces.filter((candidate) => (
    candidate !== piece && candidate.kind === 'panel'
    && panelOrientation(candidate) === 'side' && candidate.doors !== 'cover'
    && overlapsVertically(candidate, piece)));
  return {
    left: panels.some((panel) => Math.abs(panel.x + panel.width - piece.x) <= EPSILON),
    right: panels.some((panel) => Math.abs(panel.x - piece.x - piece.width) <= EPSILON),
  };
}

/** A panel's orientation from its thinnest dimension: 'side', 'top' or 'back'. */
export function panelOrientation(piece) {
  if (piece?.kind !== 'panel') return null;
  const thinnest = Math.min(piece.width, piece.height, piece.depth);
  if (piece.width === thinnest) return 'side';
  if (piece.height === thinnest) return 'top';
  return 'back';
}

/** A shelves cell's parts: its back panel (if any), then each shelf bottom up, evenly spaced. */
export function shelfParts(piece, settings) {
  if (piece?.kind !== 'shelves' || !piece.shelves) return [];
  const { count, back } = piece.shelves;
  const thickness = settings.floatingShelfThickness;
  const backThickness = back ? settings.endPanelThickness : 0;
  const gap = (piece.height - count * thickness) / (count + 1);
  const parts = [];
  if (back) {
    parts.push({ id: `${piece.id}:back`, kind: 'panel', x: piece.x, z: piece.z,
      width: piece.width, height: piece.height, depth: backThickness });
  }
  for (let index = 1; index <= count; index += 1) {
    parts.push({ id: `${piece.id}:shelf-${index}`, kind: 'shelf', x: piece.x,
      z: piece.z + index * gap + (index - 1) * thickness, width: piece.width,
      height: thickness, depth: piece.depth - backThickness });
  }
  return parts;
}

/** Pieces as parts: a shelves cell becomes its shelves (and back); a void has none. */
export function partPieces(pieces, settings) {
  return pieces.flatMap((piece) => {
    if (piece.kind === 'shelves') return shelfParts(piece, settings);
    return piece.kind === 'void' ? [] : [piece];
  });
}

/** A cell's true depth: its own, else a flush side/top panel reaches the door face, else the run's box depth. */
export function cellDepth(piece, leaf, runDepth, settings) {
  if (leaf?.depth !== undefined) return leaf.depth;
  const orientation = panelOrientation(piece);
  if (piece.kind === 'panel' && orientation !== 'back' && leaf?.doors !== 'cover') {
    return runDepth + settings.bumperThickness + settings.doorThickness;
  }
  return runDepth;
}

/** How thick a covered panel is on each side of a piece (0 = not covered). */
export function coveredSides(pieces, pieceId) {
  const result = { top: 0, bottom: 0, left: 0, right: 0 };
  const piece = pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) return result;
  for (const panel of pieces) {
    if (panel === piece || panel.kind !== 'panel' || panel.doors !== 'cover') continue;
    const orientation = panelOrientation(panel);
    if (orientation === 'side' && overlapsVertically(panel, piece)) {
      if (Math.abs(panel.x + panel.width - piece.x) <= EPSILON) result.left = panel.width;
      if (Math.abs(panel.x - piece.x - piece.width) <= EPSILON) result.right = panel.width;
    }
    if (orientation === 'top' && rangesOverlap(panel, piece)) {
      if (Math.abs(panel.z - piece.z - piece.height) <= EPSILON) result.top = panel.height;
      if (Math.abs(panel.z + panel.height - piece.z) <= EPSILON) result.bottom = panel.height;
    }
  }
  return result;
}

/** Which sides of a piece a door can hinge against: a filler, an end panel or a flush side panel. */
export function hingeStops(pieces, pieceId) {
  const piece = pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) return { left: false, right: false };
  const stops = pieces.filter((candidate) => candidate !== piece
    && overlapsVertically(candidate, piece)
    && (candidate.kind === 'filler' || candidate.kind === 'end_panel'
      || (candidate.kind === 'panel' && panelOrientation(candidate) === 'side'
        && candidate.doors !== 'cover')));
  return {
    left: stops.some((stop) => Math.abs(stop.x + stop.width - piece.x) <= EPSILON),
    right: stops.some((stop) => Math.abs(stop.x - piece.x - piece.width) <= EPSILON),
  };
}
