export const LEAF_KINDS = ['cabinet', 'filler'];
export const SIZE_MODES = ['auto', 'manual', 'solved'];

function itemParts(item) {
  const leaf = {};
  for (const [key, value] of Object.entries(item)) {
    if (!['width', 'pin', 'absorb', 'blind', 'grid'].includes(key)) leaf[key] = value;
  }
  const col = { id: `${item.id}:col`, size: item.width,
    sizeMode: item.width === null ? 'auto' : 'manual' };
  if (item.pin !== undefined) col.pin = item.pin;
  if (item.absorb !== undefined) col.absorb = item.absorb;
  const node = item.grid ?? leaf;
  return { col, node };
}

function rootCell(grid, col) {
  return grid.cells.find((cell) => cell.col === col && cell.row === 0);
}

function cellsFromParts(parts) {
  return parts.map(({ node }, col) => ({ col, row: 0, colSpan: 1, rowSpan: 1, node }));
}

function restoreBlind(grid, blind) {
  if (!blind) return grid;
  let next = grid;
  if (blind.left != null) next = setGridBlind(next, 'left', blind.left);
  if (blind.right != null) next = setGridBlind(next, 'right', blind.right);
  return next;
}

function setKey(object, key, value) {
  if (value !== undefined) {
    if (Object.hasOwn(object, key) && Object.is(object[key], value)) return object;
    return { ...object, [key]: value };
  }
  if (!Object.hasOwn(object, key)) return object;
  const next = { ...object };
  delete next[key];
  return next;
}

export function isNestedGrid(node) {
  return node != null && typeof node === 'object' && 'cols' in node;
}

function orderedCells(grid) {
  return [...grid.cells].sort((a, b) => a.row - b.row || a.col - b.col);
}

/** Every leaf under a node, depth first; a grid's cells in (row, col) order. Same references. */
export function gridLeaves(node) {
  if (!isNestedGrid(node)) return [node];
  return orderedCells(node).flatMap((cell) => gridLeaves(cell.node));
}

/** The leaves touching a node's left or right edge, in (row, col) order. A leaf → [leaf]. */
export function edgeLeaves(node, side) {
  if (!isNestedGrid(node)) return [node];
  return orderedCells(node)
    .filter((cell) => (side === 'left'
      ? cell.col === 0
      : cell.col + cell.colSpan === node.cols.length))
    .flatMap((cell) => edgeLeaves(cell.node, side));
}

function cloneTrack(track) {
  return track.pin != null && typeof track.pin === 'object'
    ? { ...track, pin: { ...track.pin } }
    : { ...track };
}

function cloneNode(node) {
  if (isNestedGrid(node)) return cloneGrid(node);
  return node.blind ? { ...node, blind: { ...node.blind } } : { ...node };
}

function mirrorNode(node) {
  if (isNestedGrid(node)) return mirrorGrid(node);
  if (!node.blind) return { ...node };
  const { left, right } = node.blind;
  const blind = {
    ...(right !== undefined ? { left: right } : {}),
    ...(left !== undefined ? { right: left } : {}),
  };
  const copy = { ...node };
  if (Object.keys(blind).length) copy.blind = blind;
  else delete copy.blind;
  return copy;
}

function validTrack(track) {
  if (track == null || typeof track !== 'object' || typeof track.id !== 'string') return false;
  const validSize = track.size === null
    || (typeof track.size === 'number' && Number.isFinite(track.size) && track.size >= 0);
  const validGap = track.gap === undefined
    || (typeof track.gap === 'number' && Number.isFinite(track.gap) && track.gap >= 0);
  return validSize && validGap && SIZE_MODES.includes(track.sizeMode)
    && ((track.sizeMode === 'auto') === (track.size === null));
}

export function gridFromItems(runId, items, blind) {
  const parts = items.map(itemParts);
  const grid = {
    id: `${runId}:grid`,
    cols: parts.map(({ col }) => col),
    rows: [{ id: `${runId}:row`, size: null, sizeMode: 'auto' }],
    cells: cellsFromParts(parts),
  };
  return restoreBlind(grid, blind);
}

export function rootItems(grid) {
  return grid.cols.map((col, index) => {
    const node = rootCell(grid, index).node;
    let item;
    if (isNestedGrid(node)) {
      item = { id: node.id, kind: 'cabinet', grid: node, width: col.size };
    } else {
      const leaf = { ...node };
      delete leaf.blind;
      item = { ...leaf, width: col.size };
    }
    if (col.pin !== undefined) item.pin = col.pin;
    if (col.absorb !== undefined) item.absorb = col.absorb;
    return item;
  });
}

export function runItems(run) {
  return run.items ?? (run.grid ? rootItems(run.grid) : []);
}

export function runBlind(run) {
  if (run.blind != null) return run.blind;
  if (!run.grid || run.grid.cols.length === 0) return undefined;
  const left = edgeLeaves(rootCell(run.grid, 0).node, 'left')
    .find((leaf) => leaf.blind?.left != null)?.blind.left;
  const right = edgeLeaves(rootCell(run.grid, run.grid.cols.length - 1).node, 'right')
    .find((leaf) => leaf.blind?.right != null)?.blind.right;
  if (left == null && right == null) return undefined;
  return { left: left ?? null, right: right ?? null };
}

function setNodeBlind(node, side, width, validWidth) {
  if (!isNestedGrid(node)) {
    const blind = { ...node.blind };
    if (validWidth) {
      if (Object.is(blind[side], width)) return node;
      blind[side] = width;
    } else {
      if (!Object.hasOwn(blind, side)) return node;
      delete blind[side];
    }
    const next = { ...node };
    if (Object.keys(blind).length) next.blind = blind;
    else delete next.blind;
    return next;
  }
  let changed = false;
  const cells = node.cells.map((cell) => {
    const touches = side === 'left'
      ? cell.col === 0
      : cell.col + cell.colSpan === node.cols.length;
    if (!touches) return cell;
    const child = setNodeBlind(cell.node, side, width, validWidth);
    if (child === cell.node) return cell;
    changed = true;
    return { ...cell, node: child };
  });
  return changed ? { ...node, cells } : node;
}

export function setGridBlind(grid, side, width) {
  if (grid.cols.length === 0) return grid;
  const col = side === 'left' ? 0 : grid.cols.length - 1;
  const cellIndex = grid.cells.findIndex((cell) => cell.col === col && cell.row === 0);
  if (cellIndex < 0) return grid;
  const cell = grid.cells[cellIndex];
  const validWidth = typeof width === 'number' && Number.isFinite(width) && width > 0;
  const node = setNodeBlind(cell.node, side, width, validWidth);
  if (node === cell.node) return grid;
  const cells = [...grid.cells];
  cells[cellIndex] = { ...cell, node };
  return { ...grid, cells };
}

function mapLeaves(node, fn) {
  if (!isNestedGrid(node)) return fn(node);
  let changed = false;
  const cells = node.cells.map((cell) => {
    const child = mapLeaves(cell.node, fn);
    if (child === cell.node) return cell;
    changed = true;
    return { ...cell, node: child };
  });
  return changed ? { ...node, cells } : node;
}

function withBlindSide(leaf, side, width) {
  if (width === null) {
    if (!leaf.blind || !Object.hasOwn(leaf.blind, side)) return leaf;
    const blind = { ...leaf.blind };
    delete blind[side];
    const next = { ...leaf };
    if (Object.keys(blind).length) next.blind = blind;
    else delete next.blind;
    return next;
  }
  if (Object.is(leaf.blind?.[side], width)) return leaf;
  return { ...leaf, blind: { ...leaf.blind, [side]: width } };
}

function outerNode(grid, side) {
  if (grid.cols.length === 0) return null;
  return rootCell(grid, side === 'left' ? 0 : grid.cols.length - 1)?.node ?? null;
}

function edgeIds(grid, side) {
  const node = outerNode(grid, side);
  return new Set(node ? edgeLeaves(node, side).map((leaf) => leaf.id) : []);
}

/**
 * Round 34: after a structural edit, each leaf still on an outer edge keeps its own blind;
 * a wholly new outer edge takes the run's blind on every edge leaf; other leaves lose it.
 */
export function rehomeBlind(before, after) {
  const previous = runBlind({ grid: before });
  const beforeLeaves = new Map(gridLeaves(before).map((leaf) => [leaf.id, leaf]));
  let next = after;
  for (const side of ['left', 'right']) {
    const width = previous?.[side] ?? null;
    const oldEdge = edgeIds(before, side);
    const newEdge = edgeIds(next, side);
    const kept = [...newEdge].some((id) => oldEdge.has(id));
    next = mapLeaves(next, (leaf) => {
      if (width === null || !newEdge.has(leaf.id)) return withBlindSide(leaf, side, null);
      if (!kept) return withBlindSide(leaf, side, width);
      if (oldEdge.has(leaf.id)) {
        return withBlindSide(leaf, side, beforeLeaves.get(leaf.id)?.blind?.[side] ?? null);
      }
      return leaf;
    });
  }
  return next;
}

/** The outer sides ('left', 'right') whose edge leaves include this leaf. */
export function cellBlindSides(grid, leafId) {
  return ['left', 'right'].filter((side) => edgeIds(grid, side).has(leafId));
}

/** Sets or clears one edge cabinet leaf's blind; same reference when nothing changes. */
export function setGridCellBlind(grid, leafId, side, width) {
  if (side !== 'left' && side !== 'right') return grid;
  const valid = typeof width === 'number' && Number.isFinite(width) && width > 0;
  if (!valid && width !== null) return grid;
  if (!edgeIds(grid, side).has(leafId)) return grid;
  return mapLeaves(grid, (leaf) => (
    leaf.id === leafId && leaf.kind === 'cabinet' ? withBlindSide(leaf, side, width) : leaf));
}

/** The run's blind width field: resizes the blind edge leaves, or sets every edge leaf when none is blind. */
export function resizeGridBlind(grid, side, width) {
  const valid = typeof width === 'number' && Number.isFinite(width) && width > 0;
  const node = outerNode(grid, side);
  if (!valid || !node) return setGridBlind(grid, side, width);
  const blindIds = new Set(edgeLeaves(node, side)
    .filter((leaf) => leaf.blind?.[side] != null)
    .map((leaf) => leaf.id));
  if (blindIds.size === 0) return setGridBlind(grid, side, width);
  return mapLeaves(grid, (leaf) => (blindIds.has(leaf.id) ? withBlindSide(leaf, side, width) : leaf));
}

export function insertRootColumn(grid, index, item) {
  const items = rootItems(grid);
  const at = Math.max(0, Math.min(index, items.length));
  items.splice(at, 0, item);
  return replaceRootItems(grid, items);
}

export function removeRootColumn(grid, leafId) {
  const items = rootItems(grid);
  const index = items.findIndex((item) => item.id === leafId);
  if (index < 0) return grid;
  items.splice(index, 1);
  return replaceRootItems(grid, items);
}

export function updateRootItem(grid, leafId, patch) {
  const cellIndex = grid.cells.findIndex((cell) => cell.node.id === leafId);
  if (cellIndex < 0) return grid;
  const cell = grid.cells[cellIndex];
  let col = grid.cols[cell.col];
  let leaf = cell.node;
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'width') {
      if (value === undefined) {
        col = setKey(setKey(col, 'size', undefined), 'sizeMode', undefined);
      } else {
        col = setKey(col, 'size', value);
        col = setKey(col, 'sizeMode', value === null ? 'auto' : 'manual');
      }
    } else if (key === 'pin' || key === 'absorb') {
      col = setKey(col, key, value);
    } else {
      leaf = setKey(leaf, key, value);
    }
  }
  if (col === grid.cols[cell.col] && leaf === cell.node) return grid;
  const cols = [...grid.cols];
  const cells = [...grid.cells];
  cols[cell.col] = col;
  cells[cellIndex] = { ...cell, node: leaf };
  return { ...grid, cols, cells };
}

export function replaceRootItems(grid, items) {
  if (grid.rows.length !== 1) throw new Error('replaceRootItems needs a one-row grid');
  const parts = items.map(itemParts);
  const next = {
    ...grid,
    cols: parts.map(({ col }) => col),
    rows: grid.rows,
    cells: cellsFromParts(parts),
  };
  return rehomeBlind(grid, next);
}

export function cloneGrid(grid) {
  return {
    ...grid,
    cols: grid.cols.map(cloneTrack),
    rows: grid.rows.map(cloneTrack),
    cells: grid.cells.map((cell) => ({ ...cell, node: cloneNode(cell.node) })),
  };
}

export function mirrorGrid(grid) {
  return {
    ...grid,
    cols: [...grid.cols].reverse(),
    rows: grid.rows,
    cells: grid.cells.map((cell) => ({
      ...cell,
      col: grid.cols.length - cell.col - cell.colSpan,
      node: mirrorNode(cell.node),
    })),
  };
}

export function isGridShape(grid, isLeaf) {
  if (grid == null || typeof grid !== 'object' || typeof grid.id !== 'string') return false;
  if (!Array.isArray(grid.cols) || !Array.isArray(grid.rows) || !Array.isArray(grid.cells)) return false;
  if (grid.rows.length < 1 || !grid.cols.every(validTrack) || !grid.rows.every(validTrack)) return false;
  const coverage = Array(grid.cols.length * grid.rows.length).fill(0);
  for (const cell of grid.cells) {
    if (cell == null || typeof cell !== 'object') return false;
    if (![cell.col, cell.row, cell.colSpan, cell.rowSpan].every(Number.isInteger)) return false;
    if (cell.col < 0 || cell.row < 0 || cell.colSpan < 1 || cell.rowSpan < 1) return false;
    if (cell.col + cell.colSpan > grid.cols.length || cell.row + cell.rowSpan > grid.rows.length) return false;
    const node = cell.node;
    if (isNestedGrid(node)) {
      if (!isGridShape(node, isLeaf)) return false;
    } else if (node == null || typeof node.id !== 'string' || !isLeaf(node)) {
      return false;
    }
    for (let row = cell.row; row < cell.row + cell.rowSpan; row += 1) {
      for (let col = cell.col; col < cell.col + cell.colSpan; col += 1) {
        coverage[row * grid.cols.length + col] += 1;
      }
    }
  }
  return coverage.every((count) => count === 1);
}
