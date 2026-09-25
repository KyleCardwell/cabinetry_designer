import { isNestedGrid } from './grid.js';

export const MIN_CELL_SIZE = 1;

const EPSILON = 1e-6;

export function resolveTracks(tracks, length) {
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
  const autoSize = (length - fixed) / autoCount;

  return tracks.map((track, index) => (isAuto(track, index) ? autoSize : track.size));
}

function offsets(values) {
  const result = [0];
  for (const value of values) result.push(result.at(-1) + value);
  return result;
}

function axisFor(grid) {
  return grid.rows.length > 1 ? 'row' : 'col';
}

function gridRecord(grid, columnId, depth, rectangle, colSizes, rowSizes) {
  const axis = axisFor(grid);
  const { x, z, width, height } = rectangle;
  const colOffsets = offsets(colSizes);
  const rowOffsets = offsets(rowSizes);
  const tracks = axis === 'row'
    ? grid.rows.map((track, index) => ({
      id: track.id,
      start: z + height - rowOffsets[index + 1],
      end: z + height - rowOffsets[index],
      manual: track.size !== null,
    }))
    : grid.cols.map((track, index) => ({
      id: track.id,
      start: x + colOffsets[index],
      end: x + colOffsets[index + 1],
      manual: track.size !== null,
    }));

  return { id: grid.id, columnId, axis, depth, x, z, width, height, tracks };
}

function resolveGrid(grid, piece, rectangle, depth, grids) {
  const colSizes = resolveTracks(grid.cols, rectangle.width);
  const rowSizes = resolveTracks(grid.rows, rectangle.height);
  const colOffsets = offsets(colSizes);
  const rowOffsets = offsets(rowSizes);
  const leaves = [];

  grids.push(gridRecord(grid, piece.id, depth, rectangle, colSizes, rowSizes));

  for (const cell of grid.cells) {
    const x = rectangle.x + colOffsets[cell.col];
    const top = rectangle.z + rectangle.height - rowOffsets[cell.row];
    const width = colOffsets[cell.col + cell.colSpan] - colOffsets[cell.col];
    const height = rowOffsets[cell.row + cell.rowSpan] - rowOffsets[cell.row];
    const childRectangle = { x, z: top - height, width, height };

    if (isNestedGrid(cell.node)) {
      leaves.push(...resolveGrid(cell.node, piece, childRectangle, depth + 1, grids));
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
      z: top - height,
      width,
      height,
      depth: piece.depth,
      auto: track.size === null,
      ...(cell.node.blind ? { blind: { ...cell.node.blind } } : {}),
    });
  }

  return leaves;
}

export function cellPieces(run, layout) {
  if (!run.grid) return { pieces: layout.pieces, grids: [], warnings: [] };

  let replaced = false;
  const pieces = [];
  const grids = [];
  const warnings = [];

  for (const piece of layout.pieces) {
    const node = piece.role === 'item'
      ? run.grid.cells.find((candidate) => candidate.row === 0 && candidate.node.id === piece.id)?.node
      : null;
    if (!isNestedGrid(node)) {
      pieces.push(piece);
      continue;
    }

    replaced = true;
    const leaves = resolveGrid(node, piece, piece, 1, grids);
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
    }
  }

  return { pieces: replaced ? pieces : layout.pieces, grids, warnings };
}

function rangesOverlap(left, right) {
  return Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x) > EPSILON;
}

export function stackedSides(pieces, pieceId) {
  const piece = pieces.find((candidate) => candidate.id === pieceId);
  if (!piece || piece.kind !== 'cabinet') return { top: false, bottom: false };

  let top = false;
  let bottom = false;
  for (const candidate of pieces) {
    if (candidate === piece || candidate.kind !== 'cabinet' || !rangesOverlap(piece, candidate)) {
      continue;
    }
    if (Math.abs(candidate.z - (piece.z + piece.height)) <= EPSILON) top = true;
    if (Math.abs(candidate.z + candidate.height - piece.z) <= EPSILON) bottom = true;
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
