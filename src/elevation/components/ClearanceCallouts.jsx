import { Group, Line, Text } from 'react-konva';
import { wallToScreen } from '../canvas/transform.js';
import { formatInches } from '../model/units.js';

/** Casing clearances drawn inside the wall at their own height (SPEC-39.1); amber when too tight. */
export default function ClearanceCallouts({ callouts, transform }) {
  return (
    <Group listening={false}>
      {callouts.filter((callout) => callout.end - callout.start > 1e-6).map((callout) => {
        const from = wallToScreen({ x: callout.start, z: callout.z }, transform);
        const to = wallToScreen({ x: callout.end, z: callout.z }, transform);
        const color = callout.violated ? '#f59e0b' : '#cbd5e1';
        const length = callout.end - callout.start;
        const text = callout.violated && Number.isFinite(callout.required)
          ? `${formatInches(length)} (${formatInches(callout.required)})`
          : formatInches(length);
        return (
          <Group key={`${callout.openingId}:${callout.side}`}>
            <Line points={[from.x, from.y, to.x, to.y]} stroke={color} strokeWidth={1} />
            {[from, to].map((point, index) => (
              <Line
                key={`tick:${index}`}
                points={[point.x - 3, point.y + 3, point.x + 3, point.y - 3]}
                stroke={color}
                strokeWidth={1}
              />
            ))}
            <Text
              x={(from.x + to.x) / 2 - 40}
              y={from.y - 14}
              width={80}
              align="center"
              text={text}
              fontSize={11}
              fill={color}
            />
          </Group>
        );
      })}
    </Group>
  );
}
