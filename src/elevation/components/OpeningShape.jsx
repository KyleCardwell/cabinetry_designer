import { useRef } from 'react';
import { Group, Rect, Text } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { openingReferenceBounds } from '../model/openings.js';
import { formatInches } from '../model/units.js';

export default function OpeningShape({
  opening,
  geometry,
  transform,
  selected,
  selectable,
  onSelect,
  onMove,
}) {
  const dragStartRef = useRef(null);
  const casingRect = geometry.casing
    ? wallRectToScreen(geometry.casing, transform)
    : null;
  const jambRect = wallRectToScreen(geometry.jamb, transform);
  const wallLength = geometry.offsets.left.jamb.edge
    + geometry.jamb.width
    + geometry.offsets.right.jamb.edge;
  const referenceX = geometry.offsets.left[opening.measureMode].edge;
  const range = openingReferenceBounds(opening, wallLength, null);
  const stroke = selected ? '#f8fafc' : '#94a3b8';
  const strokeWidth = selected ? 2 : 1;
  const draggable = selected && selectable && Boolean(onMove);

  const stopEvent = (event) => {
    event.cancelBubble = true;
  };

  const clampedDeltaPixels = (position) => {
    const start = dragStartRef.current;
    if (!start) return 0;
    const requestedX = referenceX + (position.x - start.x) / transform.scale;
    const clampedX = Math.min(range.max, Math.max(range.min, requestedX));
    return (clampedX - referenceX) * transform.scale;
  };

  return (
    <Group
      listening={selectable}
      draggable={draggable}
      dragBoundFunc={(position) => {
        const start = dragStartRef.current;
        return start
          ? { x: start.x + clampedDeltaPixels(position), y: start.y }
          : position;
      }}
      onMouseDown={stopEvent}
      onClick={(event) => {
        stopEvent(event);
        onSelect?.(opening.id);
      }}
      onMouseEnter={(event) => {
        event.target.getStage().container().style.cursor = draggable ? 'ew-resize' : 'pointer';
      }}
      onMouseLeave={(event) => {
        event.target.getStage().container().style.cursor = 'default';
      }}
      onDragStart={(event) => {
        stopEvent(event);
        dragStartRef.current = event.target.absolutePosition();
        onSelect?.(opening.id);
      }}
      onDragEnd={(event) => {
        stopEvent(event);
        const start = dragStartRef.current;
        const end = event.target.absolutePosition();
        const deltaPixels = start ? clampedDeltaPixels(end) : 0;
        event.target.position({ x: 0, y: 0 });
        event.target.getLayer()?.batchDraw();
        dragStartRef.current = null;
        onMove?.(referenceX + deltaPixels / transform.scale);
      }}
    >
      {casingRect && (
        <Rect
          {...casingRect}
          fill="#a8a29e"
          stroke={selected ? '#f8fafc' : '#e7e5e4'}
          strokeWidth={strokeWidth}
        />
      )}
      <Rect
        {...jambRect}
        fill={opening.kind === 'door' ? '#0b1220' : '#0e2a47'}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      {jambRect.width >= 60 && (
        <Text
          x={jambRect.x}
          y={jambRect.y + jambRect.height / 2 - 6}
          width={jambRect.width}
          align="center"
          text={`${opening.label} · ${formatInches(geometry.jamb.width)} × ${formatInches(geometry.jamb.height)}`}
          fontSize={11}
          fill="#e2e8f0"
          listening={false}
        />
      )}
    </Group>
  );
}
