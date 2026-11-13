import { Group, Line, Text } from 'react-konva';
import { wallToScreen } from '../canvas/transform.js';
import { formatDimension } from '../model/units.js';
import { gappedLine } from '../canvas/gappedLine.js';

/** Casing clearances drawn inside the wall at their own height (SPEC-39.1); amber when too tight. */
export default function ClearanceCallouts({ callouts, transform }) {
  const factor = transform.text?.dimension ?? 1;
  const fontSize = 11 * factor;
  return (
    <Group listening={false}>
      {callouts.filter((callout) => callout.end - callout.start > 1e-6).map((callout) => {
        const from = wallToScreen({ x: callout.start, z: callout.z }, transform);
        const to = wallToScreen({ x: callout.end, z: callout.z }, transform);
        const color = callout.violated ? '#f59e0b' : '#cbd5e1';
        const length = callout.end - callout.start;
        const text = callout.violated && Number.isFinite(callout.required)
          ? `${formatDimension(length)} (${formatDimension(callout.required)})`
          : formatDimension(length);
        const width = text.length * fontSize * 0.6;
        const inline = width + 16 <= length * transform.scale;
        const center = { x: (from.x + to.x) / 2, y: from.y };
        return (
          <Group key={`${callout.openingId}:${callout.side}`}>
            {gappedLine(from, to, center, inline ? width / 2 + 4 : 0).map((points, index) => (
              <Line key={`line:${index}`} points={points} stroke={color} strokeWidth={1} />
            ))}
            {[from, to].map((point, index) => (
              <Line
                key={`tick:${index}`}
                points={[point.x - 3, point.y + 3, point.x + 3, point.y - 3]}
                stroke={color}
                strokeWidth={1}
              />
            ))}
            <Text
              x={center.x - (inline ? width / 2 : 40 * factor)}
              y={from.y - (inline ? fontSize / 2 : 14 * factor)}
              width={inline ? width : 80 * factor}
              height={inline ? fontSize : undefined}
              align="center"
              text={text}
              fontSize={fontSize}
              fill={color}
            />
          </Group>
        );
      })}
    </Group>
  );
}
