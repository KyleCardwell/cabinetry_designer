import { Rect } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';

const FRAME_STROKE = '#e7e5e4';

export default function FrameOutline({ region, transform }) {
  return (
    <Rect
      {...wallRectToScreen(region, transform)}
      fillEnabled={false}
      stroke={FRAME_STROKE}
      strokeWidth={1}
      listening={false}
    />
  );
}
