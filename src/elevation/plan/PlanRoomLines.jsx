import { Group, Line, Text } from 'react-konva';
import { ROOM_LINE_COLOR } from '../components/LayoutLines.jsx';
import { roomLineSegment } from '../model/roomLines.js';

/** Room-wide plan guides sit above the scene so their hit area receives the click. */
export default function PlanRoomLines({ room, scale, selectedRoomLineId, tool, entry, onSelect }) {
  if (!room?.roomLines?.length) return null;
  return (
    <Group listening={tool === 'select' && !entry}>
      {room.roomLines.map((line) => {
        const segment = roomLineSegment(room, line);
        if (!segment) return null;
        const { a, b } = segment;
        const selected = line.id === selectedRoomLineId;
        return (
          <Group key={line.id}
            onMouseDown={(event) => { event.cancelBubble = true; }}
            onClick={(event) => {
              event.cancelBubble = true;
              onSelect(line.id);
            }}
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
