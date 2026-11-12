import { cornerEnd } from './cornerEnd.js';
import { cornerLegBands } from './cornerLegBands.js';
import { cornerReturnPoint } from './corners.js';
import { squashDoorDetails, squashFaceLayouts, squashPulls } from './cornerSquash.js';
import { runDoorDetails } from './doorDetails.js';
import { flipHinges } from './faces.js';
import { runItems, updateRootItem } from './grid.js';
import { runPulls } from './pullLayouts.js';
import { runScene } from './runScene.js';
import { wallViewForRun } from './wallSides.js';

/** True-size door details and their scene for a Corner 90 return leg. */
export function cornerLegBDetails(room, wall, run, settings, columnId, entry) {
  const faceLayout = entry.cornerReturn.legB;
  const item = runItems(run).find(({ id }) => id === columnId);
  const stored = run.ends[entry.corner.side].corner?.legBFace;
  const face = stored ? { type: stored } : item.face ? flipHinges(item.face) : null;
  const legRun = {
    ...run,
    ...(run.grid ? { grid: updateRootItem(run.grid, columnId, { face }) } : {}),
    ...(run.items ? { items: run.items.map((item) => item.id === columnId ? { ...item, face } : item) } : {}),
  };
  const legScene = {
    faceLayouts: new Map([[columnId, faceLayout]]), drawnPieces: [], blind: { entries: [] },
  };
  const doorDetails = runDoorDetails(room, wall, legRun, settings, legScene);
  return { run: legRun, scene: legScene, doorDetails };
}

/** Drawing-only corner legs owned by runs on other wall faces. */
export function cornerReturnLegs(room, wall, settings) {
  const legs = [];
  const bands = cornerLegBands(room, wall, settings);
  const target = wall.sideSource ?? wall;
  for (const ownerWall of room.walls) {
    for (const run of ownerWall.runs) {
      let scene;
      const view = wallViewForRun(ownerWall, run);
      for (const side of ['left', 'right']) {
        if (run.ends?.[side]?.type !== 'corner') continue;
        const point = cornerReturnPoint(room, ownerWall, run, side);
        if (!point || point.wallId !== target.id || point.wallSide !== (wall.side ?? 'front')) continue;
        scene ??= runScene(room, view, run, settings);
        const corner = cornerEnd(room, ownerWall, run, side, settings, scene.result);
        const { columnId, kind, depthA, legB, returnSide } = corner;
        const entry = scene.faceLayouts.get(columnId);
        if (!entry?.cornerReturn) continue;
        const { at, dir } = point;
        const rect = {
          x: Math.min(at + dir * depthA, at + dir * legB),
          z: entry.box.z, width: legB - depthA, height: entry.box.height,
        };
        const returnPanel = ['end_panel', 'filler'].includes(returnSide.type) ? {
          type: returnSide.type,
          x: Math.min(at + dir * legB, at + dir * (legB + returnSide.width)),
          z: run.z, width: returnSide.width, height: run.height,
        } : null;
        let faceLayout, doorDetails, pulls;
        if (kind === 90) {
          faceLayout = entry.cornerReturn.legB;
          const leg = cornerLegBDetails(room, view, run, settings, columnId, entry);
          doorDetails = leg.doorDetails;
          pulls = runPulls(room, view, leg.run, settings, leg.scene, doorDetails).pulls;
        } else {
          const squash = entry.cornerReturn.squash;
          const squashes = new Map([[columnId, squash]]);
          faceLayout = squashFaceLayouts(new Map([[columnId, { ...entry, squash }]])).get(columnId);
          const details = runDoorDetails(room, view, run, settings, scene);
          doorDetails = squashDoorDetails({
            parts: details.parts.filter(({ pieceId }) => pieceId === columnId),
            warnings: details.warnings.filter(({ pieceId }) => pieceId === columnId),
          }, squashes);
          pulls = squashPulls(runPulls(room, view, run, settings, scene, details).pulls
            .filter(({ pieceId }) => pieceId === columnId), squashes);
        }
        const frame = scene.cornerFrames.find((frame) => frame.columnId === columnId)?.return;
        const sideEdge = kind === 45 && corner.shape.sideEdges ? {
          x: Math.min(at + dir * (legB - corner.shape.sideThickness), at + dir * legB),
          width: corner.shape.sideThickness,
        } : null;
        legs.push({
          key: `corner-leg:${ownerWall.id}:${run.id}:${side}`,
          ownerWallId: ownerWall.id, runId: run.id, side, columnId, kind,
          label: `Corner ${kind}`, rect, returnPanel, faceLayout, doorDetails, pulls,
          bands: bands.filter((band) => band.ownerWallId === ownerWall.id && band.runId === run.id && band.side === side),
          ...(sideEdge ? { sideEdge } : {}),
          ...(frame ? { frame } : {}),
        });
      }
    }
  }
  return legs;
}
