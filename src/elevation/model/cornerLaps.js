import { anchoredToCorner, cornerForRunSide, cornerReserveParts } from './corners.js';
import { runFillerThickness } from './planPieces.js';
import { horizontalResolution } from './runAnchors.js';
import { wallViewForRun } from './wallSides.js';

function flexFiller(run, side) {
  const end = run.ends?.[side];
  return end?.type === 'filler' && end.width == null;
}

/** Decide which of two flex corner fillers laps, using spans resolved without laps. */
export function cornerLap(room, wall, run, side, settings, { ignoreOwn = false } = {}) {
  wall = wallViewForRun(wall, run);
  const corner = cornerForRunSide(room, wall, run, side);
  const anchor = run.anchors?.[side];
  if (corner.type !== 'inside' || !flexFiller(run, side)
    || !anchoredToCorner(anchor, corner)) return null;

  const parts = cornerReserveParts(room, wall, side, run, settings, { laps: false });
  const neighborWall = room.walls.find(({ id }) => id === corner.neighborWallId);
  const neighbor = neighborWall?.runs.find(({ id }) => id === parts.neighborRunId);
  const neighborSide = corner.neighborSide;
  if (!neighbor || !flexFiller(neighbor, neighborSide)) return null;
  const neighborView = wallViewForRun(neighborWall, neighbor);
  const own = ignoreOwn ? undefined : run.endFiller?.[side]?.cornerLap;
  const other = neighbor.endFiller?.[neighborSide]?.cornerLap;

  function decision(value) {
    if (value || other) {
      return { laps: value ? value === 'over' : other === 'into', source: 'manual' };
    }
    const free = !run.anchors?.[side === 'left' ? 'right' : 'left'];
    const neighborFree = !neighbor.anchors?.[neighborSide === 'left' ? 'right' : 'left'];
    if (free !== neighborFree) return { laps: free, source: 'free-end' };
    const width = horizontalResolution(room, wall, run, settings, { laps: false }).width;
    const neighborWidth = horizontalResolution(room, neighborView, neighbor, settings, { laps: false }).width;
    if (Math.abs(width - neighborWidth) > 1e-6) return { laps: width < neighborWidth, source: 'shorter' };
    return {
      laps: side !== neighborSide ? side === 'right'
        : room.walls.findIndex(({ id }) => id === wall.id)
          < room.walls.findIndex(({ id }) => id === neighborWall.id),
      source: 'tie',
    };
  }

  const automatic = decision(undefined);
  return {
    ...(own ? decision(own) : automatic),
    auto: automatic.laps,
    amount: runFillerThickness(room, neighborView, neighbor, settings),
    neighborRunId: neighbor.id,
    neighborWallId: neighborWall.id,
    conflict: Boolean(own && own === other),
  };
}
