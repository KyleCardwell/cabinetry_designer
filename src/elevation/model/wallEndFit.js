import { DEFAULT_SETTINGS } from './constants.js';
import { frontDepth, runBackOffset } from './corners.js';
import { legBottom, legShapeOf } from './legSupport.js';
import { wallEndLegList } from './wallEndLegs.js';
import { wallEndpointSide } from './wallEndPanels.js';
import { wallSideView } from './wallSides.js';

/** A fitted wall panel in wall-frame depth and distance inward from its end line. */
export function wallEndFit(room, wall, endpoint, settings = DEFAULT_SETTINGS) {
  const source = wall.sideSource ?? wall;
  const end = source.endLegs?.[endpoint];
  const warnings = [];
  if (!source.endPanels?.[endpoint] || end?.fit !== 'between'
    || source.connections?.[endpoint] || source.landings?.[endpoint]) return { warnings };
  const legs = wallEndLegList(room, source, settings)
    .filter(({ leg }) => leg.wall.endpoint === endpoint)
    .flatMap(({ runId, leg }) => {
      const shape = legShapeOf(leg, settings);
      if (!shape) return [];
      const run = source.runs.find(({ id }) => id === runId);
      const view = wallSideView(source, leg.wall.face);
      const x = leg.from === 'left' ? leg.wall.endX - leg.x
        : leg.wall.endX + leg.x - shape.box.w;
      const support = legBottom(room, view, run, settings, leg, x, shape.box.w).z;
      const height = leg.height === 'full' ? run.z + run.height - support
        : leg.height === 'feet' ? run.z - support : leg.height;
      if (height <= 1e-6) return [];
      const front = leg.yFrom === 'front' ? frontDepth(run, settings) + leg.y
        : runBackOffset(run) - leg.y + shape.box.d;
      const back = front - shape.box.d;
      return [{ leg, support,
        front: leg.wall.face === 'front' ? front : -(source.thickness + back),
        back: leg.wall.face === 'front' ? back : -(source.thickness + front) }];
    });
  if (legs.length !== 2) return { warnings };
  const foremost = legs[0].front >= legs[1].front ? legs[0] : legs[1];
  const rearmost = legs.find((entry) => entry !== foremost);
  const hi = foremost.back;
  const lo = rearmost.front;
  const name = `${wallEndpointSide(room, source, endpoint, 'front') === 'left' ? 'Left' : 'Right'} end wall panel`;
  if (hi - lo <= 1 / 1000) return { warnings: [{ code: 'wall-panel-no-depth', name }] };
  const panel = end.panel ?? {};
  const top = Math.max(0, ...['front', 'back'].flatMap((face) => {
    const side = wallEndpointSide(room, source, endpoint, face);
    return wallSideView(source, face).runs.filter((run) => run.anchors?.[side] === true)
      .map((run) => run.z + run.height);
  })) - (panel.top ?? settings.legPanelTopClearance);
  const bottom = foremost.support + (panel.bottom ?? settings.legPanelBottomClearance);
  if (top - bottom <= 1 / 1000) return { warnings: [{ code: 'wall-panel-no-height', name }] };
  const s0 = -foremost.leg.x + (panel.inset ?? settings.legPanelReveal);
  return { hi, lo, s0, top, bottom, warnings };
}
