import { resolveWall } from './room.js';
import { runScene } from './runScene.js';
import { centerlineMarkers } from './dimensions.js';
import { DIMENSION_TEXT_GAP, DIMENSION_TEXT_HEIGHT } from './elevationDimensions.js';
import { plotScale } from './drawingScale.js';

const EPSILON = 1e-6;

/**
 * A cabinet pinned 0" off its datum's centre (SPEC-43.3): a centre line from the cabinet's bottom
 * (or the callout line) to the datum's point (or the cabinet's top), labelled CL over its top.
 */
export function elevationMarks(room, wall, side, settings) {
  const view = resolveWall(room, wall, side);
  const textOffset = (DIMENSION_TEXT_GAP + DIMENSION_TEXT_HEIGHT / 2) * plotScale(settings);

  return view.runs.flatMap((run) => {
    const pieces = runScene(room, view, run, settings).result.pieces;
    return centerlineMarkers(run, pieces, view, view.length, settings)
      .filter(({ anchor, value }) => anchor === 'center' && value <= EPSILON)
      .map(({
        x, z, datumZ, pieceBottom, pieceTop,
      }) => {
        const top = Math.max(datumZ ?? z, pieceTop);
        return {
          kind: 'centerline',
          x,
          bottom: Math.min(z, pieceBottom),
          top,
          text: 'CL',
          textX: x,
          textZ: top + textOffset,
        };
      });
  });
}
