import { frontDepth } from './corners.js';
import { wallFrame } from './geometry.js';
import { wallSideView } from './wallSides.js';

const EPSILON = 1e-6;

/** How far a mitered face frame cuts into the panel's inside corner, front and back (SPEC-36.2). */
function panelMiters(source, panel) {
  const depth = (face) => Math.max(0, ...source.runs
    .filter((run) => panel[face].runIds.includes(run.id)
      && run._frame?.wallPanels?.[panel[face].side]?.join === 'miter')
    .map((run) => run._frame.thickness));
  return { front: depth('front'), back: depth('back') };
}

function panelSide(room, wall, endpoint, elevationSide, width, settings) {
  const view = wallSideView(wall, elevationSide);
  const frame = wallFrame(room, view);
  const side = frame.leftEndpoint === endpoint ? 'left' : 'right';
  const runs = view.runs.filter((run) => run.anchors?.[side] === true);
  return {
    side,
    x: side === 'left' ? 0 : frame.length - width,
    depth: runs.reduce((depth, run) => Math.max(depth, frontDepth(run, settings)), 0),
    top: runs.reduce((top, run) => Math.max(top, run.z + run.height), 0),
    runIds: runs.map((run) => run.id),
  };
}

export function wallEndPanels(room, wall, settings) {
  const source = wall.sideSource ?? wall;
  return ['start', 'end'].flatMap((endpoint) => {
    const stored = source.endPanels?.[endpoint];
    if (!stored || source.connections?.[endpoint] || source.landings?.[endpoint]) return [];
    const width = stored.width ?? settings.endPanelThickness;
    const front = panelSide(room, source, endpoint, 'front', width, settings);
    const back = panelSide(room, source, endpoint, 'back', width, settings);
    const top = Math.max(front.top, back.top);
    return top > 0 ? [{
      endpoint,
      width,
      top,
      thickness: source.thickness,
      front,
      back,
    }] : [];
  });
}

export function wallEndPanelPolygon(room, wall, panel) {
  const source = wall.sideSource ?? wall;
  const frame = wallFrame(room, wallSideView(source, 'front'));
  const point = (x, offset) => ({
    x: frame.leftPoint.x + frame.r.x * x + frame.n.x * offset,
    y: frame.leftPoint.y + frame.r.y * x + frame.n.y * offset,
  });
  const left = panel.front.x;
  const right = left + panel.width;
  const back = -(panel.thickness + panel.back.depth);
  const front = panel.front.depth;
  // A face frame mitered into the panel stops its inside edge at the box fronts (SPEC-36.2).
  const miter = panelMiters(source, panel);
  const inside = panel.front.side === 'left' ? right : left;
  const cut = (x, amount) => (x === inside ? amount : 0);
  return [
    point(left, back + cut(left, miter.back)),
    point(right, back + cut(right, miter.back)),
    point(right, front - cut(right, miter.front)),
    point(left, front - cut(left, miter.front)),
  ];
}

/**
 * The heights of a wall end panel left showing on one elevation (SPEC-36.2): all of it, floor to
 * top, less where a face frame run on this side is mitered over its edge.
 */
export function wallEndPanelSpans(wall, panel) {
  const side = panel[wall.side ?? 'front'];
  const covers = (wall.runs ?? [])
    .filter((run) => side.runIds.includes(run.id)
      && run._frame?.wallPanels?.[side.side]?.join === 'miter')
    .map((run) => [run.z - run._frame.drop, run.z + run.height])
    .sort((a, b) => a[0] - b[0]);
  const spans = [];
  let cursor = 0;
  for (const [bottom, top] of covers) {
    const end = Math.min(bottom, panel.top);
    if (end - cursor > EPSILON) spans.push({ z: cursor, height: end - cursor });
    cursor = Math.max(cursor, top);
  }
  if (panel.top - cursor > EPSILON) spans.push({ z: cursor, height: panel.top - cursor });
  return spans;
}

/** Whether a face frame run meets this wall end panel on either side (SPEC-36.2.1). */
export function wallEndPanelFramed(wall, panel) {
  const source = wall.sideSource ?? wall;
  const ids = [...panel.front.runIds, ...panel.back.runIds];
  return source.runs.some((run) => ids.includes(run.id) && Boolean(run._frame));
}
