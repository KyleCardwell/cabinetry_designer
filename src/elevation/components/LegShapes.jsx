import { Group, Shape } from 'react-konva';
import { ELEVATION_BG, ELEVATION_LINE } from '../model/constants.js';
import { polygonContainsPoint } from '../model/footprints.js';
import { flattenOutline } from '../model/sectionProfileOutline.js';
import { outlineGeometry } from './outlinePath.js';

export default function LegShapes({ legs, transform, onSelect, listening = true, onMouseEnter, onMouseLeave }) {
  return legs.map(({ leg, outlines }) => {
    const polygons = outlines.map(({ closed, outline }) => closed
      ? flattenOutline(outline).map(([x, y]) => ({ x, y })) : null);
    const loops = outlines.map((loop, index) => ({
      ...loop,
      outer: loop.closed && !polygons.some((polygon, other) => polygon && other !== index
        && polygons[index].every((point) => polygonContainsPoint(polygon, point))),
      index,
    }));
    // Fill the silhouettes first, keeping internal details visible regardless of library loop order.
    loops.sort((a, b) => Number(b.outer) - Number(a.outer));
    return (
      <Group key={leg.id} listening={listening} onClick={(event) => onSelect?.(event, leg)}
        onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        {loops.map(({ closed, outline, outer, index }) => (
          <Shape key={index} {...outlineGeometry(outline, transform, { closed })}
            stroke={ELEVATION_LINE} strokeWidth={1} fill={ELEVATION_BG} fillEnabled={outer}
            hitStrokeWidth={8} />
        ))}
      </Group>
    );
  });
}
