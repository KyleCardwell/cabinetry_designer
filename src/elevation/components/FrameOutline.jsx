import { Rect, Shape } from 'react-konva';
import { ELEVATION_BG, ELEVATION_LINE } from '../model/constants.js';
import { wallRectToScreen } from '../canvas/transform.js';
import { frameRegionOutline } from '../model/elevationParts.js';
import { outlineGeometry } from './outlinePath.js';

export const FRAME_STROKE = ELEVATION_LINE;

export default function FrameOutline({ region, transform }) {
  const outline = frameRegionOutline(region);
  const Component = outline ? Shape : Rect;
  const perimeter = (
    <Component
      {...(outline ? outlineGeometry(outline, transform) : wallRectToScreen(region, transform))}
      fillEnabled={false}
      stroke={FRAME_STROKE}
      strokeWidth={1}
      listening={false}
    />
  );
  if (!region.members) return perimeter;
  return (
    <>
      {region.members.map((member, index) => (
        <Rect key={index} {...wallRectToScreen(member, transform)}
          fill={ELEVATION_BG} listening={false} />
      ))}
      {perimeter}
    </>
  );
}
