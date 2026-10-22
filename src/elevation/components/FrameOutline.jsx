import { Rect, Shape } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { frameRegionOutline } from '../model/elevationParts.js';
import { outlineGeometry } from './outlinePath.js';

const FRAME_STROKE = '#e7e5e4';

export default function FrameOutline({ region, transform }) {
  const outline = frameRegionOutline(region);
  const Component = outline ? Shape : Rect;
  return (
    <Component
      {...(outline ? outlineGeometry(outline, transform) : wallRectToScreen(region, transform))}
      fillEnabled={false}
      stroke={FRAME_STROKE}
      strokeWidth={1}
      listening={false}
    />
  );
}
