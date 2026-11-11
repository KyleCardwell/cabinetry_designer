import { cornerEnd } from './cornerEnd.js';
import { cornerReturnPoint } from './corners.js';
import { squashDoorDetails, squashFaceLayouts, squashPulls } from './cornerSquash.js';
import { runDoorDetails } from './doorDetails.js';
import { flipHinges } from './faces.js';
import { runItems, updateRootItem } from './grid.js';
import { runPulls } from './pullLayouts.js';
import { runScene } from './runScene.js';
import { wallViewForRun } from './wallSides.js';

/** Drawing-only corner legs owned by runs on other wall faces. */
export function cornerReturnLegs(room, wall, settings) {
  const legs = [];
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
          const item = runItems(run).find(({ id }) => id === columnId);
          const stored = run.ends[side].corner?.legBFace;
          const face = stored ? { type: stored } : item.face ? flipHinges(item.face) : null;
          const legRun = {
            ...run,
            ...(run.grid ? { grid: updateRootItem(run.grid, columnId, { face }) } : {}),
            ...(run.items ? { items: run.items.map((item) => item.id === columnId ? { ...item, face } : item) } : {}),
          };
          const legScene = {
            faceLayouts: new Map([[columnId, faceLayout]]), drawnPieces: [], blind: { entries: [] },
          };
          doorDetails = runDoorDetails(room, view, legRun, settings, legScene);
          pulls = runPulls(room, view, legRun, settings, legScene, doorDetails).pulls;
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
        legs.push({
          key: `corner-leg:${ownerWall.id}:${run.id}:${side}`,
          ownerWallId: ownerWall.id, runId: run.id, side, columnId, kind,
          label: `Corner ${kind}`, rect, returnPanel, faceLayout, doorDetails, pulls,
          ...(frame ? { frame } : {}),
        });
      }
    }
  }
  return legs;
}
