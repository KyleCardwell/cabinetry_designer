import { resolveWall } from './room.js';
import { runScene } from './runScene.js';
import { runBands } from './runBands.js';
import { planRunPieces } from './planPieces.js';
import { frontDepth, runBackOffset } from './corners.js';
import { shelfParts } from './cells.js';
import { sheetThickness, teamDoorStyle } from './doorStyles.js';
import { isInsetStyle } from './styles.js';

const EPSILON = 1e-6;

/** Notched perimeter in absolute x/z, counter-clockwise from bottom-left (ST2). */
export function frameRegionOutline(region) {
  if (!region.notches?.length) return undefined;
  const { x, z, width, height, notches } = region;
  const top = z + height;
  const outline = [[x, z]];
  for (const notch of notches.filter(({ edge }) => edge === 'bottom').sort((a, b) => a.x - b.x)) {
    outline.push([notch.x, z], [notch.x, notch.z + notch.height],
      [notch.x + notch.width, notch.z + notch.height], [notch.x + notch.width, z]);
  }
  outline.push([x + width, z], [x + width, top]);
  for (const notch of notches.filter(({ edge }) => edge === 'top').sort((a, b) => b.x - a.x)) {
    outline.push([notch.x + notch.width, top], [notch.x + notch.width, notch.z],
      [notch.x, notch.z], [notch.x, top]);
  }
  outline.push([x, top]);
  return outline;
}

/**
 * Every part on one wall face as geometry draws it (SPEC-41): its rectangle in elevation coordinates
 * and its depth from the wall face, read from the plan view so the two always agree. Run by run in
 * view order; within a run: boxes, then fillers/end panels/panels/Ts, then frames, then shelves,
 * then faces. An end panel or filler with a chip detail carries it as a detail line (SPEC-42).
 * `withDecks` (interiors only, never the payload) adds each face frame cabinet's raised deck:
 * `deckZ`, how far the deck's underside sits above the box bottom (IN5.2).
 */
/**
 * A face frame cabinet's deck top sits flush with the bottom of the frame opening (Kyle 2026-10-18):
 * a standard 1 1/2" rail puts a 3/4" deck 1 1/8" up on centre, and a bead or a changed bottom rail
 * moves it with the rail. A rail that hangs below the box (uppers, hanging bases, a shared rail)
 * leaves 3/4" or less, so the deck stays at the bottom. Euro decks stay at the bottom.
 */
function deckZ(layout, settings) {
  if (!layout || !isInsetStyle(layout.style)) return 0;
  return Math.max(0, (layout.reveals.values.bottom ?? 0) - sheetThickness(settings));
}

export function elevationParts(room, wall, side, settings, { withDecks = false } = {}) {
  const view = resolveWall(room, wall, side);
  const parts = [];
  const emit = (part) => {
    if (part.width > EPSILON && part.height > EPSILON) parts.push(part);
  };

  for (const run of view.runs) {
    const scene = runScene(room, view, run, settings);
    const plan = planRunPieces(room, view, run, settings, scene.result, scene.faceLayouts);
    const boxes = new Map(plan.boxes.map((entry) => [entry.key, entry]));
    const faces = new Map(plan.faces.map((entry) => [entry.key, entry]));
    const cells = new Map(scene.cells.pieces.map((piece) => [piece.id, piece]));
    const outset = runBackOffset(run);
    const { chipLines } = runBands(room, view, run, settings, scene);

    for (const box of boxes.values()) {
      const piece = cells.get(box.key);
      if (piece?.kind !== 'cabinet') continue;
      emit({
        id: piece.id,
        kind: 'cabinet',
        runId: run.id,
        x: box.start,
        z: piece.z,
        width: box.end - box.start,
        height: piece.height,
        back: box.back,
        front: box.front,
        coversBoxEdges: false,
        ...(withDecks ? { deckZ: deckZ(scene.faceLayouts.get(piece.id), settings) } : {}),
      });
    }

    for (const piece of scene.drawnPieces) {
      if (!['filler', 'end_panel', 'panel'].includes(piece.kind)
        || scene.hiddenIds.has(piece.id)) continue;
      const entry = faces.get(piece.id);
      const blindPanel = scene.panelPieceIds.has(piece.id) && entry;
      let back;
      let front;
      if (entry) {
        ({ back, front } = entry);
      } else if (piece.role === 'tee') {
        back = outset + run.depth;
        front = back + settings.teeThickness;
      } else {
        back = outset;
        front = frontDepth(run, settings);
      }
      const frame = scene.frames.regions.find((region) => region.panelIds.includes(piece.id));
      if (frame) front = faces.get(frame.id).back;
      const chip = chipLines.find((line) => line.pieceId === piece.id);
      emit({
        id: piece.id,
        kind: piece.kind,
        runId: run.id,
        x: blindPanel ? entry.start : piece.x,
        z: piece.z,
        width: blindPanel ? entry.end - entry.start : piece.width,
        height: piece.height,
        back,
        front,
        coversBoxEdges: piece.kind === 'filler'
          || scene.ells.some((ell) => ell.pieceId === piece.id),
        ...(chip ? { lines: [{ x1: chip.x1, z1: chip.z, x2: chip.x2, z2: chip.z }] } : {}),
      });
    }

    for (const region of scene.frames.regions) {
      const entry = faces.get(region.id);
      const outline = frameRegionOutline(region);
      emit({
        id: region.id,
        kind: 'frame',
        runId: run.id,
        x: region.x,
        z: region.z,
        width: region.width,
        height: region.height,
        back: entry.back,
        front: entry.front,
        coversBoxEdges: true,
        ...(outline ? { outline } : {}),
        holes: region.cabinetIds.flatMap((id) => scene.faceLayouts.get(id).openings
          .map(({ x, z, width, height }) => ({ x, z, width, height }))),
      });
    }

    for (const piece of scene.cells.pieces) {
      if (piece.kind !== 'shelves') continue;
      const box = boxes.get(piece.id);
      for (const part of shelfParts(piece, settings)) {
        const back = part.kind === 'shelf' ? box.front - part.depth : box.back;
        const front = part.kind === 'shelf' ? box.front : box.back + part.depth;
        emit({
          id: part.id,
          kind: part.kind,
          runId: run.id,
          x: part.x,
          z: part.z,
          width: part.width,
          height: part.height,
          back,
          front,
          coversBoxEdges: false,
        });
      }
    }

    for (const [pieceId, layout] of scene.faceLayouts) {
      const frame = scene.frames.regions.find((region) => region.cabinetIds.includes(pieceId));
      for (const face of layout.faces) {
        if (face.type === 'open') continue;
        const thickness = face.thickness ?? teamDoorStyle(settings).thickness;
        const back = frame
          ? faces.get(frame.id).front - thickness
          : boxes.get(pieceId).front + settings.bumperThickness;
        const front = frame ? faces.get(frame.id).front : back + thickness;
        emit({
          id: `${pieceId}:${face.path}${face.half ?? ''}`,
          kind: 'face',
          runId: run.id,
          x: face.x,
          z: face.z,
          width: face.width,
          height: face.height,
          back,
          front,
          coversBoxEdges: true,
        });
      }
    }
  }

  return parts;
}
