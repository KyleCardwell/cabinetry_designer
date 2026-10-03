import { Circle, Group, Line, Rect, Text } from 'react-konva';
import WallDrawPreview from '../../canvas/components/WallDrawPreview.jsx';
import WallEndpoints from '../../canvas/components/WallEndpoints.jsx';
import { CURSORS } from '../canvas/cursor.js';
import { wallFrame } from '../model/geometry.js';
import { wallOutline } from '../model/wallOutline.js';
import { elevationMarkers } from './elevationMarkers.js';
import PlanElevationMarker from './PlanElevationMarker.jsx';

export default function PlanOverlays({
  room,
  settings,
  scale,
  wallMovePreview,
  selectedWall,
  signedInches,
  tool,
  entry,
  handleWallEndpointDrag,
  beginWallLength,
  cursor,
  showsMoveHandle,
  moveHandle,
  moveHandleCursor,
  beginWallMove,
  wallDrawStart,
  liveWallDrawEnd,
  mouseWorldPos,
}) {
  return (
    <>
      {elevationMarkers(room, settings, scale).map((marker) => (
        <PlanElevationMarker
          key={marker.key}
          point={marker.point}
          direction={marker.direction}
          scale={scale}
          letter={marker.letter}
        />
      ))}
      {wallMovePreview?.room && (
        <Group listening={false}>
          {wallMovePreview.affectedWallIds.map((wallId) => {
            const previewWall = wallMovePreview.room.walls.find(
              (wall) => wall.id === wallId,
            );
            if (!previewWall) return null;
            return (
              <Line
                key={wallId}
                points={wallOutline(wallMovePreview.room, previewWall)
                  .flatMap((point) => [point.x, point.y])}
                closed
                fill="#22d3ee"
                opacity={0.16}
                stroke="#67e8f9"
                strokeWidth={2 / scale}
                dash={[6 / scale, 4 / scale]}
              />
            );
          })}
          {(() => {
            const previewWall = wallMovePreview.room.walls.find(
              (wall) => wall.id === selectedWall?.id,
            );
            if (!previewWall) return null;
            const frame = wallFrame(wallMovePreview.room, previewWall);
            const midpoint = {
              x: (previewWall.x1 + previewWall.x2) / 2,
              y: (previewWall.y1 + previewWall.y2) / 2,
            };
            const labelOffset = previewWall.thickness + 54 / scale;
            return (
              <Text
                x={midpoint.x - frame.n.x * labelOffset}
                y={midpoint.y - frame.n.y * labelOffset}
                width={100 / scale}
                offsetX={50 / scale}
                offsetY={6 / scale}
                align="center"
                text={signedInches(wallMovePreview.delta)}
                fontSize={11 / scale}
                fill="#a5f3fc"
              />
            );
          })()}
        </Group>
      )}
      {tool === 'select' && selectedWall && !entry && (
        <WallEndpoints
          wall={{ ...selectedWall, wall_id: selectedWall.id }}
          room={room}
          scale={scale}
          orthoWalls={settings.orthoWalls}
          onDrag={handleWallEndpointDrag}
          onLength={beginWallLength}
          cursor={cursor}
        />
      )}
      {showsMoveHandle && (
        <Rect
          x={moveHandle.point.x}
          y={moveHandle.point.y}
          width={10 / scale}
          height={10 / scale}
          offsetX={5 / scale}
          offsetY={5 / scale}
          fill="#22d3ee"
          stroke="#ecfeff"
          strokeWidth={1 / scale}
          cornerRadius={1.5 / scale}
          onMouseEnter={() => moveHandleCursor.request('move', CURSORS.move)}
          onMouseLeave={() => moveHandleCursor.release('move')}
          onMouseDown={(event) => {
            event.cancelBubble = true;
          }}
          onClick={(event) => {
            moveHandleCursor.release('move');
            beginWallMove(event);
          }}
          onDblClick={(event) => {
            event.cancelBubble = true;
          }}
        />
      )}
      <WallDrawPreview
        start={tool === 'wall' ? wallDrawStart : null}
        end={entry?.kind === 'wall-draw' ? liveWallDrawEnd : mouseWorldPos}
        scale={scale}
      />
      {tool === 'wall' && mouseWorldPos?._faceLabel && (
        <Group listening={false}>
          <Circle
            x={mouseWorldPos.x}
            y={mouseWorldPos.y}
            radius={4 / scale}
            fill="#22d3ee"
            stroke="#ecfeff"
            strokeWidth={0.75 / scale}
          />
          <Text
            x={mouseWorldPos.x}
            y={mouseWorldPos.y - 10 / scale}
            text={mouseWorldPos._faceLabel}
            fontSize={10 / scale}
            fill="#22d3ee"
            offsetX={mouseWorldPos._faceLabel.length * 3 / scale}
            offsetY={10 / scale}
          />
        </Group>
      )}
    </>
  );
}
