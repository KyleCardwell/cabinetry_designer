import { blindEntries } from './blind.js';
import { frontDepth } from './corners.js';

const WIDTH_EPSILON = 1e-6;

/** Keep only the topmost face of each vertical stack. */
export function topFaces(faces) {
  const kept = [];
  for (const face of [...faces].sort((a, b) => b.z - a.z || a.x - b.x)) {
    const overlaps = kept.some((other) => (
      Math.min(other.x + other.width, face.x + face.width)
      - Math.max(other.x, face.x) > WIDTH_EPSILON
    ));
    if (!overlaps) kept.push(face);
  }
  return kept.sort((a, b) => a.x - b.x);
}

function fillerSpan(run, piece) {
  const side = piece.role === 'end-left'
    ? 'left'
    : piece.role === 'end-right' ? 'right' : null;
  const width = side ? run.endFiller?.[side]?.width : null;
  if (!(width > 0)) return { start: piece.x, end: piece.x + piece.width };
  if (side === 'left') {
    const end = piece.x + piece.width;
    return { start: end - width, end };
  }
  return { start: piece.x, end: piece.x + width };
}

function cabinetFaces(piece, faceLayouts, faceBack, faceFront) {
  const resolved = faceLayouts.get(piece.id)?.faces;
  const faces = resolved?.length > 0
    ? topFaces(resolved)
    : [{ path: 'r', x: piece.x, width: piece.width }];

  return faces.map((face) => ({
    key: `${piece.id}:${face.path}${face.half ?? ''}`,
    kind: 'face',
    start: face.x,
    end: face.x + face.width,
    back: faceBack,
    front: faceFront,
  }));
}

function planFaces(run, layout, faceLayouts, faceBack, faceFront) {
  return layout.pieces.flatMap((piece) => {
    if (piece.kind === 'cabinet') {
      return cabinetFaces(piece, faceLayouts, faceBack, faceFront);
    }
    if (piece.kind === 'filler') {
      const { start, end } = fillerSpan(run, piece);
      return [{
        key: piece.id,
        kind: 'filler',
        start,
        end,
        back: faceBack,
        front: faceFront,
      }];
    }
    if (piece.kind === 'end_panel') {
      return [{
        key: piece.id,
        kind: 'end_panel',
        start: piece.x,
        end: piece.x + piece.width,
        back: faceBack,
        front: faceFront,
      }];
    }
    return [];
  });
}

function fillerReturns(run, settings, layout, faceBack) {
  return layout.pieces.flatMap((piece, index) => {
    if (piece.kind !== 'filler') return [];

    const span = fillerSpan(run, piece);
    const trueWidth = span.end - span.start;
    const thickness = Math.min(settings.fillerReturnThickness, trueWidth);
    const endSide = piece.role === 'end-left'
      ? 'left'
      : piece.role === 'end-right' ? 'right' : null;
    const returnDepth = endSide
      ? run.endFiller?.[endSide]?.returnDepth ?? settings.fillerReturnDepth
      : settings.fillerReturnDepth;

    return ['left', 'right'].flatMap((side) => {
      const neighborIndex = side === 'left' ? index - 1 : index + 1;
      if (layout.pieces[neighborIndex]?.kind !== 'cabinet') return [];
      return [{
        key: `${piece.id}:${side}`,
        start: side === 'left' ? span.start : span.end - thickness,
        end: side === 'left' ? span.start + thickness : span.end,
        back: faceBack - returnDepth,
        front: faceBack,
      }];
    });
  });
}

/** Return the box, divisions, faces, and filler returns used by the plan view. */
export function planRunPieces(room, wall, run, settings, layout, faceLayouts) {
  const faceBack = run.depth + settings.bumperThickness;
  const faceFront = frontDepth(run, settings);
  const blindSpans = blindEntries(room, wall, run, settings, layout).entries
    .filter((entry) => entry.extension > WIDTH_EPSILON)
    .map((entry) => [entry.boxX, entry.boxX + entry.boxWidth]);
  const start = Math.min(run.x, ...blindSpans.map(([left]) => left));
  const end = Math.max(run.x + run.width, ...blindSpans.map(([, right]) => right));
  const divisions = layout.pieces.slice(1).flatMap((piece, index) => (
    layout.pieces[index].kind === 'cabinet' && piece.kind === 'cabinet'
      ? [{ x: piece.x, back: 0, front: run.depth }]
      : []
  ));

  return {
    box: { start, end, back: 0, front: run.depth },
    divisions,
    faces: planFaces(run, layout, faceLayouts, faceBack, faceFront),
    returns: fillerReturns(run, settings, layout, faceBack),
  };
}
