import { blindEntries } from './blind.js';
import { blindCellWidths, cellDepth, cellPieces, panelOrientation } from './cells.js';
import { findLeaf } from './cellTree.js';
import { frontDepth } from './corners.js';
import { frameRegions } from './frames.js';
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

function fillerReturns(run, settings, layout, panels, faceBack, hidden = new Set()) {
  return layout.pieces.flatMap((piece, index) => {
    if (piece.kind !== 'filler' || hidden.has(piece.id)) return [];
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

/**
 * A face frame region in plan (SPEC-36.1): one strip from the box fronts to the frame's front, mitered
 * into the end or side panel it covers at either end; those panels get the matching miter.
 */
function frameStrips(frames, pieces, faces, back, front) {
  const strips = [];
  const mitered = new Map();
  for (const region of frames.regions) {
    const end = region.x + region.width;
    const panels = pieces.filter((piece) => region.panelIds.includes(piece.id));
    const left = panels.find((panel) => Math.abs(panel.x - region.x) <= WIDTH_EPSILON);
    const right = panels.find((panel) => Math.abs(panel.x + panel.width - end) <= WIDTH_EPSILON);
    strips.push({
      key: region.id,
      kind: 'frame',
      start: region.x,
      end,
      back,
      front,
      polygon: [
        [region.x, front],
        [end, front],
        [right ? right.x : end, back],
        [left ? left.x + left.width : region.x, back],
      ],
    });
    if (left) mitered.set(left.id, 'left');
    if (right) mitered.set(right.id, 'right');
  }
  const next = faces.map((range) => {
    const side = mitered.get(range.key);
    if (!side) return range;
    const polygon = side === 'left'
      ? [[range.start, range.back], [range.end, range.back], [range.end, back], [range.start, range.front]]
      : [[range.start, range.back], [range.end, range.back], [range.end, range.front], [range.start, back]];
    return { ...range, polygon };
  });
  return [...next, ...strips];
}

/** Return the boxes, faces, filler returns, and their overall span used by the plan view. */
export function planRunPieces(room, wall, run, settings, layout, faceLayouts) {
  const outset = run.outset ?? 0;
  const faceBack = run.depth + settings.bumperThickness;
  const faceFront = frontDepth(run, settings) - outset;
  const cells = cellPieces(run, layout);
  const frames = frameRegions(room, run, cells, settings);
  const framedIds = new Set(frames.regions.flatMap((region) => region.cabinetIds));
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
    const frameBox = framedIds.has(piece.id) ? faceLayouts.get(piece.id)?.box : null;
    return [{
      key: piece.id,
      start: blindBox?.start ?? (leftBlindWidth
        ? piece.x + piece.width - leftBlindWidth
        : frameBox?.x ?? piece.x),
      end: blindBox?.end ?? (rightBlindWidth
        ? piece.x + rightBlindWidth
        : frameBox ? frameBox.x + frameBox.width : piece.x + piece.width),
      ...band(piece),
      ...(piece.kind === 'shelves' ? { dashed: true } : {}),
    }];
  });
  const faces = frameStrips(frames, cells.pieces, planFaces(
    run,
    settings,
    cells.pieces.filter((piece) => !framedIds.has(piece.id) && !frames.fillerIds.has(piece.id)),
    faceLayouts,
    panels,
    band,
    faceBack,
    faceFront,
  ), run.depth, faceFront);
  const returns = fillerReturns(run, settings, layout, panels, faceBack, frames.fillerIds);
  const pieces = [...boxes, ...faces, ...returns];
  const shift = (piece) => (outset
    ? {
      ...piece,
      back: piece.back + outset,
      front: piece.front + outset,
      ...(piece.polygon ? { polygon: piece.polygon.map(([u, v]) => [u, v + outset]) } : {}),
    }
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
