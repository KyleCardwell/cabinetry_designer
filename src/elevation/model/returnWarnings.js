import { cellPieces } from './cells.js';
import { landedReturns } from './cornerParts.js';
import { layoutRun, runFaceLayouts } from './faceLayouts.js';
import { resolveWall } from './room.js';
import { returnExtents } from './returnExtents.js';
import { runSide } from './runSide.js';
import { wallLabel } from './topology.js';

const TOLERANCE = 1 / 64;
const BLOCKING_FACES = new Set(['door', 'pair_door', 'drawer_front']);

/** Warn once per cabinet whose drawn front is covered by a landed return. */
export function returnFaceWarnings(room, wall, run, settings) {
  const extents = returnExtents(room, wall, settings);
  if (!extents.length) return [];
  const footprints = landedReturns(room, wall).flatMap(({ wallId, run: returning, landedView, end }) => {
    const extent = extents.find((entry) => entry.wallId === wallId && entry.runId === returning.id);
    if (!extent) return [];
    // landedReturns.end is the free end; the opposite end reaches this host face.
    const hostEnd = end === 'left' ? 'right' : 'left';
    const view = resolveWall(room, landedView, landedView.side);
    const layout = layoutRun(room, view, returning, settings);
    const columns = layout.pieces.filter((piece) => piece.role === 'item');
    const column = hostEnd === 'left' ? columns[0] : columns[columns.length - 1];
    const pieces = cellPieces(returning, layout).pieces.filter((piece) => piece.kind !== 'void'
      && (piece.role === `end-${hostEnd}`
        || (column && (piece.id === column.id || piece.columnId === column.id))));
    const top = runSide(room, view, returning, settings).filter(({ piece }) => piece === 'countertop');
    const spans = [...pieces, ...top].filter(({ height }) => height > 0);
    if (!spans.length) return [];
    return [{ ...extent,
      bottom: Math.min(...spans.map(({ z }) => z)),
      top: Math.max(...spans.map(({ z, height }) => z + height)),
      label: wallLabel(room, landedView),
    }];
  });
  if (!footprints.length) return [];

  const warnings = [];
  for (const [pieceId, { faces }] of runFaceLayouts(room, wall, run, settings)) {
    const covering = footprints.find(({ left, right, bottom, top }) => faces.some((face) => (
      BLOCKING_FACES.has(face.type)
      && Math.min(right, face.x + face.width) - Math.max(left, face.x) > TOLERANCE
      && Math.min(top, face.z + face.height) - Math.max(bottom, face.z) > TOLERANCE
    )));
    if (covering) warnings.push({
      code: 'return-covers-face',
      pieceId,
      message: `The desk run on ${covering.label} covers this door or drawer front.`,
    });
  }
  return warnings;
}
