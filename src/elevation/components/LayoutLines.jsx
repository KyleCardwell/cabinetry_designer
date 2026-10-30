import { Group, Line, Text } from 'react-konva';
import { CURSORS, useCursorKeys } from '../canvas/cursor.js';
import { wallToScreen } from '../canvas/transform.js';
import { lineX, linesOn } from '../model/layoutLines.js';
import { formatInches } from '../model/units.js';

// LL3: layout lines on one wall face. A design aid only: never in the drawing payload, reports or DXF.
export const LINE_COLOR = '#a78bfa';
const DASH = [6, 4];
const HIT_WIDTH = 8;
const LABEL_GAP_PX = 14;
const DIMENSION_GAP_PX = 34;
const TICK_HALF_PX = 4;
const FONT_SIZE = 11;

function SelectedDimension({ line, x, wallLength, top, transform }) {
  const endX = line.from === 'left' ? 0 : wallLength;
  const y = top - DIMENSION_GAP_PX;
  const from = wallToScreen({ x: endX, z: 0 }, transform).x;
  const to = wallToScreen({ x, z: 0 }, transform).x;
  const left = Math.min(from, to);
  const width = Math.abs(to - from);
  return (
    <Group listening={false}>
      <Line points={[from, y, to, y]} stroke={LINE_COLOR} strokeWidth={1} />
      <Line points={[from, y - TICK_HALF_PX, from, y + TICK_HALF_PX]} stroke={LINE_COLOR} strokeWidth={1} />
      <Line points={[to, y - TICK_HALF_PX, to, y + TICK_HALF_PX]} stroke={LINE_COLOR} strokeWidth={1} />
      <Text
        x={left}
        y={y - FONT_SIZE - 3}
        width={Math.max(width, 40)}
        align="center"
        text={formatInches(line.value)}
        fontSize={FONT_SIZE}
        fill={LINE_COLOR}
      />
    </Group>
  );
}

/** One face's layout lines: dashed, floor to wall top, label above; the selected one shows its distance. */
export default function LayoutLines({ wall, transform, selectedLineId, onSelect, cursor }) {
  const cursorKeys = useCursorKeys(cursor);
  if (!wall || !transform) return null;
  const lines = linesOn(wall);
  if (lines.length === 0) return null;
  const wallLength = wall.length;
  return (
    <Group>
      {lines.map((line) => {
        const x = lineX(line, wallLength);
        const bottom = wallToScreen({ x, z: 0 }, transform);
        const top = wallToScreen({ x, z: wall.height }, transform);
        const selected = line.id === selectedLineId;
        const key = `line:${line.id}`;
        return (
          <Group key={line.id}>
            <Line
              points={[bottom.x, bottom.y, top.x, top.y]}
              stroke={LINE_COLOR}
              strokeWidth={selected ? 2 : 1}
              dash={DASH}
              hitStrokeWidth={HIT_WIDTH}
              listening={Boolean(onSelect)}
              onMouseDown={(event) => { event.cancelBubble = true; }}
              onClick={(event) => {
                event.cancelBubble = true;
                onSelect?.(line.id);
              }}
              onMouseEnter={() => cursorKeys.request(key, CURSORS.select)}
              onMouseLeave={() => cursorKeys.release(key)}
            />
            <Text
              x={top.x - 30}
              y={top.y - LABEL_GAP_PX}
              width={60}
              align="center"
              text={line.label}
              fontSize={FONT_SIZE}
              fontStyle={selected ? 'bold' : 'normal'}
              fill={LINE_COLOR}
              listening={false}
            />
            {selected && (
              <SelectedDimension line={line} x={x} wallLength={wallLength} top={top.y} transform={transform} />
            )}
          </Group>
        );
      })}
    </Group>
  );
}
