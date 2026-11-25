import { useEffect, useMemo } from 'react';
import { Group, Shape, Text } from 'react-konva';
import { CURSORS, useCursorKeys } from '../canvas/cursor.js';
import { cornerAngleMarks } from '../model/cornerAngleMarks.js';

export default function PlanCornerAngles({ room, scale, tool, entry, cursor, onEdit }) {
  const marks = useMemo(() => cornerAngleMarks(room), [room]);
  const cursorKeys = useCursorKeys(cursor);
  const selectable = tool === 'select' && !entry;
  useEffect(() => () => {
    marks.forEach((_, index) => cursorKeys.release(String(index)));
  }, [cursorKeys, marks, selectable]);

  return marks.map((mark, index) => {
    const radius = 24 / scale;
    const middle = mark.startAngle + mark.sweep / 2;
    const labelRadius = 35 / scale;
    // 270° corners are skipped; other reflex corners remain visible but aren't editable.
    const editable = selectable && mark.angle < 180;
    const key = String(index);
    return (
      <Group key={key} x={mark.point.x} y={mark.point.y}>
        <Shape
          listening={false}
          stroke="#e2e8f0"
          strokeWidth={1 / scale}
          sceneFunc={(context, shape) => {
            context.beginPath();
            context.arc(0, 0, radius, mark.startAngle, mark.startAngle + mark.sweep, mark.sweep < 0);
            context.strokeShape(shape);
          }}
        />
        <Text
          x={Math.cos(middle) * labelRadius}
          y={Math.sin(middle) * labelRadius}
          width={48 / scale}
          offsetX={24 / scale}
          offsetY={5.5 / scale}
          align="center"
          fontSize={11 / scale}
          fill="#e2e8f0"
          text={`${Math.round(mark.angle * 10) / 10}°`}
          listening={editable}
          onMouseEnter={() => cursorKeys.request(key, CURSORS.select)}
          onMouseLeave={() => cursorKeys.release(key)}
          onMouseDown={(event) => { event.cancelBubble = true; }}
          onDblClick={(event) => { event.cancelBubble = true; }}
          onClick={(event) => {
            cursorKeys.release(key);
            onEdit(mark, event);
          }}
        />
      </Group>
    );
  });
}
