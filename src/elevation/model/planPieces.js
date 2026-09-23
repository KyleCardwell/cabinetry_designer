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

function endSideOf(piece) {
  if (piece.role === 'end-left') return 'left';
  if (piece.role === 'end-right') return 'right';
  return null;
}

/** The ordered width of a filler piece, or null when it is what the layout says. */
export function fillerOrderedWidth(run, piece, settings) {
  const side = endSideOf(piece);
  if (!side) return null;
  const stored = run.endFiller?.[side]?.width;
  if (stored > 0) return stored;
  return run.ends?.[side]?.type === 'blind' ? settings.blindFillerWidth : null;
}

/** How far a filler piece's return runs back behind its face. */
export function fillerReturnDepth(run, piece, settings) {
  const side = endSideOf(piece);
  const stored = side ? run.endFiller?.[side]?.returnDepth : null;
  if (stored !== undefined && stored !== null) return stored;
  if (side && run.ends?.[side]?.type === 'blind') return 0;
  return settings.fillerReturnDepth;
}

function fillerSpan(run, piece, settings) {
  const side = endSideOf(piece);
  const width = fillerOrderedWidth(run, piece, settings);
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

function planFaces(run, settings, layout, faceLayouts, faceBack, faceFront) {
  return layout.pieces.flatMap((piece) => {
    if (piece.kind === 'cabinet') {
      return cabinetFaces(piece, faceLayouts, faceBack, faceFront);
    }
    if (piece.kind === 'filler') {
      const { start, end } = fillerSpan(run, piece, settings);
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
        back: 0,
        front: faceFront,
      }];
    }
    return [];
  });
}

function fillerReturns(run, settings, layout, faceBack) {
  return layout.pieces.flatMap((piece, index) => {
    if (piece.kind !== 'filler') return [];

    const span = fillerSpan(run, piece, settings);
    const trueWidth = span.end - span.start;
    const thickness = Math.min(settings.fillerReturnThickness, trueWidth);
    const returnDepth = fillerReturnDepth(run, piece, settings);
    if (!(returnDepth > 0)) return [];

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

/** Return the boxes, faces, filler returns, and their overall span used by the plan view. */
export function planRunPieces(room, wall, run, settings, layout, faceLayouts) {
  const faceBack = run.depth + settings.bumperThickness;
  const faceFront = frontDepth(run, settings);
  const blindBoxes = new Map(blindEntries(room, wall, run, settings, layout).entries
    .filter((entry) => entry.extension > WIDTH_EPSILON)
    .map((entry) => [entry.pieceId, {
      start: entry.boxX,
      end: entry.boxX + entry.boxWidth,
    }]));
  const boxes = layout.pieces.flatMap((piece) => {
    if (piece.kind !== 'cabinet') return [];
    const blindBox = blindBoxes.get(piece.id);
    return [{
      key: piece.id,
      start: blindBox?.start ?? piece.x,
      end: blindBox?.end ?? piece.x + piece.width,
      back: 0,
      front: run.depth,
    }];
  });
  const faces = planFaces(run, settings, layout, faceLayouts, faceBack, faceFront);
  const returns = fillerReturns(run, settings, layout, faceBack);
  const pieces = [...boxes, ...faces, ...returns];

  return {
    span: {
      start: Math.min(...pieces.map((piece) => piece.start)),
      end: Math.max(...pieces.map((piece) => piece.end)),
    },
    boxes,
    faces,
    returns,
  };
}
