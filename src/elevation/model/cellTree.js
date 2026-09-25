import { insertRootColumn, isNestedGrid, rehomeBlind, removeRootColumn, replaceRootItems,
  rootItems } from './grid.js';

/** Maximum number of cells created by one split. */
export const MAX_CELL_SPLIT = 8;

/** Directions accepted by splitGridCell. */
export const CELL_DIRECTIONS = ['across', 'down'];

/** Kinds a nested cell can be. */
export const CELL_KINDS = ['cabinet', 'panel', 'void', 'shelves'];

/** Most floating shelves in one shelves cell. */
export const MAX_SHELVES = 12;

/** Which panels run through when a cell is wrapped. */
export const WRAP_THROUGH = ['sides', 'top'];

/** Sides addGridPanel accepts. */
export const PANEL_SIDES = ['left', 'right', 'above', 'below'];

const DEFAULT_SHELVES = { count: 2, back: false };

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

function replaceLeaf(grid, found, leaf) {
  const parent = replaceCell(found.parent, found.cellIndex, leaf, found.depth === 0);
  return found.depth === 0 ? parent : replaceNestedGrid(grid, found.parent, parent);
}

function cellLeaf(grid, leafId) {
  const found = locate(grid, leafId);
  if (!found || isNestedGrid(found.cell.node)) return null;
  return CELL_KINDS.includes(found.cell.node.kind) ? found : null;
}

/**
 * Changes a cell's kind, keeping id, depth and align. A void keeps neither; neither does a former
 * panel, whose track also goes back to auto.
 */
export function setGridCellKind(grid, leafId, kind) {
  const found = cellLeaf(grid, leafId);
  if (!found || !CELL_KINDS.includes(kind) || found.cell.node.kind === kind) return grid;
  const leaf = found.cell.node;
  const wasPanel = leaf.kind === 'panel';
  const next = { id: leaf.id, kind };
  if (kind !== 'void' && !wasPanel) {
    if (Object.hasOwn(leaf, 'depth')) next.depth = leaf.depth;
    if (Object.hasOwn(leaf, 'align')) next.align = leaf.align;
  }
  if (kind === 'shelves') next.shelves = { ...DEFAULT_SHELVES };
  const replaced = replaceLeaf(grid, found, next);
  return wasPanel && found.track.size !== null
    ? setGridTrackSize(replaced, found.track.id, null)
    : replaced;
}

/** Sets a cell's depth (null = the run's) and align ('back', or 'face'/null = default). */
export function setGridCellDepth(grid, leafId, patch) {
  const found = cellLeaf(grid, leafId);
  if (!found || found.cell.node.kind === 'void' || !patch) return grid;
  const next = { ...found.cell.node };
  if (Object.hasOwn(patch, 'depth')) {
    const { depth } = patch;
    if (depth === null) delete next.depth;
    else if (typeof depth === 'number' && Number.isFinite(depth) && depth > 0) next.depth = depth;
    else return grid;
  }
  if (Object.hasOwn(patch, 'align')) {
    if (patch.align === 'back') next.align = 'back';
    else if (patch.align === 'face' || patch.align === null) delete next.align;
    else return grid;
  }
  const leaf = found.cell.node;
  if (Object.is(next.depth, leaf.depth) && next.align === leaf.align) return grid;
  return replaceLeaf(grid, found, next);
}

/** Sets a shelves leaf's count (rounded, 1…MAX_SHELVES) and back panel flag. */
export function setGridShelves(grid, leafId, patch) {
  const found = cellLeaf(grid, leafId);
  if (!found || found.cell.node.kind !== 'shelves' || !patch) return grid;
  const leaf = found.cell.node;
  const shelves = { ...DEFAULT_SHELVES, ...leaf.shelves };
  if (Object.hasOwn(patch, 'count')) {
    if (!Number.isFinite(patch.count)) return grid;
    shelves.count = Math.min(MAX_SHELVES, Math.max(1, Math.round(patch.count)));
  }
  if (Object.hasOwn(patch, 'back')) {
    if (typeof patch.back !== 'boolean') return grid;
    shelves.back = patch.back;
  }
  if (shelves.count === leaf.shelves?.count && shelves.back === leaf.shelves?.back) return grid;
  return replaceLeaf(grid, found, { ...leaf, shelves });
}

function wrapGrid(axis, makeId, nodes, sizes) {
  const id = makeId();
  const cross = autoTrack(makeId());
  const tracks = sizes.map((size) => (size === null
    ? autoTrack(makeId())
    : { id: makeId(), size, sizeMode: 'manual' }));
  const leaves = nodes.map((node) => node ?? { id: makeId(), kind: 'panel' });
  return {
    id,
    cols: axis === 'col' ? tracks : [cross],
    rows: axis === 'row' ? tracks : [cross],
    cells: leaves.map((node, index) => ({ col: axis === 'col' ? index : 0,
      row: axis === 'row' ? index : 0, colSpan: 1, rowSpan: 1, node })),
  };
}

/**
 * Wraps a cabinet leaf in panels: left, right and top, plus bottom when asked.
 * 'sides' runs the side panels full height; 'top' runs the top (and bottom) full width.
 */
export function wrapGridCell(grid, leafId, through, thickness, makeId, bottom = false) {
  if (!WRAP_THROUGH.includes(through)) return grid;
  if (!(typeof thickness === 'number' && Number.isFinite(thickness) && thickness > 0)) return grid;
  const found = locate(grid, leafId);
  if (!found || isNestedGrid(found.cell.node) || found.cell.node.kind !== 'cabinet') return grid;
  const leaf = found.cell.node;
  const t = thickness;
  const downSizes = bottom ? [t, null, t] : [t, null];
  let node;
  if (through === 'sides') {
    const outer = wrapGrid('col', makeId, [null, 'inner', null], [t, null, t]);
    const inner = wrapGrid('row', makeId, bottom ? [null, leaf, null] : [null, leaf], downSizes);
    node = { ...outer, cells: outer.cells.map((cell) => (
      cell.node === 'inner' ? { ...cell, node: inner } : cell)) };
  } else {
    const outer = wrapGrid('row', makeId, bottom ? [null, 'inner', null] : [null, 'inner'], downSizes);
    const inner = wrapGrid('col', makeId, [null, leaf, null], [t, null, t]);
    node = { ...outer, cells: outer.cells.map((cell) => (
      cell.node === 'inner' ? { ...cell, node: inner } : cell)) };
  }
  return rehomeBlind(grid, replaceLeaf(grid, found, node));
}

/** The panel types a cell could take: 'side' in a column or row, 'top' in a stack, 'back' anywhere. */
export function panelTypes(grid, leafId) {
  const found = cellLeaf(grid, leafId);
  if (!found) return [];
  return found.axis === 'row' ? ['top', 'back'] : ['side', 'back'];
}

/** Sizes a panel cell so its type's dimension is `thickness`; same reference when nothing changes. */
export function setGridPanelType(grid, leafId, type, thickness) {
  const found = cellLeaf(grid, leafId);
  if (!found || found.cell.node.kind !== 'panel') return grid;
  if (!panelTypes(grid, leafId).includes(type)) return grid;
  if (!(typeof thickness === 'number' && Number.isFinite(thickness) && thickness > 0)) return grid;
  const leaf = found.cell.node;
  const next = { id: leaf.id, kind: 'panel' };
  if (type === 'back') {
    next.depth = thickness;
    next.align = 'back';
  }
  if (type !== 'back' && leaf.doors) next.doors = leaf.doors;
  const sameLeaf = Object.is(next.depth, leaf.depth) && next.align === leaf.align
    && next.doors === leaf.doors;
  const withLeaf = sameLeaf ? grid : replaceLeaf(grid, found, next);
  return setGridTrackSize(withLeaf, found.track.id, type === 'back' ? null : thickness);
}

/** Adds a `thickness` panel cell beside a cell: a top-level column, a flat sibling, or a nested pair. */
export function addGridPanel(grid, leafId, side, thickness, makeId) {
  if (!PANEL_SIDES.includes(side)) return grid;
  if (!(typeof thickness === 'number' && Number.isFinite(thickness) && thickness > 0)) return grid;
  const found = cellLeaf(grid, leafId);
  if (!found) return grid;
  const axis = side === 'left' || side === 'right' ? 'col' : 'row';
  const before = side === 'left' || side === 'above';
  if (found.depth === 0 && axis === 'col') {
    return insertRootColumn(grid, found.cell.col + (before ? 0 : 1),
      { id: makeId(), kind: 'panel', width: thickness });
  }
  let next;
  if (found.depth > 0 && found.axis === axis) {
    const { parent, cell } = found;
    const key = trackKey(axis);
    const at = cell[axis] + (before ? 0 : 1);
    const tracks = [...parent[key]];
    tracks.splice(at, 0, { id: makeId(), size: thickness, sizeMode: 'manual' });
    const panel = { ...cell, [axis]: at, node: { id: makeId(), kind: 'panel' } };
    const cells = parent.cells.map((entry) => (
      entry[axis] >= at ? { ...entry, [axis]: entry[axis] + 1 } : entry));
    next = replaceNestedGrid(grid, parent, { ...parent, [key]: tracks, cells: ordered([...cells, panel]) });
  } else {
    const id = makeId();
    const cross = autoTrack(makeId());
    const fixed = () => ({ id: makeId(), size: thickness, sizeMode: 'manual' });
    const tracks = before ? [fixed(), autoTrack(makeId())] : [autoTrack(makeId()), fixed()];
    const panel = { id: makeId(), kind: 'panel' };
    const nodes = before ? [panel, found.cell.node] : [found.cell.node, panel];
    next = replaceLeaf(grid, found, {
      id,
      cols: axis === 'col' ? tracks : [cross],
      rows: axis === 'row' ? tracks : [cross],
      cells: nodes.map((node, index) => ({ col: axis === 'col' ? index : 0,
        row: axis === 'row' ? index : 0, colSpan: 1, rowSpan: 1, node })),
    });
  }
  return rehomeBlind(grid, next);
}

/** Sets a panel's doors: 'cover', or 'flush'/null (the default) to clear it. */
export function setGridPanelDoors(grid, leafId, doors) {
  const found = cellLeaf(grid, leafId);
  if (!found || found.cell.node.kind !== 'panel') return grid;
  if (doors !== 'cover' && doors !== 'flush' && doors !== null) return grid;
  const leaf = found.cell.node;
  if ((doors === 'cover') === (leaf.doors === 'cover')) return grid;
  const next = { ...leaf };
  if (doors === 'cover') next.doors = 'cover';
  else delete next.doors;
  return replaceLeaf(grid, found, next);
}
