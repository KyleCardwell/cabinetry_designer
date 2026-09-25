import { frontDepth } from './corners.js';
import { wallFrame } from './geometry.js';
import { wallSideView } from './wallSides.js';

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
  return [
    point(left, back),
    point(right, back),
    point(right, panel.front.depth),
    point(left, panel.front.depth),
  ];
}
