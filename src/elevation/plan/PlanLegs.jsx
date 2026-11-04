import { Shape } from 'react-konva';
import { elevationToPlan } from '../model/geometry.js';
import { runLegs } from '../model/legs.js';
import { outlineGeometry } from '../components/outlinePath.js';

const PLAN_TRANSFORM = { scale: 1, offsetX: 0, offsetY: 0, wallHeight: 0 };

export default function PlanLegs({ room, wall, run, settings, frame, scale, stroke, onSelect }) {
  const orientation = Math.sign(frame.r.x * frame.n.y - frame.r.y * frame.n.x);
  return runLegs(room, wall, run, settings).flatMap(({ leg, plan }) => plan.loops.map(({ closed, points }, index) => {
    // The shared tracer expects z-up; map plan y to -z and reverse bulges for that reflection.
    const outline = points.map(([u, v, bulge = 0]) => {
      const point = elevationToPlan(frame, u, v);
      return [point.x, -point.y, -orientation * bulge];
    });
    return (
      <Shape key={`${leg.id}:${index}`} {...outlineGeometry(outline, PLAN_TRANSFORM, { closed })}
        stroke={stroke} strokeWidth={1 / scale} fillEnabled={false} hitStrokeWidth={8 / scale}
        onClick={onSelect} />
    );
  }));
}
