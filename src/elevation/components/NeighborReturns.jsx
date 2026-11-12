import { Fragment } from 'react';
import {
  Group,
  Line,
  Rect,
  Shape,
  Text,
} from 'react-konva';
import { wallRectToScreen, wallToScreen } from '../canvas/transform.js';
import { ELEVATION_BG, ELEVATION_LINE } from '../model/constants.js';
import { cornerShapes } from '../model/cornerParts.js';
import { cornerReturnLegs } from '../model/cornerLegs.js';
import { doorDrawing } from '../model/doorDetails.js';
import { landingsOn } from '../model/landings.js';
import { soffitSeams } from '../model/soffits.js';
import { runSwingMarks } from '../model/swingMarks.js';
import { wallLabel } from '../model/topology.js';
import Hatch from './Hatch.jsx';
import DoorDetails from './DoorDetails.jsx';
import FaceOutlines from './FaceOutlines.jsx';
import FrameOutline, { FRAME_STROKE } from './FrameOutline.jsx';
import Pulls from './Pulls.jsx';
import SwingMarks from './SwingMarks.jsx';
import { outlineGeometry, outlinePath } from './outlinePath.js';

/**
 * What this face sees of its neighbours at its corners and wing walls (SPEC-42.2): each return from
 * cornerShapes (sections hatched, end views and bands outlined) with its wall's label and wing wall outline.
 */
export default function NeighborReturns({
  room, wall, settings, transform, doorsOff = false,
  shapes = cornerShapes(room, wall, wall.side ?? 'front', settings),
  legs = cornerReturnLegs(room, wall, settings), selection = null,
}) {
  const drawing = doorDrawing(room);
  const seams = soffitSeams(room, wall);
  const returns = shapes
    .filter((shape) => shape.kind === 'return')
    .map((shape) => {
      const neighbor = room.walls.find((candidate) => candidate.id === shape.wallId);
      const name = neighbor ? wallLabel(room, neighbor) : '';
      const label = shape.cornerOf ? '' : shape.soffitId ? `${name} soffit`.trim() : name;
      const parts = shape.parts.map((part) => ({
        ...part,
        rect: wallRectToScreen(part, transform),
      }));
      const labelPart = parts.find((part) => ['section', 'profile'].includes(part.kind)) ?? parts[0];
      return { key: shape.key, label, parts, labelRect: labelPart.rect };
    });

  const landings = landingsOn(room, wall).flatMap(({ wallId, a, b }) => {
    const landedWall = room.walls.find((candidate) => candidate.id === wallId);
    if (!landedWall) return [];
    const verticalEdge = (x) => {
      const seam = seams.find((candidate) => (
        candidate.wallId === wallId && Math.abs(candidate.x - x) <= 1e-6
      ));
      return [{ x, z: 0 }, { x, z: seam?.bottom ?? landedWall.height }];
    };
    return [{
      key: `landing:${wallId}:${a}:${b}`,
      label: wallLabel(room, landedWall),
      rect: wallRectToScreen({ x: a, z: 0, width: b - a, height: landedWall.height }, transform),
      edges: [
        [{ x: a, z: 0 }, { x: b, z: 0 }],
        [{ x: a, z: landedWall.height }, { x: b, z: landedWall.height }],
        verticalEdge(a),
        verticalEdge(b),
      ],
    }];
  });

  return (
    <>
      {legs.map((leg) => {
        const owner = room.walls.find(({ id }) => id === leg.ownerWallId)
          ?.runs.find(({ id }) => id === leg.runId);
        const selected = selection?.cornerOf?.wallId === leg.ownerWallId
          && selection.cornerOf.runId === leg.runId && selection.cornerOf.side === leg.side;
        const edgeX = leg.sideEdge && leg.sideEdge.x
          + (leg.sideEdge.x === leg.rect.x ? leg.sideEdge.width : 0);
        const edgeFrom = leg.sideEdge && wallToScreen({ x: edgeX, z: leg.rect.z }, transform);
        const edgeTo = leg.sideEdge && wallToScreen({ x: edgeX, z: leg.rect.z + leg.rect.height }, transform);
        return (
          <Fragment key={leg.key}>
            <Rect
              {...wallRectToScreen(leg.rect, transform)}
              fill={ELEVATION_BG}
              stroke={selected ? '#7dd3fc' : ELEVATION_LINE}
              strokeWidth={selected ? 3 : 1}
              listening={false}
            />
            {leg.returnPanel && (
              <Rect
                {...wallRectToScreen(leg.returnPanel, transform)}
                fill={ELEVATION_BG}
                opacity={0.82}
                stroke={ELEVATION_LINE}
                strokeWidth={1}
                listening={false}
              />
            )}
            {(leg.bands ?? []).map((band) => {
              const countertop = band.kind === 'countertop';
              const stroke = countertop ? '#64748b' : ELEVATION_LINE;
              const opacity = band.kind === 'toe_kick' ? 1 : band.kind === 'crown' ? 0.82 : 0.9;
              const BandShape = band.outline ? Shape : Rect;
              return (
                <Fragment key={band.id}>
                  <BandShape
                    {...(band.outline ? outlineGeometry(band.outline, transform) : wallRectToScreen(band, transform))}
                    fill={countertop && owner?.top !== 'wood' ? '#cbd5e1' : ELEVATION_BG}
                    opacity={opacity}
                    stroke={stroke}
                    strokeWidth={1}
                    listening={false}
                  />
                  {(band.lines ?? []).map((line, index) => {
                    const from = wallToScreen({ x: line.x1, z: line.z1 }, transform);
                    const to = wallToScreen({ x: line.x2, z: line.z2 }, transform);
                    return (
                      <Line
                        key={`line:${index}`}
                        points={[from.x, from.y, to.x, to.y]}
                        stroke={stroke}
                        strokeWidth={band.kind === 'furniture_base' ? 1 : 0.5}
                        opacity={band.kind === 'furniture_base' ? 1 : opacity}
                        listening={false}
                      />
                    );
                  })}
                </Fragment>
              );
            })}
            {leg.sideEdge && (
              <Line
                key="corner-side-edge"
                points={[edgeFrom.x, edgeFrom.y, edgeTo.x, edgeTo.y]}
                stroke={ELEVATION_LINE}
                strokeWidth={1}
                listening={false}
              />
            )}
            {leg.frame && (
              <>
                <FrameOutline region={leg.frame} transform={transform} />
                {leg.frame.openings.map((opening, index) => (
                  <Rect key={`frame-opening-${index}`} {...wallRectToScreen(opening, transform)}
                    fillEnabled={false} stroke={FRAME_STROKE} strokeWidth={1} listening={false} />
                ))}
              </>
            )}
            {!doorsOff && (
              <>
                {drawing.details && (
                  <DoorDetails
                    parts={leg.doorDetails.parts}
                    warnings={leg.doorDetails.warnings}
                    transform={transform}
                    showDetails={drawing.details}
                    showTags={drawing.tags}
                  />
                )}
                {drawing.swings && (
                  <SwingMarks
                    marks={runSwingMarks(new Map([[leg.columnId, leg.faceLayout]]))}
                    transform={transform}
                  />
                )}
                {drawing.pulls && <Pulls pulls={leg.pulls} transform={transform} />}
                <FaceOutlines faces={leg.faceLayout.faces} transform={transform} />
              </>
            )}
          </Fragment>
        );
      })}
      {returns.map((entry) => (
        <Group key={entry.key} listening={false}>
          {entry.parts.map((part) => {
            const PartShape = part.outline ? Shape : Rect;
            const geometry = part.outline ? outlineGeometry(part.outline, transform) : part.rect;
            const section = part.kind === 'section';
            const profile = part.kind === 'profile';
            const outlined = part.kind === 'end_panel' || part.kind === 'furniture_base';
            // A crown or top mold seen end-on is in front of this wall's own bands, so it hides them.
            const molding = part.kind === 'crown' || part.kind === 'top_mold';
            const clipFunc = part.outline ? outlinePath(part.outline, transform) : undefined;
            return (
              <Group key={part.id} listening={false}>
                <PartShape
                  {...geometry}
                  // An end panel seen end-on stands in front of this wall, so it covers what's behind it (FX5.1).
                  fill={section ? '#475569' : outlined || molding ? ELEVATION_BG : undefined}
                  opacity={section ? 0.26 : part.kind === 'end_panel' ? 0.82 : part.kind === 'furniture_base' ? 0.9 : 1}
                  stroke={outlined ? ELEVATION_LINE : profile ? '#64748b' : '#94a3b8'}
                  strokeWidth={section ? 1.5 : 1}
                  listening={false}
                />
                {(part.lines ?? []).map((line, index) => {
                  const from = wallToScreen({ x: line.x1, z: line.z1 }, transform);
                  const to = wallToScreen({ x: line.x2, z: line.z2 }, transform);
                  return (
                    <Line
                      key={`line:${index}`}
                      points={[from.x, from.y, to.x, to.y]}
                      stroke={outlined ? ELEVATION_LINE : '#94a3b8'}
                      strokeWidth={part.kind === 'furniture_base' ? 1 : 0.5}
                      listening={false}
                    />
                  );
                })}
                {section && (
                  <Group clipFunc={clipFunc} listening={false}>
                    <Hatch rect={part.rect} />
                  </Group>
                )}
                {!doorsOff && doorDrawing(room).details && part.doorDetail && (
                  <DoorDetails
                    parts={[{ ...part, key: part.id, ...part.doorDetail, lines: part.doorDetail.profileLines }]}
                    warnings={[]}
                    transform={transform}
                    showDetails
                    showTags={false}
                  />
                )}
              </Group>
            );
          })}
          {entry.label && <Text
            {...entry.labelRect}
            text={entry.label}
            align="center"
            verticalAlign="middle"
            fontSize={10 * (transform.text?.label ?? 1)}
            fill="#e2e8f0"
            listening={false}
          />}
        </Group>
      ))}
      {landings.map((entry) => (
        <Group key={entry.key} listening={false}>
          {entry.edges.map(([start, end]) => {
            const screenStart = wallToScreen(start, transform);
            const screenEnd = wallToScreen(end, transform);
            return (
              <Line
                key={`${start.x}:${start.z}:${end.x}:${end.z}`}
                points={[screenStart.x, screenStart.y, screenEnd.x, screenEnd.y]}
                stroke="#94a3b8"
                strokeWidth={1.5}
                listening={false}
              />
            );
          })}
          <Text
            {...entry.rect}
            text={entry.label}
            align="center"
            verticalAlign="middle"
            fontSize={10 * (transform.text?.label ?? 1)}
            fill="#e2e8f0"
            listening={false}
          />
        </Group>
      ))}
    </>
  );
}
