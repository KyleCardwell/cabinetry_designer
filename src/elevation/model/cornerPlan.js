import { cornerEnd } from './cornerEnd.js';
import { runBackOffset } from './corners.js';
import { runFaceStyles } from './doorStyleResolve.js';
import { teamDoorStyle } from './doorStyles.js';

function polygonPiece(key, kind, polygon, top) {
  return {
    key, kind, polygon, top,
    start: Math.min(...polygon.map(([u]) => u)),
    end: Math.max(...polygon.map(([u]) => u)),
    back: Math.min(...polygon.map(([, v]) => v)),
    front: Math.max(...polygon.map(([, v]) => v)),
  };
}

/** Corner additions in the owner's wall frame, applied after the ordinary plan pieces. */
export function cornerPlanPieces(room, wall, run, settings, layout, faceLayouts, faces) {
  const result = { boxes: new Map(), faces: [], dropFaceKeys: new Set() };
  if (runBackOffset(run) !== 0) return result;

  for (const side of ['left', 'right']) {
    if (run.ends?.[side]?.type !== 'corner') continue;
    const corner = cornerEnd(room, wall, run, side, settings, layout);
    if (!corner.active || !corner.shape) continue;
    const { columnId, cornerX, dir, depthB, offsetB, legB, returnSide } = corner;
    const column = layout.pieces.find(({ id }) => id === columnId);
    const entry = faceLayouts.get(columnId);
    const top = column.z + column.height;
    const toWall = ([x, y]) => [cornerX + dir * x, y];
    result.boxes.set(columnId, { polygon: corner.shape.outline.map(toWall) });

    if (corner.kind === 90 && entry?.cornerReturn?.legB) {
      const { at, dir: dirR, legB: returnLayout } = entry.cornerReturn;
      // Same topFaces stack rule as leg A, without importing planPieces back into this module.
      const kept = [];
      for (const face of [...returnLayout.faces].filter(({ type }) => type !== 'open')
        .sort((a, b) => b.z - a.z || a.x - b.x)) {
        if (kept.some((other) => Math.min(other.x + other.width, face.x + face.width)
          - Math.max(other.x, face.x) > 1e-6)) continue;
        kept.push(face);
      }
      for (const face of kept.sort((a, b) => a.x - b.x)) {
        const [y0, y1] = [dirR * (face.x - at), dirR * (face.x + face.width - at)]
          .sort((a, b) => a - b);
        const front = depthB + offsetB;
        const back = front - (face.thickness ?? teamDoorStyle(settings).thickness);
        result.faces.push(polygonPiece(`${columnId}:B:${face.path}${face.half ?? ''}`, 'face',
          [[back, y0], [front, y0], [front, y1], [back, y1]].map(toWall), top));
      }
    }

    if (corner.kind === 45 && entry?.squash) {
      const { a, b } = corner.faceLayout.feet;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const tau = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
      const normal = corner.shape.faces[0].normal;
      for (const face of entry.faces.filter(({ type }) => type !== 'open')) {
        const key = `${columnId}:${face.path}${face.half ?? ''}`;
        // Only the topmost true faces have matching ordinary plan faces.
        if (!faces.some((piece) => piece.key === key)) continue;
        result.dropFaceKeys.add(key);
        const [s0, s1] = [dir * (entry.squash.pivot - face.x),
          dir * (entry.squash.pivot - face.x - face.width)].sort((x, y) => x - y);
        const front = [s0, s1].map((s) => [a[0] + s * tau[0], a[1] + s * tau[1]]);
        const thickness = face.thickness ?? teamDoorStyle(settings).thickness;
        const back = front.map(([x, y]) => [x - thickness * normal[0], y - thickness * normal[1]]);
        result.faces.push(polygonPiece(key, 'face', [...front, ...back.reverse()].map(toWall), top));
      }
    }

    if (returnSide.type !== 'none') {
      let back = 0;
      if (returnSide.type === 'filler') {
        // Match runFillerThickness: all-MDF faces use their thickest style.
        const styles = runFaceStyles(room, wall, run, settings);
        const thickness = styles.length && styles.every(({ design }) => design.slabCore === 'mdf')
          ? Math.max(...styles.map(({ style }) => style.thickness)) : settings.fillerThickness;
        back = depthB - thickness;
      }
      result.faces.push(polygonPiece(`${columnId}:return`, returnSide.type,
        [[back, legB], [depthB, legB], [depthB, legB + returnSide.width],
          [back, legB + returnSide.width]].map(toWall), run.z + run.height));
    }
  }
  return result;
}
