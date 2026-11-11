import { useMemo } from 'react';
import { Line } from 'react-konva';
import { planSolidParts } from '../model/planParts.js';
import { planTopEdges } from '../model/planTops.js';

/** Countertop / wood top lines: exposed edges and joints only (SPEC-PT2). */
export default function PlanTops({ room, settings, scale }) {
  const lines = useMemo(() => planTopEdges(room, settings, planSolidParts(room, settings, { bottoms: true }))
    .map(({ id, points, closed }) => ({ key: id, closed, points: points.flatMap(([x, y]) => [x, 0 - y]) })),
  [room, settings]);

  return lines.map(({ key, points, closed }) => (
    <Line
      key={key}
      points={points}
      closed={closed}
      stroke="#cbd5e1"
      strokeWidth={1 / scale}
      listening={false}
    />
  ));
}
