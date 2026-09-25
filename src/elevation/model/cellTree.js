import { isNestedGrid, rehomeBlind, removeRootColumn, replaceRootItems,
  rootItems } from './grid.js';

/** Maximum number of cells created by one split. */
export const MAX_CELL_SPLIT = 8;

/** Directions accepted by splitGridCell. */
export const CELL_DIRECTIONS = ['across', 'down'];

const axisOf = (grid) => (grid.rows.length > 1 ? 'row' : 'col');
const trackKey = (axis) => (axis === 'row' ? 'rows' : 'cols');
const splitAxis = (direction) => (direction === 'down' ? 'row' : 'col');
const autoTrack = (id) => ({ id, size: null, sizeMode: 'auto' });
const ordered = (cells) => [...cells].sort((a, b) => a.row - b.row || a.col - b.col);

function locate(grid, nodeId, depth = 0) {
  const axis = axisOf(grid);
  for (let cellIndex = 0; cellIndex < grid.cells.length; cellIndex += 1) {
    const cell = grid.cells[cellIndex];
    if (cell.node.id === nodeId) {
      return { parent: grid, cellIndex, cell, depth, axis,
        track: grid[trackKey(axis)][cell[axis]] };
    }
    if (isNestedGrid(cell.node)) {
      const found = locate(cell.node, nodeId, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function replaceNestedGrid(root, target, replacement) {
  function visit(grid, isRoot) {
    let cols = grid.cols;
    let changed = false;
    const cells = grid.cells.map((cell) => {
      let node = cell.node;
      if (node === target) node = replacement;
      else if (isNestedGrid(node)) node = visit(node, false);
      if (node === cell.node) return cell;
      changed = true;
      if (isRoot) {
        if (cols === grid.cols) cols = [...cols];
        cols[cell.col] = { ...cols[cell.col], id: `${node.id}:col` };
      }
      return { ...cell, node };
    });
    return changed ? { ...grid, cols, cells } : grid;
  }
  return visit(root, true);
}

function copiedStyle(leaf) {
  return {
    ...(Object.hasOwn(leaf, 'style') ? { style: leaf.style } : {}),
    ...(Object.hasOwn(leaf, 'blind') ? { blind: leaf.blind } : {}),
  };
}

function replaceCell(parent, cellIndex, node, renameColumn) {
  const cell = parent.cells[cellIndex];
  const cells = [...parent.cells];
  cells[cellIndex] = { ...cell, node };
  if (!renameColumn) return { ...parent, cells };
  const cols = [...parent.cols];
  cols[cell.col] = { ...cols[cell.col], id: `${node.id}:col` };
  return { ...parent, cols, cells };
}

function splitFlat(parent, found, count, makeId) {
  const { axis, cell, track } = found;
  const key = trackKey(axis);
  const newTracks = Array.from({ length: count - 1 }, () => autoTrack(makeId()));
  const tracks = [...parent[key]];
  tracks[cell[axis]] = { ...track, size: null, sizeMode: 'auto' };
  tracks.splice(cell[axis] + 1, 0, ...newTracks);
  const leaves = Array.from({ length: count - 1 }, () => (
    { id: makeId(), kind: 'cabinet', ...copiedStyle(cell.node) }));
  const shifted = parent.cells.map((entry) => entry[axis] > cell[axis]
    ? { ...entry, [axis]: entry[axis] + count - 1 }
    : entry);
  const additions = leaves.map((node, index) => (
    { ...cell, [axis]: cell[axis] + index + 1, node }));
  return { ...parent, [key]: tracks, cells: ordered([...shifted, ...additions]) };
}

function nestedSplit(leaf, direction, count, makeId) {
  const id = makeId();
  const cross = autoTrack(makeId());
  const tracks = Array.from({ length: count }, () => autoTrack(makeId()));
  const leaves = [leaf, ...Array.from({ length: count - 1 }, () => (
    { id: makeId(), kind: 'cabinet', ...copiedStyle(leaf) }))];
  const down = direction === 'down';
  return {
    id,
    cols: down ? [cross] : tracks,
    rows: down ? tracks : [cross],
    cells: leaves.map((node, index) => ({ col: down ? 0 : index,
      row: down ? index : 0, colSpan: 1, rowSpan: 1, node })),
  };
}

/** Finds a leaf or nested-grid node and describes its containing cell. */
export function findCell(grid, nodeId) {
  return locate(grid, nodeId);
}

/** Finds a leaf node, never a nested grid. */
export function findLeaf(grid, leafId) {
  const found = locate(grid, leafId);
  return found && !isNestedGrid(found.cell.node) ? found.cell.node : null;
}

/** Splits a cabinet leaf across or down without mutating the tree. */
export function splitGridCell(grid, leafId, direction, count, makeId) {
  if (!CELL_DIRECTIONS.includes(direction) || !Number.isFinite(count)) return grid;
  const found = locate(grid, leafId);
  if (!found || isNestedGrid(found.cell.node) || found.cell.node.kind !== 'cabinet') return grid;
  const total = Math.min(MAX_CELL_SPLIT, Math.max(2, Math.round(count)));
  if (found.depth === 0 && direction === 'across') {
    const items = rootItems(grid);
    const item = { ...items[found.cell.col], width: null };
    const additions = Array.from({ length: total - 1 }, () => (
      { id: makeId(), kind: 'cabinet', width: null, ...copiedStyle(found.cell.node) }));
    items.splice(found.cell.col, 1, item, ...additions);
    return replaceRootItems(grid, items);
  }
  let next;
  if (found.depth > 0 && found.axis === splitAxis(direction)) {
    next = replaceNestedGrid(grid, found.parent, splitFlat(found.parent, found, total, makeId));
  } else {
    const node = nestedSplit(found.cell.node, direction, total, makeId);
    const parent = replaceCell(found.parent, found.cellIndex, node, found.depth === 0);
    next = found.depth === 0 ? parent : replaceNestedGrid(grid, found.parent, parent);
  }
  return rehomeBlind(grid, next);
}

function flattenInto(parent, owner, child) {
  const axis = axisOf(parent);
  const key = trackKey(axis);
  const at = owner.cell[axis];
  const tracks = [...parent[key]];
  tracks.splice(at, 1, ...child[key]);
  const offset = child[key].length - 1;
  const cells = parent.cells
    .filter((_, index) => index !== owner.cellIndex)
    .map((cell) => cell[axis] > at ? { ...cell, [axis]: cell[axis] + offset } : cell);
  const inserted = child.cells.map((cell) => ({ ...cell, [axis]: cell[axis] + at }));
  return { ...parent, [key]: tracks, cells: ordered([...cells, ...inserted]) };
}

/** Removes a leaf and collapses or flattens one-cell nested grids. */
export function removeGridCell(grid, leafId) {
  const found = locate(grid, leafId);
  if (!found || isNestedGrid(found.cell.node)) return grid;
  if (found.depth === 0) return removeRootColumn(grid, leafId);
  const { parent, axis, cellIndex } = found;
  const key = trackKey(axis);
  const at = found.cell[axis];
  const tracks = parent[key].filter((_, index) => index !== at);
  const cells = parent.cells
    .filter((_, index) => index !== cellIndex)
    .map((cell) => cell[axis] > at ? { ...cell, [axis]: cell[axis] - 1 } : cell);
  let next;
  if (cells.length > 1) {
    next = replaceNestedGrid(grid, parent, { ...parent, [key]: tracks, cells: ordered(cells) });
  } else {
    const survivor = cells[0].node;
    const owner = locate(grid, parent.id);
    if (owner.parent !== grid && isNestedGrid(survivor)
      && axisOf(survivor) === axisOf(owner.parent)) {
      const flattened = flattenInto(owner.parent, owner, survivor);
      next = replaceNestedGrid(grid, owner.parent, flattened);
    } else {
      next = replaceNestedGrid(grid, parent, survivor);
    }
  }
  return rehomeBlind(grid, next);
}

/** Makes every track on a nested leaf's parent axis automatic. */
export function equalizeGridCells(grid, leafId) {
  const found = locate(grid, leafId);
  if (!found || found.depth === 0 || isNestedGrid(found.cell.node)) return grid;
  const key = trackKey(found.axis);
  let changed = false;
  const tracks = found.parent[key].map((track) => {
    if (track.size === null && track.sizeMode === 'auto') return track;
    changed = true;
    return { ...track, size: null, sizeMode: 'auto' };
  });
  if (!changed) return grid;
  return replaceNestedGrid(grid, found.parent, { ...found.parent, [key]: tracks });
}

/** Replaces a nested leaf's parent grid with that leaf. */
export function unsplitGridCell(grid, leafId) {
  const found = locate(grid, leafId);
  if (!found || found.depth === 0 || isNestedGrid(found.cell.node)) return grid;
  return rehomeBlind(grid, replaceNestedGrid(grid, found.parent, found.cell.node));
}

/** Sets any root or nested track to automatic or a positive manual size. */
export function setGridTrackSize(grid, trackId, size) {
  if (size !== null && !(typeof size === 'number' && Number.isFinite(size) && size > 0)) return grid;
  const desiredMode = size === null ? 'auto' : 'manual';
  function visit(node) {
    for (const key of ['cols', 'rows']) {
      const index = node[key].findIndex((track) => track.id === trackId);
      if (index >= 0) {
        const track = node[key][index];
        if (Object.is(track.size, size) && track.sizeMode === desiredMode) return [node, true];
        const tracks = [...node[key]];
        tracks[index] = { ...track, size, sizeMode: desiredMode };
        return [{ ...node, [key]: tracks }, true];
      }
    }
    for (let index = 0; index < node.cells.length; index += 1) {
      const cell = node.cells[index];
      if (!isNestedGrid(cell.node)) continue;
      const [child, found] = visit(cell.node);
      if (!found) continue;
      if (child === cell.node) return [node, true];
      const cells = [...node.cells];
      cells[index] = { ...cell, node: child };
      return [{ ...node, cells }, true];
    }
    return [node, false];
  }
  const [next, found] = visit(grid);
  return found ? next : grid;
}
