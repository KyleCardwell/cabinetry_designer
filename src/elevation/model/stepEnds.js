import { EPSILON, gapReach } from './cells.js';
import { findLeaf } from './cellTree.js';
import { FRAME_RETURN_WIDTH } from './constants.js';
import { sideOf } from './frames.js';
import { runItems } from './grid.js';
import { isInsetStyle, resolveStyle } from './styles.js';

/** Step sides of framed leaves; None stays visible here and is omitted from derived run data. */
export function stepEndSides(run, cells, settings, room) {
  const leafOf = (piece) => run.grid ? findLeaf(run.grid, piece.id)
    : runItems(run).find((item) => item.id === piece.id);
  const framed = new Set(cells.pieces.filter((piece) => piece.kind === 'cabinet'
    && isInsetStyle(resolveStyle(settings, room, run, leafOf(piece)))));
  const reach = gapReach(cells.gaps ?? []);
  return [...framed].flatMap((cabinet) => ['left', 'right'].flatMap((side) => {
    const neighbours = cells.pieces.filter((piece) => piece !== cabinet
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
