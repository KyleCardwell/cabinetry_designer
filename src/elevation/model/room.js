import { mirrorGrid } from './grid.js';
import { isFollowAnchor } from './joints.js';
import { wallFrame, wallLength } from './geometry.js';
import { wallSideView } from './wallSides.js';

export { compensateRuns } from './roomClone.js';
export {
  describeAnchor, endCornerAnglesForRun, endMinWidthsForRun, resolveRunAnchorDatum,
} from './runAnchors.js';
export { pinTargetsForRun, resolvePinTarget } from './runPins.js';
export { roomDiagnostics, syncRoom, tryPlaceRun } from './roomSync.js';
export {
  dissolveJoint, joinEdges, joinStack, joinTouchingEdges, joinTouchingStack, moveJoint, resizeRun,
} from './runJoins.js';
export { moveRun, stretchRun } from './runMoves.js';

function flipAnchor(anchor) {
  if (isFollowAnchor(anchor)) return { ...anchor, side: anchor.side === 'left' ? 'right' : 'left' };
  if (anchor?.to === 'recess') return { ...anchor, edge: anchor.edge === 'left' ? 'right' : 'left' };
  return anchor;
}

function mirrorBoxes(boxes) {
  return Object.fromEntries(Object.entries(boxes).map(([key, box]) => [
    key === 'left' ? 'right' : key === 'right' ? 'left' : key, box,
  ]));
}

/** Mirror a wall's elevation-facing state and stored run intent. */
export function flipRunsForWall(wall) {
  const length = wallLength(wall);
  return {
    ...wall,
    flipped: !wall.flipped,
    joints: (wall.joints ?? []).map((joint) => ({
      ...joint,
      x: length - joint.x,
    })),
    runs: wall.runs.map((run) => ({
      ...run,
      x: length - run.x - run.width,
      // SPEC-RF1: the flex record mirrors with the run.
      ...(run.flex ? {
        flex: {
          ...run.flex,
          left: run.flex.right,
          right: run.flex.left,
          x: length - run.flex.x - run.flex.width,
          ...(run.flex.boxes ? { boxes: mirrorBoxes(run.flex.boxes) } : {}),
        },
      } : {}),
      ends: { left: { ...run.ends.right }, right: { ...run.ends.left } },
      anchors: { left: flipAnchor(run.anchors.right), right: flipAnchor(run.anchors.left) },
      ...(run.cornerClearance
        ? {
            cornerClearance: {
              left: run.cornerClearance.right,
              right: run.cornerClearance.left,
            },
          }
        : {}),
      ...(run.blind
        ? { blind: { left: run.blind.right, right: run.blind.left } }
        : {}),
      ...(run.endFiller
        ? {
            endFiller: {
              left: run.endFiller.right ? { ...run.endFiller.right } : run.endFiller.right,
              right: run.endFiller.left ? { ...run.endFiller.left } : run.endFiller.left,
            },
          }
        : {}),
      ...(run.items ? { items: [...run.items].reverse().map((item) => ({ ...item })) } : {}),
      ...(run.grid ? { grid: mirrorGrid(run.grid) } : {}),
    })),
    openings: (wall.openings ?? []).map((opening) => ({
      ...opening,
      offsetFrom: opening.offsetFrom === 'left' ? 'right' : 'left',
      casing: opening.casing ? { ...opening.casing } : null,
    })),
    ...(wall.recesses
      ? {
          recesses: wall.recesses.map((recess) => ({
            ...recess,
            offsetFrom: recess.offsetFrom === 'left' ? 'right' : 'left',
          })),
        }
      : {}),
  };
}

/** Return a wall with its derived elevation length for legacy elevation consumers. */
export function resolveWall(room, wall, side = 'front') {
  return wall ? { ...wallSideView(wall, side), length: wallFrame(room, wall).length } : null;
}
