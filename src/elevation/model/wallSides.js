import { add, scale, wallFrame } from './geometry.js';

export const WALL_SIDES = ['front', 'back'];

export function wallSideOf(entity) {
  return entity?.wallSide === 'back' ? 'back' : 'front';
}

export function mirrorOpening(opening) {
  return {
    ...opening,
    offsetFrom: opening.offsetFrom === 'left' ? 'right' : 'left',
  };
}

export function wallSideView(wall, side = 'front') {
  if (wall.sideSource && wall.side === side) return wall;
  const source = wall.sideSource ?? wall;
  return {
    ...source,
    side,
    sideSource: source,
    flipped: side === 'back' ? !source.flipped : Boolean(source.flipped),
    runs: source.runs.filter((run) => wallSideOf(run) === side),
    joints: (source.joints ?? []).filter((joint) => wallSideOf(joint) === side),
    openings: side === 'back' ? source.openings.map(mirrorOpening) : source.openings,
  };
}

export function wallViewForRun(wall, run) {
  return wallSideView(wall, wallSideOf(run));
}

export function wallEndPanelAt(room, wall, side, settings) {
  const frame = wallFrame(room, wall);
  const endpoint = side === 'left' ? frame.leftEndpoint : frame.rightEndpoint;
  if (wall.connections?.[endpoint]) return null;
  const panel = wall.endPanels?.[endpoint];
  if (!panel) return null;
  return { endpoint, width: panel.width ?? settings.endPanelThickness };
}

export function wallSideFrame(room, wall, side = 'front') {
  const view = wallSideView(wall, side);
  const frame = wallFrame(room, view);
  if (side !== 'back' || !(view.thickness > 0)) return frame;
  const offset = scale(frame.n, view.thickness);
  return {
    ...frame,
    leftPoint: add(frame.leftPoint, offset),
    rightPoint: add(frame.rightPoint, offset),
  };
}
