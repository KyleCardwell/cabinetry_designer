import { doorDrawing } from './doorDetails.js';
import { resolveWall } from './room.js';
import { runScene } from './runScene.js';

/** Two lines from the hinge edge's midpoint to the opposite corners, in wall inches (z up). */
export function swingMarkLines(face) {
  const { type, action = 'swing', x, z, width, height } = face;
  if (!['door', 'pair_door'].includes(type)
    || !['swing', 'flipper', 'pocket'].includes(action)) return [];
  const hinge = type === 'pair_door' ? face.half : face.hinge;
  const right = x + width;
  const top = z + height;
  switch (hinge) {
    case 'left':
      return [
        { x1: x, z1: z + height / 2, x2: right, z2: top },
        { x1: x, z1: z + height / 2, x2: right, z2: z },
      ];
    case 'right':
      return [
        { x1: right, z1: z + height / 2, x2: x, z2: top },
        { x1: right, z1: z + height / 2, x2: x, z2: z },
      ];
    case 'top':
      return [
        { x1: x + width / 2, z1: top, x2: x, z2: z },
        { x1: x + width / 2, z1: top, x2: right, z2: z },
      ];
    case 'bottom':
      return [
        { x1: x + width / 2, z1: z, x2: x, z2: top },
        { x1: x + width / 2, z1: z, x2: right, z2: top },
      ];
    default:
      return [];
  }
}

/** Marked faces in run order, using the same face ids as elevationParts. */
export function runSwingMarks(faceLayouts) {
  const result = [];
  for (const [pieceId, layout] of faceLayouts) {
    for (const face of layout.faces) {
      const lines = swingMarkLines(face);
      if (!lines.length) continue;
      const { path, half = null } = face;
      result.push({ pieceId, path, half, partId: `${pieceId}:${path}${half ?? ''}`, lines });
    }
  }
  return result;
}

/** Swing marks on one resolved wall face, optionally limited to the drawn part ids. */
export function elevationSwingMarks(room, wall, side, settings, partIds = null) {
  if (!doorDrawing(room).swings) return [];
  const view = resolveWall(room, wall, side);
  const result = [];
  for (const run of view.runs) {
    for (const { partId, lines } of runSwingMarks(runScene(room, view, run, settings).faceLayouts)) {
      if (partIds && !partIds.has(partId)) continue;
      result.push({ partId, lines });
    }
  }
  return result;
}
