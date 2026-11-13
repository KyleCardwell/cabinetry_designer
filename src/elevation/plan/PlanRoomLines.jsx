import { Group, Line, Text } from 'react-konva';
import { useCursorKeys } from '../canvas/cursor.js';
import { ROOM_LINE_COLOR } from '../components/LayoutLines.jsx';
import { roomLineFrame, roomLineSegment } from '../model/roomLines.js';
import useRoomLineDrag, { roomLineCursor } from './useRoomLineDrag.js';

/** Room-wide plan guides sit above the scene so their hit area receives the click. */
export default function PlanRoomLines({ room, scale, selectedRoomLineId, tool, entry, onSelect,
  settings, dispatch, toWorld, cursor }) {
  const cursorKeys = useCursorKeys(cursor);
  const { previewLine, start, click } = useRoomLineDrag({
    room, tool, entry, onSelect, settings, dispatch, toWorld, cursor,
  });
  if (!room?.roomLines?.length) return null;
  return (
    <Group listening={tool === 'select' && !entry}>
      {room.roomLines.map((stored) => {
        const line = previewLine?.id === stored.id ? previewLine : stored;
        const segment = roomLineSegment(room, line);
        if (!segment) return null;
        const { a, b } = segment;
        const selected = line.id === selectedRoomLineId;
        return (
          <Group key={line.id}
            onPointerDown={(event) => start(stored, event, selected)}
            onMouseDown={(event) => { event.cancelBubble = true; }}
            onClick={(event) => click(line.id, event)}
            onMouseEnter={() => cursorKeys.request(line.id, selected ? roomLineCursor(roomLineFrame(room, line).frame) : 'pointer')}
            onMouseLeave={() => cursorKeys.release(line.id)}
          >
            <Line points={[a.x, a.y, b.x, b.y]} stroke={ROOM_LINE_COLOR}
              strokeWidth={(selected ? 2 : 1) / scale} dash={[6 / scale, 4 / scale]}
              hitStrokeWidth={10 / scale} />
            <Text x={a.x} y={a.y} text={line.label} fontSize={11 / scale}
              fontStyle={selected ? 'bold' : 'normal'} fill={ROOM_LINE_COLOR} />
          </Group>
        );
      })}
    </Group>
  );
}
