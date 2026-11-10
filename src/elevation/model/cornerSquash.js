/** Drawing-only projection from a corner face's true width onto its owner's wall. */
export function squashX(x, { pivot, k }) {
  return pivot + (x - pivot) * k;
}

export function squashRect(rect, squash) {
  return { ...rect, x: squashX(rect.x, squash), width: rect.width * squash.k };
}

export function squashFace(face, squash) {
  return { ...squashRect(face, squash), trueWidth: face.width };
}

/** Leave model layouts true; project only the entries used for drawing or picking. */
export function squashFaceLayouts(faceLayouts) {
  return new Map([...faceLayouts].map(([pieceId, entry]) => {
    const squash = entry.squash;
    return [pieceId, squash ? {
      ...entry,
      faces: entry.faces.map((face) => squashFace(face, squash)),
      openings: entry.openings.map((rect) => squashRect(rect, squash)),
      box: squashRect(entry.box, squash),
    } : entry];
  }));
}

export function cornerSquashes(faceLayouts) {
  return new Map([...faceLayouts].filter(([, entry]) => entry.squash)
    .map(([pieceId, entry]) => [pieceId, entry.squash]));
}

export function squashDoorDetails({ parts, warnings }, squashes) {
  return {
    parts: parts.map((part) => {
      const squash = squashes.get(part.pieceId);
      return squash ? {
        ...squashRect(part, squash),
        openings: part.openings.map((rect) => squashRect(rect, squash)),
        lines: part.lines.map((rect) => squashRect(rect, squash)),
        miters: part.miters.map((miter) => ({
          ...miter, x1: squashX(miter.x1, squash), x2: squashX(miter.x2, squash),
        })),
      } : part;
    }),
    warnings,
  };
}

/** Hardware keeps its size while its mounting centres follow the face projection. */
export function squashPulls(pulls, squashes) {
  return pulls.map((pull) => {
    const squash = squashes.get(pull.pieceId);
    return squash ? {
      ...pull,
      centers: pull.centers.map((center) => ({ ...center, x: squashX(center.x, squash) })),
    } : pull;
  });
}
