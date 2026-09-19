import { Line } from 'react-konva';
import { wallToScreen } from '../canvas/transform.js';

/** Dashed full-canvas lines marking the axes that a run snap aligned to. */
export default function ElevationAlignmentGuides({
  guides = [],
  transform,
  width,
  height,
}) {
  if (!transform) return null;
  return (
    <>
      {guides.map((guide) => {
        const point = wallToScreen(
          guide.axis === 'x' ? { x: guide.value, z: 0 } : { x: 0, z: guide.value },
          transform,
        );
        return (
          <Line
            key={`${guide.axis}:${guide.value}`}
            points={guide.axis === 'x'
              ? [point.x, 0, point.x, height]
              : [0, point.y, width, point.y]}
            stroke="#f472b6"
            strokeWidth={1}
            dash={[6, 4]}
            listening={false}
          />
        );
      })}
    </>
  );
}
