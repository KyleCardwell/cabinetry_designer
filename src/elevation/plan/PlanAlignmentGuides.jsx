import { Line } from 'react-konva';

const GUIDE_EXTENT = 10000;

/** Dashed full-canvas lines marking the axes that a snap aligned to. */
export default function PlanAlignmentGuides({ guides = [], scale }) {
  return (
    <>
      {guides.map((guide) => (
        <Line
          key={`${guide.axis}:${guide.value}`}
          points={guide.axis === 'x'
            ? [guide.value, -GUIDE_EXTENT, guide.value, GUIDE_EXTENT]
            : [-GUIDE_EXTENT, guide.value, GUIDE_EXTENT, guide.value]}
          stroke="#f472b6"
          strokeWidth={1 / scale}
          dash={[6 / scale, 4 / scale]}
          listening={false}
        />
      ))}
    </>
  );
}
