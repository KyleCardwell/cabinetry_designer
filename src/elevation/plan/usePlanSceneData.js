import { useMemo } from 'react';
import { planClearances } from '../model/clearances.js';
import { CABINET_TYPE_IDS } from '../model/constants.js';
import { findCollisions } from '../model/footprints.js';
import { wallFrame } from '../model/geometry.js';
import { wallLabel } from '../model/topology.js';
import { wallSideFrame, wallSideOf } from '../model/wallSides.js';

export default function usePlanSceneData({ room, walls, sceneRoom, settings }) {
  const adaptedWalls = useMemo(
    () => walls.map((wall) => ({ ...wall, wall_id: wall.id })),
    [walls],
  );
  const orderedOpenings = useMemo(() => {
    if (!room) return [];
    return walls.flatMap((wall) => {
      const frame = wallFrame(room, wall);
      return (wall.openings ?? []).map((opening) => ({ frame, wall, opening }));
    });
  }, [room, walls]);
  const collisionMessages = useMemo(() => {
    const messages = new Map();
    if (!sceneRoom) return messages;
    const runWalls = new Map(sceneRoom.walls.flatMap((wall) => (
      wall.runs.map((run) => [run.id, wall])
    )));
    for (const collision of findCollisions(sceneRoom, settings)) {
      const otherWall = runWalls.get(collision.otherRunId);
      if (otherWall && !messages.has(collision.runId)) {
        messages.set(
          collision.runId,
          `Overlaps ${wallLabel(sceneRoom, otherWall)} run — anchor both runs to the corner`,
        );
      }
    }
    return messages;
  }, [sceneRoom, settings]);
  const clearances = useMemo(
    () => (sceneRoom ? planClearances(sceneRoom, settings) : []),
    [sceneRoom, settings],
  );
  const orderedFootprints = useMemo(() => {
    if (!sceneRoom) return [];
    const entries = sceneRoom.walls.flatMap((wall) => (
      wall.runs.map((run) => ({
        frame: wallSideFrame(sceneRoom, wall, wallSideOf(run)),
        wall,
        run,
      }))
    ));
    return [
      ...entries.filter(({ run }) => run.cabinetTypeId !== CABINET_TYPE_IDS.UPPER),
      ...entries.filter(({ run }) => run.cabinetTypeId === CABINET_TYPE_IDS.UPPER),
    ];
  }, [sceneRoom]);

  return { adaptedWalls, orderedOpenings, collisionMessages, clearances, orderedFootprints };
}
