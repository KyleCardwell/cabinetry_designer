import { resolveWall } from './room.js';
import { runScene } from './runScene.js';
import { planRunPieces } from './planPieces.js';
import { frontDepth, runBackOffset } from './corners.js';

const EPSILON = 1e-6;

/**
 * Every part on one wall face as geometry draws it (SPEC-41): its rectangle in elevation coordinates
 * and its depth from the wall face, read from the plan view so the two always agree. Run by run in
 * view order; within a run: boxes, then fillers/end panels/panels/Ts, then frames (step 316 adds
 * shelves, then faces).
 */
export function elevationParts(room, wall, side, settings) {
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
      });
    }

    for (const region of scene.frames.regions) {
      const entry = faces.get(region.id);
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
        holes: region.cabinetIds.flatMap((id) => scene.faceLayouts.get(id).openings
          .map(({ x, z, width, height }) => ({ x, z, width, height }))),
      });
    }
  }

  return parts;
}
