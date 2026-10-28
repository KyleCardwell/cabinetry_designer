import {
  Group,
  Line,
  Rect,
  Text,
} from 'react-konva';
import { wallToScreen } from '../canvas/transform.js';
import { formatDimension } from '../model/units.js';
import { gappedLine } from '../canvas/gappedLine.js';

const FONT_SIZE = 10;
const MIN_LABEL_SPAN = 24;
const TICK_HALF_LENGTH = 3;

function CellChain({ grid, transform, editable, onEditTrack }) {
  const factor = transform.text?.dimension ?? 1;
  const fontSize = FONT_SIZE * factor;
  const row = grid.axis === 'row';
  const origin = wallToScreen({ x: grid.x, z: grid.z }, transform);
  const direction = grid.direction ?? 1;
  const chainX = origin.x + direction * 10 * factor;
  const chainY = origin.y - 10 * factor;
  const boundaries = [...new Set(grid.tracks.flatMap((track) => [track.start, track.end]))];
  const pointAt = (value) => (row
    ? wallToScreen({ x: grid.x, z: value }, transform)
    : wallToScreen({ x: value, z: grid.z }, transform));

  return (
    <Group>
      {boundaries.map((value) => {
        const point = pointAt(value);
        return (
          <Line
            key={`tick:${value}`}
            points={row
              ? [chainX - TICK_HALF_LENGTH, point.y, chainX + TICK_HALF_LENGTH, point.y]
              : [point.x, chainY - TICK_HALF_LENGTH, point.x, chainY + TICK_HALF_LENGTH]}
            stroke="#94a3b8"
            strokeWidth={1}
            listening={false}
          />
        );
      })}
      {grid.tracks.map((track) => {
        const start = pointAt(track.start);
        const end = pointAt(track.end);
        const span = Math.abs(track.end - track.start) * transform.scale;
        const text = formatDimension(track.end - track.start);
        const halfGap = text.length * fontSize * 0.6 / 2 + 4;
        const visible = span >= MIN_LABEL_SPAN * factor;
        const inline = visible && 2 * halfGap + 8 <= span;
        const lineStart = row ? { x: chainX, y: start.y } : { x: start.x, y: chainY };
        const lineEnd = row ? { x: chainX, y: end.y } : { x: end.x, y: chainY };
        const center = { x: (lineStart.x + lineEnd.x) / 2, y: (lineStart.y + lineEnd.y) / 2 };
        const pieces = gappedLine(lineStart, lineEnd, center, inline ? halfGap : 0);
        const lines = pieces.map((points, index) => (
          <Line key={`line:${index}`} points={points} stroke="#94a3b8" strokeWidth={1} listening={false} />
        ));
        if (!visible) return <Group key={track.id}>{lines}</Group>;
        const x = row ? chainX + (inline ? -fontSize / 2 : direction > 0 ? 3 * factor : -fontSize - 3 * factor)
          : Math.min(start.x, end.x);
        const y = row ? center.y : chainY - (inline ? fontSize / 2 : fontSize + 3 * factor);
        const color = track.manual ? '#7dd3fc' : '#e2e8f0';
        const handleClick = editable ? (event) => {
          event.cancelBubble = true;
          const point = event.target.getStage().getPointerPosition();
          onEditTrack({
            trackId: track.id,
            label: row ? 'Height' : 'Width',
            value: track.end - track.start,
            x: point.x,
            y: point.y,
          });
        } : undefined;

        if (row) {
          return (
            <Group key={track.id}>
              {lines}
              <Group x={x} y={y} rotation={-90}>
                <Text
                  x={-span / 2}
                  width={span}
                  height={fontSize}
                  align="center"
                  text={text}
                  fontSize={fontSize}
                  fill={color}
                  listening={false}
                />
                {editable && (
                  <Rect
                    x={-span / 2}
                    width={span}
                    height={fontSize}
                    fill="rgba(0,0,0,0.001)"
                    onClick={handleClick}
                  />
                )}
              </Group>
            </Group>
          );
        }

        return (
          <Group key={track.id}>
            {lines}
            <Text
              x={x}
              y={y}
              width={span}
              height={fontSize}
              align="center"
              text={text}
              fontSize={fontSize}
              fill={color}
              listening={false}
            />
            {editable && (
              <Rect
                x={x}
                y={y}
                width={span}
                height={fontSize}
                fill="rgba(0,0,0,0.001)"
                onClick={handleClick}
              />
            )}
          </Group>
        );
      })}
    </Group>
  );
}

export default function CellChains({ grids, steps = [], transform, editable, onEditTrack }) {
  return [...grids, ...steps.map(({ x, edge, start, end, direction }) => ({
    id: `step:${x}:${edge}`, axis: 'row', x, z: start, direction,
    tracks: [{ id: 'step', start, end }], step: true,
  }))].map((grid) => (
    <CellChain
      key={grid.id}
      grid={grid}
      transform={transform}
      editable={editable && !grid.step}
      onEditTrack={onEditTrack}
    />
  ));
}
