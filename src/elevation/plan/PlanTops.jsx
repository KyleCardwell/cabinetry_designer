import { useMemo } from 'react';
import { Line } from 'react-konva';
import { planTopPoints, planTops } from '../model/planTops.js';

export default function PlanTops({ room, settings, scale }) {
  const outlines = useMemo(() => planTops(room, settings).flatMap(({ wallId, loops }) => {
    const wall = room.walls.find((wall) => wall.id === wallId);
    return loops.map((loop, index) => ({
      key: `${wallId}:${index}`,
      points: planTopPoints(room, wall, loop).flatMap(([x, y]) => [x, 0 - y]),
    }));
  }), [room, settings]);

  return outlines.map(({ key, points }) => (
    <Line
      key={key}
      points={points}
      closed
      stroke="#cbd5e1"
      strokeWidth={1 / scale}
      listening={false}
    />
  ));
}
