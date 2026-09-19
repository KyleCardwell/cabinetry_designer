import { Rect } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';

export default function FaceOutlines({ faces, transform, selectedPath = null, selectable = false, onSelectFace }) {
  return faces.map((face) => {
    const rect = wallRectToScreen(face, transform);
    const selected = selectedPath !== null
      && (face.path === selectedPath || face.path.startsWith(`${selectedPath}.`));
    return (
      <Rect
        key={`${face.path}:${face.half ?? ''}`}
        {...rect}
        stroke={selected ? '#7dd3fc' : '#e2e8f0'}
        strokeWidth={selected ? 2 : 1}
        dash={face.type === 'open' ? [4, 3] : undefined}
        fill={selectable ? 'rgba(0, 0, 0, 0.001)' : undefined}
        listening={selectable}
        onClick={selectable ? (event) => {
          event.cancelBubble = true;
          onSelectFace?.(face.path);
        } : undefined}
      />
    );
  });
}
