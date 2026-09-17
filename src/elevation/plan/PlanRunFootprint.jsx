import { useState } from 'react';
import { Group, Label, Line, Tag, Text } from 'react-konva';
import {
  CABINET_TYPE_COLORS,
  CABINET_TYPE_IDS,
  KIND_COLORS,
} from '../model/constants.js';
import { frontDepth } from '../model/corners.js';
import { elevationToPlan } from '../model/geometry.js';
import { endCornerAnglesForRun, endMinWidthsForRun } from '../model/room.js';
import { runFootprint } from '../model/footprints.js';
import { splitRun } from '../model/splitRun.js';

function linePoints(points) {
  return points.flatMap((point) => [point.x, point.y]);
}

export default function PlanRunFootprint({
  frame,
  room,
  wall,
  run,
  settings,
  collision,
  collisionMessage,
  selected,
  selectable,
  scale,
  onSelect,
}) {
  const [hovered, setHovered] = useState(false);
  const footprint = runFootprint(frame, run, settings);
  const layout = splitRun(run, settings, {
    endMinWidths: endMinWidthsForRun(room, wall, run, settings),
    endCornerAngles: endCornerAnglesForRun(room, wall, run),
  });
  const depth = frontDepth(run, settings);
  const upper = run.cabinetTypeId === CABINET_TYPE_IDS.UPPER;
  const color = CABINET_TYPE_COLORS[run.cabinetTypeId] ?? KIND_COLORS.cabinet;
  const outline = collision ? '#ef4444' : selected ? '#f8fafc' : color;
  const boundaryPieces = layout.pieces.slice(1).filter(
    (piece) => piece.x > run.x && piece.x < run.x + run.width,
  );
  const centerX = footprint.reduce((sum, point) => sum + point.x, 0) / footprint.length;
  const topY = Math.min(...footprint.map((point) => point.y));

  return (
    <Group
      listening={selectable}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect(event);
      }}
    >
      <Line
        points={linePoints(footprint)}
        closed
        fill={upper ? `${color}59` : `${color}8c`}
        stroke={outline}
        strokeWidth={(collision || selected ? 2.5 : 1.5) / scale}
        dash={upper ? [5 / scale, 3 / scale] : undefined}
        hitStrokeWidth={8 / scale}
      />
      {boundaryPieces.map((piece) => {
        const face = elevationToPlan(frame, piece.x, 0);
        const front = elevationToPlan(frame, piece.x, depth);
        return (
          <Line
            key={piece.id}
            points={[face.x, face.y, front.x, front.y]}
            stroke={KIND_COLORS[piece.kind] ?? '#cbd5e1'}
            strokeWidth={0.75 / scale}
            opacity={0.9}
            listening={false}
          />
        );
      })}
      {collision && hovered && collisionMessage && (
        <Label
          x={centerX}
          y={topY - 5 / scale}
          opacity={0.98}
          listening={false}
        >
          <Tag
            fill="#020617"
            stroke="#ef4444"
            strokeWidth={1 / scale}
            cornerRadius={3 / scale}
            pointerDirection="down"
            pointerWidth={7 / scale}
            pointerHeight={5 / scale}
          />
          <Text
            width={230 / scale}
            text={collisionMessage}
            align="center"
            fill="#fecaca"
            fontSize={11 / scale}
            padding={6 / scale}
          />
        </Label>
      )}
    </Group>
  );
}
