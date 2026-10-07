import { cloneGrid } from './grid.js';
import { dot, subtract, wallFrame } from './geometry.js';
import { WALL_SIDES, wallSideOf, wallSideView } from './wallSides.js';

function cloneRun(run) {
  const anchors = { left: false, right: false, ...(run.anchors ?? {}) };
  return {
    ...run,
    ends: {
      left: { ...run.ends.left },
      right: { ...run.ends.right },
    },
    overrides: { ...(run.overrides ?? {}) },
    anchors: Object.fromEntries(Object.entries(anchors).map(([side, anchor]) => [
      side,
      anchor?.to === 'joint' || anchor?.to === 'follow' ? { ...anchor } : anchor,
    ])),
    ...(run.cornerClearance
      ? { cornerClearance: { ...run.cornerClearance } }
      : {}),
    ...(run.blind ? { blind: { ...run.blind } } : {}),
    ...(run.endFiller
      ? {
          endFiller: {
            ...run.endFiller,
            ...(run.endFiller.left ? { left: { ...run.endFiller.left } } : {}),
            ...(run.endFiller.right ? { right: { ...run.endFiller.right } } : {}),
          },
        }
      : {}),
    ...(run.bottom ? { bottom: run.bottom.map((part) => ({ ...part })) } : {}),
    ...(run.stack
      ? {
          stack: {
            below: run.stack.below ? { ...run.stack.below } : null,
            above: run.stack.above ? { ...run.stack.above } : null,
          },
        }
      : {}),
    ...(run.items ? { items: run.items.map((item) => ({ ...item })) } : {}),
    ...(run.grid ? { grid: cloneGrid(run.grid) } : {}),
  };
}

function cloneRoom(room) {
  return {
    ...room,
    wallOrder: [...(room.wallOrder ?? [])],
    profile: { ...room.profile },
    walls: room.walls.map((wall) => ({
      ...wall,
      name: wall.name ?? '',
      numberOverride: wall.numberOverride ?? null,
      elevationForced: wall.elevationForced ?? false,
      profile: { ...(wall.profile ?? {}) },
      connections: {
        start: wall.connections?.start ? { ...wall.connections.start } : null,
        end: wall.connections?.end ? { ...wall.connections.end } : null,
      },
      endPanels: {
        start: wall.endPanels?.start ? { ...wall.endPanels.start } : null,
        end: wall.endPanels?.end ? { ...wall.endPanels.end } : null,
      },
      landings: {
        start: wall.landings?.start ? { ...wall.landings.start } : null,
        end: wall.landings?.end ? { ...wall.landings.end } : null,
      },
      openings: (wall.openings ?? []).map((opening) => ({
        ...opening,
        casing: opening.casing ? { ...opening.casing } : null,
      })),
      soffits: (wall.soffits ?? []).map((soffit) => ({
        ...soffit,
        anchors: {
          left: soffit.anchors?.left ? { ...soffit.anchors.left } : false,
          right: soffit.anchors?.right ? { ...soffit.anchors.right } : false,
        },
      })),
      joints: (wall.joints ?? []).map((joint) => ({ ...joint })),
      runs: wall.runs.map(cloneRun),
    })),
  };
}

/**
 * Shift unanchored run x values so geometry edits keep their plan positions fixed.
 *
 * @param {object} oldRoom
 * @param {object} newRoom
 * @returns {object}
 */
export function compensateRuns(oldRoom, newRoom) {
  const oldWalls = new Map(oldRoom.walls.map((wall) => [wall.id, wall]));
  return {
    ...newRoom,
    walls: newRoom.walls.map((wall) => {
      const oldWall = oldWalls.get(wall.id);
      if (!oldWall) return wall;
      const oldWallForFrame = { openings: [], ...oldWall };
      const wallForFrame = { openings: [], ...wall };
      const shifts = Object.fromEntries(WALL_SIDES.map((side) => {
        const oldFrame = wallFrame(oldRoom, wallSideView(oldWallForFrame, side));
        const newFrame = wallFrame(newRoom, wallSideView(wallForFrame, side));
        return [side, dot(subtract(newFrame.leftPoint, oldFrame.leftPoint), newFrame.r)];
      }));
      if (WALL_SIDES.every((side) => Math.abs(shifts[side]) <= 1e-9)) return wall;
      return {
        ...wall,
        joints: (wall.joints ?? []).map((joint) => ({
          ...joint,
          x: joint.x - shifts[wallSideOf(joint)],
        })),
        runs: (wall.runs ?? []).map((run) => (
          run.anchors?.left ? run : { ...run, x: run.x - shifts[wallSideOf(run)] }
        )),
      };
    }),
  };
}

export { cloneRun, cloneRoom };
