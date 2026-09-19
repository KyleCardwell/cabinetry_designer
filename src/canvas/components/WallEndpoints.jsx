import { Fragment, useRef } from 'react';
import { Circle, Line } from 'react-konva';
import { wallFrame } from '../../elevation/model/geometry.js';

function endpointPoint(wall, endpoint) {
  return endpoint === 'start'
    ? { x: wall.x1, y: wall.y1 }
    : { x: wall.x2, y: wall.y2 };
}

function sideAtEndpoint(room, wall, endpoint) {
  return wallFrame(room, wall).leftEndpoint === endpoint ? 'left' : 'right';
}

function arrowPoints(room, wall, endpoint, scale) {
  const frame = wallFrame(room, wall);
  const corner = endpointPoint(wall, endpoint);
  const away = endpoint === 'start'
    ? frame.d
    : { x: -frame.d.x, y: -frame.d.y };
  const normal = { x: -away.y, y: away.x };
  const center = {
    x: corner.x + away.x * 14 / scale,
    y: corner.y + away.y * 14 / scale,
  };
  const tip = {
    x: center.x + away.x * 5 / scale,
    y: center.y + away.y * 5 / scale,
  };
  const base = {
    x: center.x - away.x * 4 / scale,
    y: center.y - away.y * 4 / scale,
  };
  return [
    tip.x,
    tip.y,
    base.x + normal.x * 4 / scale,
    base.y + normal.y * 4 / scale,
    base.x - normal.x * 4 / scale,
    base.y - normal.y * 4 / scale,
  ];
}

/** Render free endpoint drags and orthogonal connected-corner length arrows. */
export default function WallEndpoints({
  wall,
  room = null,
  scale,
  onDrag,
  orthoWalls = false,
  onLength = null,
}) {
  const altDragRef = useRef({ start: false, end: false });
  const wallId = wall.id ?? wall.wall_id;
  const isConnectedStart = !!wall.connections?.start;
  const isConnectedEnd = !!wall.connections?.end;

  const renderFreeHandle = (endpoint, fill) => {
    const point = endpointPoint(wall, endpoint);
    return (
      <Circle
        key={endpoint}
        x={point.x}
        y={point.y}
        radius={3 / scale}
        fill={fill}
        stroke="#ffffff"
        strokeWidth={0.5 / scale}
        draggable
        onMouseDown={(event) => {
          event.cancelBubble = true;
        }}
        onClick={(event) => {
          event.cancelBubble = true;
        }}
        onDragMove={(event) => onDrag(wallId, endpoint, event)}
        onDragEnd={(event) => onDrag(wallId, endpoint, event)}
      />
    );
  };

  const renderConnectedCorner = (endpoint) => {
    const connection = wall.connections?.[endpoint];
    const neighbor = room?.walls.find((candidate) => candidate.id === connection?.wallId);
    if (!connection || !neighbor || !onLength) {
      return renderFreeHandle(endpoint, '#facc15');
    }
    const point = endpointPoint(wall, endpoint);
    const arrows = [
      { wall, endpoint, wallId, side: sideAtEndpoint(room, wall, endpoint) },
      {
        wall: neighbor,
        endpoint: connection.endpoint,
        wallId: neighbor.id,
        side: sideAtEndpoint(room, neighbor, connection.endpoint),
      },
    ];

    return (
      <Fragment key={endpoint}>
        <Circle
          x={point.x}
          y={point.y}
          radius={3 / scale}
          fill="#facc15"
          stroke="#ffffff"
          strokeWidth={0.5 / scale}
          draggable
          dragBoundFunc={(position) => (
            altDragRef.current[endpoint] ? position : point
          )}
          onMouseDown={(event) => {
            event.cancelBubble = true;
            altDragRef.current[endpoint] = Boolean(event.evt.altKey);
          }}
          onClick={(event) => {
            event.cancelBubble = true;
          }}
          onDragMove={(event) => {
            if (altDragRef.current[endpoint]) onDrag(wallId, endpoint, event);
          }}
          onDragEnd={(event) => {
            if (altDragRef.current[endpoint]) onDrag(wallId, endpoint, event);
            altDragRef.current[endpoint] = false;
          }}
        />
        {arrows.map((arrow) => (
          <Line
            key={`${arrow.wallId}:${arrow.side}`}
            points={arrowPoints(room, arrow.wall, arrow.endpoint, scale)}
            closed
            fill="#22d3ee"
            stroke="#ecfeff"
            strokeWidth={0.75 / scale}
            onMouseEnter={(event) => {
              event.target.getStage().container().style.cursor = 'pointer';
            }}
            onMouseLeave={(event) => {
              event.target.getStage().container().style.cursor = 'default';
            }}
            onMouseDown={(event) => {
              event.cancelBubble = true;
            }}
            onClick={(event) => {
              event.cancelBubble = true;
              onLength(arrow.wallId, arrow.side, event);
            }}
          />
        ))}
      </Fragment>
    );
  };

  return (
    <>
      {orthoWalls && isConnectedStart
        ? renderConnectedCorner('start')
        : renderFreeHandle('start', isConnectedStart ? '#facc15' : '#26ff00')}
      {orthoWalls && isConnectedEnd
        ? renderConnectedCorner('end')
        : renderFreeHandle('end', isConnectedEnd ? '#facc15' : '#ff0000')}
    </>
  );
}
