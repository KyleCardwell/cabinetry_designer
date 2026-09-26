import { frontDepth } from './corners.js';
import { CABINET_TYPE_IDS } from './constants.js';
import {
  dot,
  elevationToPlan,
  planPointToWallX,
  subtract,
} from './geometry.js';
import { resolveProfile } from './profile.js';
import { runTop } from './tops.js';
import { WALL_SIDES, wallSideFrame, wallSideView } from './wallSides.js';

const PROFILE_EPSILON = 1e-6;

/** Return visible neighbouring runs projected beyond this wall's ends. */
export function neighborProfiles(room, wall, settings) {
  const view = wallSideView(wall, wall.side ?? 'front');
  const source = view.sideSource ?? view;
  const frame = wallSideFrame(room, source, view.side);
  const length = frame.length;
  const handled = new Set();
  const profiles = [];

  for (const endpoint of ['start', 'end']) {
    const wallId = source.connections?.[endpoint]?.wallId;
    if (!wallId || handled.has(wallId)) continue;
    handled.add(wallId);

    const neighbor = room.walls.find((candidate) => candidate.id === wallId);
    if (!neighbor) continue;

    for (const side of WALL_SIDES) {
      const neighborFrame = wallSideFrame(room, neighbor, side);
      const neighborView = wallSideView(neighbor, side);
      const profile = resolveProfile(settings, room, neighbor);
      for (const run of neighborView.runs) {
        const depth = frontDepth(run, settings);
        const corners = [run.x, run.x + run.width].flatMap((x) => (
          [0, depth].map((offset) => elevationToPlan(neighborFrame, x, offset))
        ));
        const furthest = Math.max(...corners.map((point) => (
          dot(subtract(point, frame.leftPoint), frame.n)
        )));
        if (furthest <= PROFILE_EPSILON) continue;

        const xs = corners.map((point) => planPointToWallX(frame, point));
        const xMin = Math.min(...xs);
        const xMax = Math.max(...xs);
        const spans = [
          [xMin, Math.min(xMax, 0)],
          [Math.max(xMin, length), xMax],
        ];
        const toeKickHeight = run.overrides?.toeKickHeight ?? profile.toeKickHeight;
        const boxTop = run.z + run.height;
        const top = runTop(neighborView, run, profile).kind;
        const moldings = [];
        if (
          (run.cabinetTypeId === CABINET_TYPE_IDS.BASE
            || run.cabinetTypeId === CABINET_TYPE_IDS.TALL)
          && toeKickHeight > 0
        ) {
          moldings.push({ kind: 'toeKick', z: 0, height: toeKickHeight });
        }
        if (top === 'crown' || top === 'topMold') {
          moldings.push({ kind: 'topMold', z: boxTop, height: profile.topMoldHeight });
        }
        if (top === 'crown') {
          moldings.push({
            kind: 'crown',
            z: boxTop + profile.crownStackHeight - profile.crownHeight,
            height: profile.crownHeight,
          });
        }

        for (const [start, end] of spans) {
          if (end - start <= PROFILE_EPSILON) continue;
          profiles.push({
            key: `${neighbor.id}:${side}:${run.id}:${start < 0 ? 'left' : 'right'}`,
            wallId: neighbor.id,
            runId: run.id,
            cabinetTypeId: run.cabinetTypeId,
            side,
            x: start,
            width: end - start,
            z: run.z,
            height: run.height,
            moldings,
          });
        }
      }
    }
  }

  return profiles.sort((a, b) => a.x - b.x || a.z - b.z);
}
