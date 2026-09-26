import { blindEntries } from './blind.js';
import { blindCellWidths, cellDepth, cellPieces, panelOrientation } from './cells.js';
import { findLeaf } from './cellTree.js';
import { frontDepth } from './corners.js';
import { runItems } from './grid.js';

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

function cabinetFaces(piece, faceLayouts) {
  const resolved = faceLayouts.get(piece.id)?.faces;
  const faces = resolved?.length > 0
    ? resolved
    : [{ path: 'r', x: piece.x, z: piece.z, width: piece.width, height: piece.height }];
  return faces.map((face) => ({ ...face, piece }));
}

function planFaces(run, settings, pieces, faceLayouts, panels, band, faceBack, faceFront) {
  const columns = new Map();
  for (const piece of pieces) {
    if (piece.kind !== 'cabinet') continue;
    const columnId = piece.columnId ?? piece.id;
    const faces = columns.get(columnId) ?? [];
    faces.push(...cabinetFaces(piece, faceLayouts));
    columns.set(columnId, faces);
  }
  const handled = new Set();

  return pieces.flatMap((piece) => {
    if (piece.kind === 'cabinet') {
      const columnId = piece.columnId ?? piece.id;
      if (handled.has(columnId)) return [];
      handled.add(columnId);
      return topFaces(columns.get(columnId) ?? []).map((face) => {
        const depth = band(face.piece);
        const back = depth.front + settings.bumperThickness;
        return {
          key: `${face.piece.id}:${face.path}${face.half ?? ''}`,
          kind: 'face',
          start: face.x,
          end: face.x + face.width,
          back,
          front: back + settings.doorThickness,
        };
      });
    }
    if (piece.kind === 'filler') {
      const panel = panels.get(endSideOf(piece));
      if (panel) {
        return [{
          key: piece.id,
          kind: 'panel',
          start: panel.x,
          end: panel.x + panel.width,
          back: faceBack,
          front: faceFront,
        }];
      }
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
    if (piece.kind === 'panel' && ['side', 'back'].includes(panelOrientation(piece))) {
      return [{
        key: piece.id,
        kind: 'panel',
        start: piece.x,
        end: piece.x + piece.width,
        ...band(piece),
      }];
    }
    return [];
  });
}

function fillerReturns(run, settings, layout, panels, faceBack) {
  return layout.pieces.flatMap((piece, index) => {
    if (piece.kind !== 'filler') return [];
    if (panels.has(endSideOf(piece))) return [];

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
  const outset = run.outset ?? 0;
  const faceBack = run.depth + settings.bumperThickness;
  const faceFront = frontDepth(run, settings) - outset;
  const cells = cellPieces(run, layout);
  const leafOf = (piece) => (piece.columnId
    ? findLeaf(run.grid, piece.id)
    : runItems(run).find((item) => item.id === piece.id));
  const band = (piece) => {
    const depth = cellDepth(piece, leafOf(piece), run.depth, settings);
    if (piece.align === 'back') return { back: 0, front: depth };
    const flushPanel = piece.kind === 'panel' && panelOrientation(piece) !== 'back'
      && piece.doors !== 'cover';
    const frontLine = flushPanel ? faceFront : run.depth;
    return { back: frontLine - depth, front: frontLine };
  };
  const blind = blindEntries(room, wall, run, settings, layout);
  const blindBoxes = new Map(blind.entries
    .filter((entry) => entry.extension > WIDTH_EPSILON)
    .map((entry) => [entry.pieceId, {
      start: entry.boxX,
      end: entry.boxX + entry.boxWidth,
    }]));
  const panels = new Map(blind.entries
    .filter((entry) => entry.panel)
    .map((entry) => [entry.side, entry.panel]));
  const leftBlindWidths = blindCellWidths(
    cells.pieces,
    layout.pieces,
    blind.entries.filter((entry) => entry.side === 'left'),
  );
  const rightBlindWidths = blindCellWidths(
    cells.pieces,
    layout.pieces,
    blind.entries.filter((entry) => entry.side === 'right'),
  );
  const boxes = cells.pieces.flatMap((piece) => {
    if (!['cabinet', 'shelves'].includes(piece.kind)) return [];
    const blindBox = blindBoxes.get(piece.id);
    const leftBlindWidth = leftBlindWidths.get(piece.id);
    const rightBlindWidth = rightBlindWidths.get(piece.id);
    return [{
      key: piece.id,
      start: blindBox?.start ?? (leftBlindWidth
        ? piece.x + piece.width - leftBlindWidth
        : piece.x),
      end: blindBox?.end ?? (rightBlindWidth ? piece.x + rightBlindWidth : piece.x + piece.width),
      ...band(piece),
      ...(piece.kind === 'shelves' ? { dashed: true } : {}),
    }];
  });
  const faces = planFaces(
    run,
    settings,
    cells.pieces,
    faceLayouts,
    panels,
    band,
    faceBack,
    faceFront,
  );
  const returns = fillerReturns(run, settings, layout, panels, faceBack);
  const pieces = [...boxes, ...faces, ...returns];
  const shift = (piece) => (outset
    ? { ...piece, back: piece.back + outset, front: piece.front + outset }
    : piece);

  return {
    span: {
      start: Math.min(...pieces.map((piece) => piece.start)),
      end: Math.max(...pieces.map((piece) => piece.end)),
    },
    boxes: boxes.map(shift),
    faces: faces.map(shift),
    returns: returns.map(shift),
  };
}
