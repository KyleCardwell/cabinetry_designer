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
import { paintEntries, screenFace } from '../model/screenPaint.js';
import { wallShowThrough } from '../model/showThrough.js';
import FacePainter from './FacePainter.jsx';
import NeighborReturns from './NeighborReturns.jsx';
import OpeningShape from './OpeningShape.jsx';
import RecessShapes from './RecessShapes.jsx';
import ShowThroughInteriors from './ShowThroughInteriors.jsx';
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

function CombinedFace({
  room, face, wall, shapes, active, settings, faceTransform, onActivate, doorsOff,
  soffitJoins, hiddenEdges, showThrough,
}) {
  const entries = useMemo(() => paintEntries(screenFace(
    room, wall.sideSource ?? wall, face.side, settings, {
      cornerShapes: shapes,
      soffitJoins: soffitJoins.filter((join) => join.key === face.key),
    },
  ), { doorsOff }), [room, wall, face, settings, shapes, soffitJoins, doorsOff]);
  const showThroughByItem = useMemo(() => new Map(showThrough.map((entry) => [entry.itemId, entry])),
    [showThrough]);
  const showThroughSlot = (part) => {
    const entry = !doorsOff && part.kind === 'cabinet' && showThroughByItem.get(part.id);
    return entry ? <ShowThroughInteriors entries={[entry]} transform={faceTransform}
      room={room} wall={wall} settings={settings} /> : null;
  };
  const rect = wallRectToScreen({ x: 0, z: 0, width: face.length, height: face.height }, faceTransform);
  const note = combinedDepthNote(face, active);
  return (
    <Group>
      <Group listening={false}>
        <WallFrame
          wall={wall}
          transform={faceTransform}
          crownTop={resolveProfile(settings, room, wall).crownTop}
          hiddenEdges={hiddenEdges}
        />
        <RecessShapes wall={wall} transform={faceTransform} onSelect={noop} />
        {(wall.openings ?? []).map((opening) => (
          <OpeningShape
            key={opening.id}
            opening={opening}
            geometry={openingGeometry(opening, wall.length, settings)}
            settings={settings}
            transform={faceTransform}
            selectable={false}
            onSelect={noop}
            onMove={noop}
          />
        ))}
        <FacePainter entries={entries} transform={faceTransform} after={showThroughSlot} doorsOff={doorsOff} />
        <NeighborReturns room={room} wall={wall} settings={settings}
          transform={faceTransform} shapes={shapes} />
        {note && (
          <Text x={rect.x} y={rect.y + 10} width={rect.width} align="center" text={note} fontSize={12 * (faceTransform.text?.label ?? 1)} fill="#e2e8f0" />
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
}

/** Display-only faces: a separate hit surface switches faces without exposing editing handlers. */
export default function CombinedFaces({
  room, combined, faces, activeKey, settings, transform, onActivate, doorsOff = false,
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
        return (
          <CombinedFace
            key={face.key}
            room={room}
            face={face}
            wall={wall}
            shapes={shapes}
            active={active}
            settings={settings}
            faceTransform={transforms.get(face.key)}
            onActivate={onActivate}
            doorsOff={doorsOff}
            soffitJoins={soffitJoins}
            hiddenEdges={hiddenEdges.get(face.key)}
            showThrough={showThrough.get(face.key)}
          />
        );
      })}
    </Layer>
  );
}
