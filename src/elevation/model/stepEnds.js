import { EPSILON, gapReach } from './cells.js';
import { findLeaf } from './cellTree.js';
import { CABINET_TYPE_IDS, FRAME_RETURN_WIDTH } from './constants.js';
import { frontDepth, runBackOffset } from './corners.js';
import { teamDoorStyle } from './doorStyles.js';
import { sideOf } from './frames.js';
import { runItems } from './grid.js';
import { isInsetStyle, resolveStyle } from './styles.js';

/** Resolve step panel templates without adding any layout gap or end drop. */
export function stepEndPanels(run, settings) {
  return (run._stepEnds ?? []).filter((entry) => entry.choice === 'panel').map((entry) => ({
    ...entry,
    width: run._endThickness?.[entry.side] ?? teamDoorStyle(settings).thickness,
    depth: frontDepth(run, settings) - runBackOffset(run),
    styleId: run.ends?.[entry.side]?.styleId ?? 'default',
    ...(run.ends?.[entry.side]?.extend ? { extend: run.ends[entry.side].extend } : {}),
  }));
}

/** Place each panel over the shorter neighbour, against its taller owner. */
export function stepEndPieces(panels, pieces) {
  return panels.flatMap((panel) => {
    const owner = pieces.find((piece) => piece.id === panel.leafId);
    if (!owner) return [];
    return [{
      id: `${owner.id}:step-${panel.side}-${panel.edge}`, kind: 'end_panel', role: 'inside',
      inside: true, step: true, ownerId: owner.id, side: panel.side,
      cabinetTypeId: CABINET_TYPE_IDS.END_PANEL,
      x: panel.side === 'left' ? owner.x - panel.width : owner.x + owner.width,
      z: panel.z, width: panel.width, height: panel.height, depth: panel.depth, styleId: panel.styleId,
      ...(panel.extend ? { extend: panel.extend } : {}),
    }];
  });
}

/** Step sides of framed leaves; None stays visible here and is omitted from derived run data. */
export function stepEndSides(run, cells, settings, room) {
  const leafOf = (piece) => run.grid ? findLeaf(run.grid, piece.id)
    : runItems(run).find((item) => item.id === piece.id);
  const framed = new Set(cells.pieces.filter((piece) => piece.kind === 'cabinet'
    && isInsetStyle(resolveStyle(settings, room, run, leafOf(piece)))));
  const reach = gapReach(cells.gaps ?? []);
  return [...framed].flatMap((cabinet) => ['left', 'right'].flatMap((side) => {
    const neighbours = cells.pieces.filter((piece) => piece !== cabinet && !piece.step
      && sideOf(cabinet, piece, reach) === side);
    const boxes = neighbours.filter((piece) => framed.has(piece));
    if (!boxes.length) return [];
    const stored = leafOf(cabinet)?.stepEnds?.[side];
    const choice = stored === 'none' ? 'none' : stored?.type === 'panel' ? 'panel' : 'return';
    return ['top', 'bottom'].flatMap((edge) => {
      const z = edge === 'top' ? Math.max(...boxes.map((box) => box.z + box.height)) : cabinet.z;
      const high = edge === 'top' ? cabinet.z + cabinet.height : Math.min(...boxes.map((box) => box.z));
      const height = high - z;
      if (height <= EPSILON || neighbours.some((piece) => (
        Math.min(high, piece.z + piece.height) - Math.max(z, piece.z) > EPSILON
      ))) return [];
      return [{ leafId: cabinet.id, side, edge, z, height, choice,
        ...(choice === 'return' ? { width: stored?.width ?? FRAME_RETURN_WIDTH } : {}) }];
    });
  }));
}
