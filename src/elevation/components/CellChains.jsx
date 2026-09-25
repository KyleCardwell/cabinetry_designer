import {
  Group,
  Line,
  Rect,
  Text,
} from 'react-konva';
import { wallToScreen } from '../canvas/transform.js';
import { formatInches } from '../model/units.js';

const FONT_SIZE = 10;
const MIN_LABEL_SPAN = 24;
const TICK_HALF_LENGTH = 3;

function CellChain({ grid, transform, editable, onEditTrack }) {
  const row = grid.axis === 'row';
  const origin = wallToScreen({ x: grid.x, z: grid.z }, transform);
  const farEdge = wallToScreen({
    x: grid.x + (row ? 0 : grid.width),
    z: grid.z + (row ? grid.height : 0),
  }, transform);
  const chainX = origin.x + 10;
  const chainY = origin.y - 10;
  const boundaries = [...new Set(grid.tracks.flatMap((track) => [track.start, track.end]))];
  const pointAt = (value) => (row
    ? wallToScreen({ x: grid.x, z: value }, transform)
    : wallToScreen({ x: value, z: grid.z }, transform));

  return (
    <Group>
      <Line
        points={row
          ? [chainX, origin.y, chainX, farEdge.y]
          : [origin.x, chainY, farEdge.x, chainY]}
        stroke="#94a3b8"
        strokeWidth={1}
        listening={false}
      />
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
        const span = row ? Math.abs(end.y - start.y) : Math.abs(end.x - start.x);
        if (span < MIN_LABEL_SPAN) return null;
        const x = row ? chainX + 3 : Math.min(start.x, end.x);
        const y = row ? (start.y + end.y) / 2 : chainY - FONT_SIZE - 3;
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
            <Group key={track.id} x={x} y={y} rotation={-90}>
              <Text
                x={-span / 2}
                width={span}
                height={FONT_SIZE}
                align="center"
                text={formatInches(track.end - track.start)}
                fontSize={FONT_SIZE}
                fill={color}
                listening={false}
              />
              {editable && (
                <Rect
                  x={-span / 2}
                  width={span}
                  height={FONT_SIZE}
                  fill="rgba(0,0,0,0.001)"
                  onClick={handleClick}
                />
              )}
            </Group>
          );
        }

        return (
          <Group key={track.id}>
            <Text
              x={x}
              y={y}
              width={span}
              height={FONT_SIZE}
              align="center"
              text={formatInches(track.end - track.start)}
              fontSize={FONT_SIZE}
              fill={color}
              listening={false}
            />
            {editable && (
              <Rect
                x={x}
                y={y}
                width={span}
                height={FONT_SIZE}
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

export default function CellChains({ grids, transform, editable, onEditTrack }) {
  return grids.map((grid) => (
    <CellChain
      key={grid.id}
      grid={grid}
      transform={transform}
      editable={editable}
      onEditTrack={onEditTrack}
    />
  ));
}
