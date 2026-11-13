import { wallToScreen } from '../canvas/transform.js';

/** Trace an outline with true circular arcs, in screen coordinates. */
export function outlinePath(outline, transform, { closed = true } = {}) {
  const points = outline.map(([x, z, bulge = 0]) => ({
    ...wallToScreen({ x, z }, transform),
    // Reflecting z-up into screen y-down reverses the arc direction.
    bulge: -bulge,
  }));
  return (context) => {
    context.beginPath();
    if (!points.length) return;
    context.moveTo(points[0].x, points[0].y);
    points.forEach((start, index) => {
      if (!closed && index === points.length - 1) return;
      const end = points[(index + 1) % points.length];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const chord = Math.hypot(dx, dy);
      if (start.bulge && chord) {
        const b = start.bulge;
        const offset = (1 - b * b) / (4 * b);
        const cx = (start.x + end.x) / 2 - dy * offset;
        const cy = (start.y + end.y) / 2 + dx * offset;
        const radius = chord * (1 + b * b) / (4 * Math.abs(b));
        const angle = Math.atan2(start.y - cy, start.x - cx);
        context.arc(cx, cy, radius, angle, angle + 4 * Math.atan(b), b < 0);
      } else if (index < points.length - 1) {
        context.lineTo(end.x, end.y);
      }
    });
    if (closed) context.closePath();
  };
}

/** Konva Shape geometry using the same tracer as hatch clipping. */
export function outlineGeometry(outline, transform, options) {
  const trace = outlinePath(outline, transform, options);
  return {
    sceneFunc(context, shape) {
      trace(context);
      context.fillStrokeShape(shape);
    },
  };
}
