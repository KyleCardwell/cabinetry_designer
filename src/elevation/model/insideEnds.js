import { EPSILON, gapReach, panelOrientation } from './cells.js';
import { findLeaf } from './cellTree.js';
import { CABINET_TYPE_IDS } from './constants.js';
import { frontDepth, runBackOffset } from './corners.js';
import { teamDoorStyle } from './doorStyles.js';
import { sideOf } from './frames.js';
import { isNestedGrid, runItems } from './grid.js';
import { endPieceBottom, isInsetStyle, resolveStyle } from './styles.js';

/** Panel templates resolved with the solver's settings; cellPieces positions them on the leaves. */
export function insideEndPanels(run, settings) {
  return (run._insideEnds ?? []).filter((entry) => entry.choice === 'panel').map((entry) => ({
    ...entry,
    width: run._endThickness?.[entry.side] ?? teamDoorStyle(settings).thickness,
    depth: frontDepth(run, settings) - runBackOffset(run),
    drop: run._frame?.drop ?? endPieceBottom(run, resolveStyle(settings, run), settings).drop,
    styleId: run.ends?.[entry.side]?.styleId ?? 'default',
    ...(run.ends?.[entry.side]?.extend ? { extend: run.ends[entry.side].extend } : {}),
  }));
}

/** Stacked panels at one boundary share its width, rather than charging each row again. */
export function insideEndGap(panels, gridId, trackId) {
  return panels.reduce((width, panel) => panel.boundary && panel.boundary.gridId === gridId
    && panel.boundary?.trackId === trackId ? Math.max(width, panel.width) : width, 0);
}

export function insideEndPieces(panels, pieces) {
  return panels.flatMap((panel) => {
    const owner = pieces.find((piece) => piece.id === panel.leafId);
    if (!owner) return [];
    return [{
      id: `${owner.id}:inside-${panel.side}`, kind: 'end_panel', role: 'inside', inside: true,
      ownerId: owner.id, side: panel.side, cabinetTypeId: CABINET_TYPE_IDS.END_PANEL,
      x: panel.side === 'left' ? owner.x - panel.width : owner.x + owner.width,
      z: owner.z - panel.drop, width: panel.width, height: owner.height + panel.drop,
      depth: panel.depth, styleId: panel.styleId,
      ...(panel.extend ? { extend: panel.extend } : {}),
    }];
  });
}

function frontSetback(run, piece) {
  return piece.align === 'back' ? run.depth - piece.depth : 0;
}

function qualifies(run, cabinet, neighbour) {
  return neighbour.kind === 'void' || neighbour.kind === 'shelves'
    || (neighbour.kind === 'panel' && panelOrientation(neighbour) === 'back')
    || (neighbour.kind === 'cabinet'
      && frontSetback(run, neighbour) - frontSetback(run, cabinet) > EPSILON);
}

/** Check the nearest neighbour over every interval of the cabinet's entire height. */
function openSide(run, cells, cabinet, side) {
  const reach = gapReach(cells.gaps ?? []);
  const neighbours = cells.pieces.filter((piece) => piece !== cabinet
    && sideOf(cabinet, piece, reach) === side);
  const bottom = cabinet.z;
  const top = bottom + cabinet.height;
  const cuts = [...new Set([bottom, top, ...neighbours.flatMap((piece) => [
    Math.max(bottom, piece.z), Math.min(top, piece.z + piece.height),
  ])])].sort((a, b) => a - b);
  const distance = (piece) => side === 'left'
    ? cabinet.x - piece.x - piece.width : piece.x - cabinet.x - cabinet.width;
  for (let index = 1; index < cuts.length; index += 1) {
    if (cuts[index] - cuts[index - 1] <= EPSILON) continue;
    const middle = (cuts[index] + cuts[index - 1]) / 2;
    const beside = neighbours.filter((piece) => piece.z < middle && piece.z + piece.height > middle)
      .sort((a, b) => distance(a) - distance(b));
    if (!beside.length || !qualifies(run, cabinet, beside[0])) return false;
  }
  return top - bottom > EPSILON;
}

/** Open inside sides, including an explicit None choice; real run ends have no neighbour. */
export function insideEndSides(run, cells, settings) {
  const framed = Boolean(run._frame) || isInsetStyle(resolveStyle(settings, run));
  return cells.pieces.filter((piece) => piece.kind === 'cabinet').flatMap((piece) => {
    const leaf = run.grid ? findLeaf(run.grid, piece.id)
      : runItems(run).find((item) => item.id === piece.id);
    return ['left', 'right'].filter((side) => openSide(run, cells, piece, side)).map((side) => {
      const stored = leaf?.insideEnds?.[side];
      const choice = stored === 'none' ? 'none' : stored?.type === 'return' && framed ? 'return' : 'panel';
      return { leafId: piece.id, side, choice };
    });
  });
}

/** The column track whose following gap owns this boundary, at the first enclosing split. */
export function insideEndBoundary(grid, leafId, side) {
  if (!grid) return null;
  for (const cell of grid.cells) {
    const node = cell.node;
    if (node.id !== leafId && (!isNestedGrid(node) || !findLeaf(node, leafId))) continue;
    if (isNestedGrid(node)) {
      const nested = insideEndBoundary(node, leafId, side);
      if (nested) return nested;
    }
    const after = side === 'left' ? cell.col - 1 : cell.col + cell.colSpan - 1;
    return after >= 0 && after < grid.cols.length - 1
      ? { gridId: grid.id, trackId: grid.cols[after].id } : null;
  }
  return null;
}
