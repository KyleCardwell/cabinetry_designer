import { Shape } from 'react-konva';
import { elevationToPlan } from '../model/geometry.js';
import { runLegs } from '../model/legs.js';
import { runLegFills } from '../model/legFills.js';
import { outlineGeometry } from '../components/outlinePath.js';

const PLAN_TRANSFORM = { scale: 1, offsetX: 0, offsetY: 0, wallHeight: 0 };

export default function PlanLegs({ room, wall, run, settings, frame, scale, stroke, onSelect }) {
  const orientation = Math.sign(frame.r.x * frame.n.y - frame.r.y * frame.n.x);
  const loops = runLegs(room, wall, run, settings).flatMap(({ leg, plan }) => plan.loops
    .map((loop, index) => ({ ...loop, id: `${leg.id}:${index}` })));
  loops.push(...runLegFills(room, wall, run, settings).map(({ id, bounds: { x, width }, back, front }) => ({
    id, closed: true, points: [[x, back], [x + width, back], [x + width, front], [x, front]],
  })));
  return loops.map(({ id, closed, points }) => {
    // The shared tracer expects z-up; map plan y to -z and reverse bulges for that reflection.
    const outline = points.map(([u, v, bulge = 0]) => {
      const point = elevationToPlan(frame, u, v);
      return [point.x, -point.y, -orientation * bulge];
    });
    return (
      <Shape key={id} {...outlineGeometry(outline, PLAN_TRANSFORM, { closed })}
        stroke={stroke} strokeWidth={1 / scale} fillEnabled={false} hitStrokeWidth={8 / scale}
        onClick={onSelect} />
    );
  });
}
