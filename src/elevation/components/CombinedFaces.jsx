import { useMemo } from 'react';
import { Group, Layer, Rect, Text } from 'react-konva';
import {
  combinedDepthNote,
  combinedFaceTransforms,
  wallRectToScreen,
} from '../canvas/transform.js';
import { combinedCornerShapes } from '../model/cornerParts.js';
import { openingGeometry } from '../model/openings.js';
import { resolveProfile } from '../model/profile.js';
import { resolveWall } from '../model/room.js';
import { wallShowThrough } from '../model/showThrough.js';
import NeighborProfiles from './NeighborProfiles.jsx';
import NeighborReturns from './NeighborReturns.jsx';
import OpeningShape from './OpeningShape.jsx';
import RecessShapes from './RecessShapes.jsx';
import RunGroup from './RunGroup.jsx';
import SoffitShapes from './SoffitShapes.jsx';
import WallEndPanelShapes from './WallEndPanelShapes.jsx';
import WallFrame from './WallFrame.jsx';

const noop = () => {};
const stopEvent = (event) => { event.cancelBubble = true; };

/** Resolve in saved lettering order, keeping the first occurrence of each neighbour part. */
export function resolveCombinedFaces(room, combined, settings) {
  const corners = combinedCornerShapes(room, combined, settings);
  const seen = new Set();
  return new Map(combined.faces.map((face) => {
    const wall = resolveWall(room, room.walls.find((candidate) => candidate.id === face.wallId), face.side);
    const shapes = corners.get(face.key).flatMap((shape) => {
      const parts = shape.parts.filter((part) => {
        if (seen.has(part.id)) return false;
        seen.add(part.id);
        return true;
      });
      return parts.length ? [{ ...shape, parts }] : [];
    });
    return [face.key, { wall, shapes }];
  }));
}

/** Display-only faces: a separate hit surface switches faces without exposing editing handlers. */
export default function CombinedFaces({
  room, combined, faces, activeKey, settings, diagnostics, transform, onActivate, doorsOff = false,
  soffitJoins = [], hiddenEdges = new Map(),
}) {
  const showThrough = useMemo(() => new Map(combined.faces.filter((face) => face.key !== activeKey)
    .map((face) => {
      const { wall } = faces.get(face.key);
      return [face.key, doorsOff ? []
        : [...wallShowThrough(room, wall.sideSource ?? wall, face.side, settings).values()]];
    })), [room, combined, faces, activeKey, settings, doorsOff]);
  const transforms = combinedFaceTransforms(transform, combined, activeKey);
  const active = combined.faces.find((face) => face.key === activeKey);
  return (
    <Layer>
      {combined.faces.filter((face) => face.key !== activeKey).map((face) => {
        const { wall, shapes } = faces.get(face.key);
        const faceTransform = transforms.get(face.key);
        const rect = wallRectToScreen({ x: 0, z: 0, width: face.length, height: face.height }, faceTransform);
        const note = combinedDepthNote(face, active);
        return (
          <Group key={face.key}>
            <Group listening={false}>
              <WallFrame
                wall={wall}
                transform={faceTransform}
                crownTop={resolveProfile(settings, room, wall).crownTop}
                hiddenEdges={hiddenEdges.get(face.key)}
              />
              <RecessShapes wall={wall} transform={faceTransform} onSelect={noop} />
              {(wall.openings ?? []).map((opening) => (
                <OpeningShape
                  key={opening.id}
                  opening={opening}
                  geometry={openingGeometry(opening, wall.length, settings)}
                  transform={faceTransform}
                  selectable={false}
                  onSelect={noop}
                  onMove={noop}
                />
              ))}
              <SoffitShapes
                room={room}
                wall={wall}
                transform={faceTransform}
                onSelect={noop}
                combinedJoins={soffitJoins.filter((join) => join.key === face.key)}
              />
              {wall.runs.map((run) => (
                <RunGroup
                  key={run.id}
                  run={run}
                  room={room}
                  wall={wall}
                  settings={settings}
                  showThrough={showThrough.get(face.key).filter((entry) => entry.runId === run.id)}
                  diagnostic={diagnostics[run.id]}
                  transform={faceTransform}
                  onSelectRun={noop}
                  onSelectPiece={noop}
                  onSelectFace={noop}
                  onEditTrack={noop}
                  stretchable={false}
                  showDimensions={false}
                />
              ))}
              <WallEndPanelShapes room={room} wall={wall} settings={settings} transform={faceTransform} onSelect={noop} />
              <NeighborReturns room={room} wall={wall} settings={settings} transform={faceTransform} shapes={shapes} doorsOff={doorsOff} />
              <NeighborProfiles room={room} wall={wall} settings={settings} transform={faceTransform} shapes={shapes} doorsOff={doorsOff} />
              {note && (
                <Text x={rect.x} y={rect.y + 10} width={rect.width} align="center" text={note} fontSize={12} fill="#e2e8f0" />
              )}
            </Group>
            <Rect
              {...rect}
              fill="rgba(0, 0, 0, 0.001)"
              onMouseDown={stopEvent}
              onMouseUp={stopEvent}
              onClick={(event) => {
                stopEvent(event);
                onActivate(face);
              }}
            />
          </Group>
        );
      })}
    </Layer>
  );
}
