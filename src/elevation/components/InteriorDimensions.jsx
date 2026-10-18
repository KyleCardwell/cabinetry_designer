import { Group, Line, Rect, Text } from 'react-konva';
import { wallToScreen } from '../canvas/transform.js';
import { interiorDimensions } from '../model/interiors.js';
import { formatDimension } from '../model/units.js';

const FONT_SIZE = 10;
const TICK_HALF = 3;

export default function InteriorDimensions({ entry, transform, editable, onEditDivider, dragPreview }) {
  return interiorDimensions(entry).map((dimension) => {
    const vertical = dimension.axis === 'vertical';
    const delta = dragPreview?.itemId === entry.itemId && dragPreview.key === dimension.key
      ? dragPreview.delta : { x: 0, z: 0 };
    const from = wallToScreen(dimension.from, transform);
    const to = wallToScreen({
      x: dimension.to.x + (vertical ? 0 : delta.x),
      z: dimension.to.z + (vertical ? delta.z : 0),
    }, transform);
    const value = dimension.value + (vertical ? delta.z : dimension.side === 'right' ? -delta.x : delta.x);
    const offset = 8 + 14 * dimension.lane;
    const x = from.x + (vertical ? offset : 0);
    const y = from.y + (vertical ? 0 : offset);
    const span = vertical ? Math.abs(to.y - from.y) : Math.abs(to.x - from.x);
    const color = dimension.manual ? '#7dd3fc' : '#e2e8f0';
    const labelX = vertical ? x + 3 : (from.x + to.x) / 2;
    const labelY = vertical ? (from.y + to.y) / 2 : y + 3;
    const labelWidth = Math.max(span, 24);
    const handleClick = editable ? (event) => {
      event.cancelBubble = true;
      const point = event.target.getStage().getPointerPosition();
      onEditDivider({
        runId: entry.runId,
        itemId: entry.itemId,
        path: dimension.path,
        index: dimension.index,
        side: dimension.side,
        label: `oc from ${dimension.side}`,
        value,
        x: point.x,
        y: point.y,
      });
    } : undefined;
    return (
      <Group key={dimension.key}>
        <Line
          points={vertical ? [x, from.y, x, to.y] : [from.x, y, to.x, y]}
          stroke={color}
          strokeWidth={1}
          listening={false}
        />
        {[from, to].map((point, index) => (
          <Line
            key={index}
            points={vertical
              ? [x - TICK_HALF, point.y, x + TICK_HALF, point.y]
              : [point.x, y - TICK_HALF, point.x, y + TICK_HALF]}
            stroke={color}
            strokeWidth={1}
            listening={false}
          />
        ))}
        <Group x={labelX} y={labelY} rotation={vertical ? -90 : 0}>
          <Text
            x={-labelWidth / 2}
            width={labelWidth}
            height={FONT_SIZE}
            align="center"
            text={formatDimension(value)}
            fontSize={FONT_SIZE}
            fill={color}
            listening={false}
          />
          {editable && (
            <Rect
              x={-labelWidth / 2}
              width={labelWidth}
              height={FONT_SIZE}
              fill="rgba(0,0,0,0.001)"
              onClick={handleClick}
            />
          )}
        </Group>
      </Group>
    );
  });
}
