import { memo, useMemo, useState } from 'react';
import {
  Group,
  Label,
  Line,
  Rect,
  Shape,
  Tag,
  Text,
} from 'react-konva';
import { KIND_COLORS } from '../model/constants.js';
import { cornerAt } from '../model/corners.js';
import { doorDrawing, runDoorDetails } from '../model/doorDetails.js';
import { runItems } from '../model/grid.js';
import { isFollowAnchor, isJointAnchor } from '../model/joints.js';
import { centerlineMarkers } from '../model/dimensions.js';
import { runStepSides } from '../model/columnSteps.js';
import { runBands } from '../model/runBands.js';
import { runScene } from '../model/runScene.js';
import { runPulls } from '../model/pullLayouts.js';
import { runSwingMarks } from '../model/swingMarks.js';
import { formatDimension } from '../model/units.js';
import { CURSORS, useCursorKeys } from '../canvas/cursor.js';
import { runHighlight } from '../canvas/selectionHighlight.js';
import { wallRectToScreen, wallToScreen } from '../canvas/transform.js';
import CellChains from './CellChains.jsx';
import DoorDetails from './DoorDetails.jsx';
import FaceOutlines from './FaceOutlines.jsx';
import FrameOutline from './FrameOutline.jsx';
import InteriorShapes from './InteriorShapes.jsx';
import InteriorDimensions from './InteriorDimensions.jsx';
import PieceRect from './PieceRect.jsx';
import Pulls from './Pulls.jsx';
import SwingMarks from './SwingMarks.jsx';
import ShowThroughInteriors from './ShowThroughInteriors.jsx';
import { outlineGeometry } from './outlinePath.js';

function RunGroup({
  run,
  room,
  wall,
  settings,
  diagnostic,
  transform,
  selectedRun,
  selectedPieceId,
  onSelectRun,
  onSelectPiece,
  selectedFacePath = null,
  onSelectFace,
  doorsOff = false,
  interiors = [],
  showThrough = [],
  drawerBoxes = [],
  adjustableShelves,
  rollouts,
  accessories,
  interiorPath = null,
  interiorDivider = null,
  onSelectInterior,
  onEditDivider,
  onMoveDivider,
  onEditTrack,
  stretchable = false,
  preview = false,
  showDimensions = true,
  onStretchStart,
  onStretchMove,
  onStretchEnd,
  cursor,
}) {
  const [anchorTooltip, setAnchorTooltip] = useState(null);
  const [dividerPreview, setDividerPreview] = useState(null);
  const cursorKeys = useCursorKeys(cursor);
  const highlight = runHighlight(selectedRun, selectedPieceId, selectedFacePath);
  const scene = useMemo(() => runScene(room, wall, run, settings), [room, run, settings, wall]);
  const drawing = doorDrawing(room);
  const doorDetails = useMemo(
    () => runDoorDetails(room, wall, run, settings, scene),
    [room, run, scene, settings, wall],
  );
  const swingMarks = useMemo(() => runSwingMarks(scene.faceLayouts), [scene]);
  const pulls = useMemo(
    () => runPulls(room, wall, run, settings, scene, doorDetails),
    [room, wall, run, settings, scene, doorDetails],
  );
  const {
    result, cells, faceLayouts, frames, framedIds, hiddenIds, ghostIds, subLabels,
    panels, panelPieceIds, shelves, drawnPieces,
  } = scene;
  const bands = useMemo(
    () => runBands(room, wall, run, settings, scene),
    [room, run, scene, settings, wall],
  );
  const toScreen = (rect) => rect && wallRectToScreen(rect, transform);
  const toBand = (band) => band?.outline ? outlineGeometry(band.outline, transform) : toScreen(band);
  const topMold = toBand(bands.topMold);
  const crown = toBand(bands.crown);
  const TopMoldShape = bands.topMold?.outline ? Shape : Rect;
  const CrownShape = bands.crown?.outline ? Shape : Rect;
  const bottomParts = bands.bottomParts.map((part) => ({ ...part, rect: toScreen(part) }));
  const chipLines = bands.chipLines.map((line) => {
    const from = wallToScreen({ x: line.x1, z: line.z }, transform);
    const to = wallToScreen({ x: line.x2, z: line.z }, transform);
    return { key: `chip:${line.pieceId}`, points: [from.x, from.y, to.x, to.y] };
  });
  const warningPieceIds = useMemo(
    () => new Set(
      [...result.warnings, ...cells.warnings, ...(diagnostic?.warnings ?? [])]
        .map((entry) => entry.pieceId),
    ),
    [cells.warnings, diagnostic?.warnings, result.warnings],
  );
  const hasErrors = (diagnostic?.errors ?? result.errors).length > 0;
  const runRect = wallRectToScreen(run, transform);
  const cornerFillers = useMemo(() => Object.fromEntries(
    ['left', 'right'].map((side) => [
      side,
      run.anchors?.[side] === true
        && ['filler', 'blind'].includes(run.ends[side].type)
        && run.ends[side].width === null
        && cornerAt(room, wall, side).type === 'inside',
    ]),
  ), [room, run, wall]);

  const selectRun = (event) => {
    event.cancelBubble = true;
    onSelectRun(run.id);
  };

  const edgeXFor = (side) => (
    side === 'left' ? runRect.x : runRect.x + runRect.width
  );

  const wallXFromHandle = (event) => (
    (event.target.x() - transform.offsetX) / transform.scale
  );

  const stopHandleEvent = (event) => {
    event.cancelBubble = true;
  };

  const renderAnchor = (side) => {
    if (!run.anchors?.[side]
      || isJointAnchor(run.anchors[side])
      || isFollowAnchor(run.anchors[side])) return null;
    const x = side === 'left' ? runRect.x + 2 : runRect.x + runRect.width - 9;
    const tooltipX = side === 'left' ? runRect.x + 8 : runRect.x + runRect.width - 8;
    return (
      <Group
        key={side}
        listening={selectedRun && stretchable}
        onMouseDown={stopHandleEvent}
        onMouseUp={stopHandleEvent}
        onClick={stopHandleEvent}
        onMouseEnter={() => {
          setAnchorTooltip(side);
          cursorKeys.request('badge', CURSORS.explain);
        }}
        onMouseLeave={() => {
          setAnchorTooltip(null);
          cursorKeys.release('badge');
        }}
      >
        <Text
          x={x}
          y={runRect.y + 2}
          text={side === 'left' ? '▌' : '▐'}
          fontSize={14}
          fill="#67e8f9"
        />
        {anchorTooltip === side && (
          <Label x={tooltipX} y={runRect.y - 6} listening={false}>
            <Tag
              fill="#0f172a"
              stroke="#67e8f9"
              strokeWidth={1}
              cornerRadius={3}
              pointerDirection="down"
              pointerWidth={8}
              pointerHeight={5}
            />
            <Text
              text="Anchored — set Anchor to Free to resize"
              fill="#e2e8f0"
              fontSize={11}
              padding={6}
            />
          </Label>
        )}
      </Group>
    );
  };

  const renderStretchHandle = (side) => {
    if (isJointAnchor(run.anchors?.[side])
      || !selectedRun || !stretchable || run.anchors?.[side]) return null;
    const edgeX = edgeXFor(side);
    return (
      <Rect
        key={side}
        x={edgeX}
        y={runRect.y}
        offsetX={4}
        width={8}
        height={runRect.height}
        fill="#38bdf8"
        opacity={0.65}
        stroke="#bae6fd"
        strokeWidth={1}
        draggable
        dragBoundFunc={(position) => ({ x: position.x, y: runRect.y })}
        onMouseDown={(event) => {
          stopHandleEvent(event);
          onStretchStart?.(run.id, side);
        }}
        onMouseUp={stopHandleEvent}
        onClick={stopHandleEvent}
        onMouseEnter={() => cursorKeys.request(side, CURSORS.resizeX)}
        onMouseLeave={() => cursorKeys.release(side)}
        onDragStart={(event) => {
          stopHandleEvent(event);
        }}
        onDragMove={(event) => {
          stopHandleEvent(event);
          onStretchMove?.(run.id, side, wallXFromHandle(event));
        }}
        onDragEnd={(event) => {
          stopHandleEvent(event);
          const newEdgeX = wallXFromHandle(event);
          event.target.position({ x: edgeX, y: runRect.y });
          cursorKeys.request(side, CURSORS.resizeX);
          onStretchEnd?.(run.id, side, newEdgeX);
        }}
      />
    );
  };

  return (
    <Group opacity={preview ? 0.72 : 1}>
      {bands.toeKicks.map((band, index) => (
        <Rect
          key={`toeKick:${index}`}
          {...toScreen(band)}
          fill="#111827"
          stroke="#334155"
          strokeWidth={1}
          listening={false}
        />
      ))}

      {bands.furnitureBases.map((band, index) => {
        const FurnitureBaseShape = band.outline ? Shape : Rect;
        return (
          <FurnitureBaseShape
            key={`furnitureBase:${index}`}
            {...toBand(band)}
            fill="#94a3b8"
            opacity={0.9}
            stroke="#cbd5e1"
            strokeWidth={1}
            listening={false}
          />
        );
      })}

      {[...bands.countertops, ...bands.topSegments].map((band, index) => {
        const CountertopShape = band.outline ? Shape : Rect;
        return (
          <CountertopShape
            key={band.id ?? `countertop:${index}`}
            {...toBand(band)}
            fill={(band.kind ?? bands.top.kind) === 'wood' ? '#c8a27a' : '#cbd5e1'}
            opacity={0.9}
            stroke="#64748b"
            strokeWidth={1}
            listening={false}
          />
        );
      })}

      {topMold && (
        <TopMoldShape
          {...topMold}
          fill="#94a3b8"
          opacity={0.9}
          stroke="#cbd5e1"
          strokeWidth={1}
          listening={false}
        />
      )}
      {crown && (
        <CrownShape
          {...crown}
          fill="#e2e8f0"
          opacity={0.82}
          stroke="#f8fafc"
          strokeWidth={1}
          listening={false}
        />
      )}

      {[
        ['toeKicks', '#334155', 1],
        ['furnitureBases', '#cbd5e1', 0.9],
        ['countertops', '#64748b', 0.9],
        ['topMold', '#cbd5e1', 0.9],
        ['crown', '#f8fafc', 0.82],
      ].flatMap(([kind, stroke, opacity]) => {
        const segments = Array.isArray(bands[kind]) ? bands[kind] : [bands[kind]];
        return segments.flatMap((band, segmentIndex) => (band?.lines ?? []).map((line, index) => {
          const from = wallToScreen({ x: line.x1, z: line.z1 }, transform);
          const to = wallToScreen({ x: line.x2, z: line.z2 }, transform);
          return (
            <Line
              key={`${kind}:${segmentIndex}:line:${index}`}
              points={[from.x, from.y, to.x, to.y]}
              stroke={stroke}
              strokeWidth={0.5}
              opacity={opacity}
              listening={false}
            />
          );
        }));
      })}

      {bottomParts.map((part) => (
        <Rect
          key={part.id}
          {...part.rect}
          fill={part.behind ? 'transparent' : '#94a3b8'}
          opacity={0.9}
          stroke="#cbd5e1"
          strokeWidth={1}
          dash={part.behind || part.kind === 'corbels' ? [4, 3] : undefined}
          listening={false}
        />
      ))}

      <Rect
        {...runRect}
        fill="rgba(0, 0, 0, 0.001)"
        onClick={selectRun}
        onMouseEnter={() => cursorKeys.request('body', CURSORS.select)}
        onMouseLeave={() => cursorKeys.release('body')}
      />

      {panels.map((panel) => (
        <Rect
          key={panel.key}
          {...wallRectToScreen({
            x: panel.x,
            z: run.z,
            width: panel.width,
            height: run.height,
          }, transform)}
          fill={KIND_COLORS.end_panel}
          opacity={0.82}
          stroke="#1e293b"
          strokeWidth={1}
          listening={false}
        />
      ))}

      {drawnPieces.filter((piece) => !hiddenIds.has(piece.id)).map((piece) => (
        <PieceRect
          key={piece.id}
          piece={piece}
          transform={transform}
          warning={warningPieceIds.has(piece.id) || warningPieceIds.has(piece.columnId)}
          error={hasErrors}
          selected={highlight.pieceId === piece.id}
          subLabel={subLabels.get(piece.id) ?? null}
          framed={framedIds.has(piece.id)}
          ghost={ghostIds.has(piece.id)}
          cornerFiller={!panelPieceIds.has(piece.id) && (piece.role === 'end-left'
            ? cornerFillers.left
            : piece.role === 'end-right' && cornerFillers.right)}
          onSelect={() => onSelectPiece(run.id, piece.id)}
          cursor={cursor}
        />
      ))}

      {frames.regions.map((region) => (
        <FrameOutline
          key={region.id}
          region={region}
          transform={transform}
        />
      ))}

      {!doorsOff && showThrough.length > 0 && (
        <ShowThroughInteriors entries={showThrough} transform={transform}
          room={room} wall={wall} settings={settings} />
      )}

      {doorsOff && (
        <InteriorShapes
          entries={interiors}
          framedIds={framedIds}
          drawerBoxes={drawerBoxes}
          shelves={adjustableShelves}
          rollouts={rollouts}
          accessories={accessories}
          drawnPieces={drawnPieces}
          transform={transform}
          selectedPieceId={preview ? null : selectedPieceId}
          interiorPath={interiorPath}
          interiorDivider={interiorDivider}
          onSelectInterior={onSelectInterior}
          draggable={stretchable && !preview && Boolean(onMoveDivider)}
          dragPreview={dividerPreview}
          onPreviewDivider={setDividerPreview}
          onMoveDivider={onMoveDivider}
        />
      )}
      {doorsOff && !preview && interiors.filter((entry) => entry.itemId === selectedPieceId).map((entry) => {
        const clip = toScreen(drawnPieces.find(({ id }) => id === entry.itemId));
        return (
          <Group
            key={entry.itemId}
            clipX={clip?.x}
            clipY={clip?.y}
            clipWidth={clip?.width}
            clipHeight={clip?.height}
          >
            <InteriorDimensions
              entry={entry}
              transform={transform}
              editable={stretchable && Boolean(onEditDivider)}
              onEditDivider={onEditDivider}
              dragPreview={dividerPreview}
            />
          </Group>
        );
      })}

      {chipLines.map((line) => (
        <Line
          key={line.key}
          points={line.points}
          stroke="#e2e8f0"
          strokeWidth={1}
          dash={[3, 2]}
          listening={false}
        />
      ))}

      {shelves.map((part) => (
        <Rect
          key={part.id}
          {...wallRectToScreen(part, transform)}
          fill={KIND_COLORS[part.kind]}
          opacity={part.kind === 'shelf' ? 0.9 : 0.25}
          stroke="#1e293b"
          strokeWidth={1}
          listening={false}
        />
      ))}

      {!doorsOff && (
        <DoorDetails
          parts={doorDetails.parts.map((part) => showThrough.some((entry) => entry.glass.some(
            ({ partId }) => partId === part.key.replace(/:(left|right)$/, '$1'),
          )) ? { ...part, openingsShown: false } : part)}
          warnings={doorDetails.warnings}
          transform={transform}
          showDetails={drawing.details}
          showTags={drawing.tags}
        />
      )}
      {!doorsOff && drawing.swings && <SwingMarks marks={swingMarks} transform={transform} />}
      {!doorsOff && drawing.pulls && <Pulls pulls={pulls.pulls} transform={transform} />}

      {!doorsOff && [...faceLayouts].map(([pieceId, layout]) => (
        <FaceOutlines
          key={`faces:${pieceId}`}
          faces={layout.faces}
          transform={transform}
          framed={framedIds.has(pieceId)}
          selectable={!preview && selectedPieceId === pieceId}
          showSizes={!preview && selectedPieceId === pieceId}
          selectedPath={selectedPieceId === pieceId ? highlight.facePath : null}
          onSelectFace={onSelectFace}
        />
      ))}

      {showDimensions && (
        <CellChains
          grids={cells.grids}
          steps={runStepSides(run, result)}
          transform={transform}
          editable={stretchable && !preview && Boolean(onEditTrack)}
          onEditTrack={(edit) => onEditTrack(run.id, edit)}
        />
      )}

      {showDimensions && result.pieces.flatMap((piece) => {
        const item = piece.role === 'item'
          ? runItems(run).find((candidate) => candidate.id === piece.id)
          : null;
        if (!item?.pin) return [];
        const anchorX = item.pin.anchor === 'right'
          ? piece.x + piece.width
          : item.pin.anchor === 'center' ? piece.x + piece.width / 2 : piece.x;
        const marker = wallRectToScreen({
          x: anchorX,
          z: piece.z + piece.height,
          width: 0,
          height: 0,
        }, transform);
        return [(
          <Text
            key={`pin:${piece.id}`}
            x={marker.x - 5}
            y={marker.y + 3}
            width={10}
            align="center"
            text="◆"
            fontSize={10}
            fill="#22d3ee"
            listening={false}
          />
        )];
      })}

      {showDimensions && centerlineMarkers(run, result.pieces, wall, wall.length, settings).map((marker) => {
        const datum = wallRectToScreen({ x: marker.datumX, z: marker.z, width: 0, height: 0 }, transform);
        const center = wallRectToScreen({ x: marker.x, z: marker.z, width: 0, height: 0 }, transform);
        const spanTop = wallRectToScreen({
          x: marker.x,
          z: Math.max(marker.z, marker.pieceTop),
          width: 0,
          height: 0,
        }, transform);
        const spanBottom = wallRectToScreen({
          x: marker.x,
          z: Math.min(marker.z, marker.pieceBottom),
          width: 0,
          height: 0,
        }, transform);
        const midX = (datum.x + center.x) / 2;
        const extensionTop = Number.isFinite(marker.datumZ)
          ? wallRectToScreen({ x: marker.datumX, z: marker.datumZ, width: 0, height: 0 }, transform)
          : null;
        return (
          <Group key={`centerline:${marker.pieceId}`} listening={false}>
            {extensionTop && (
              <Line
                points={[datum.x, extensionTop.y, datum.x, datum.y]}
                stroke="#facc15"
                strokeWidth={1}
                dash={[3, 2]}
              />
            )}
            <Line
              points={[spanBottom.x, spanBottom.y, spanTop.x, spanTop.y]}
              stroke="#facc15"
              strokeWidth={1}
              dash={[3, 2]}
            />
            <Line
              points={[datum.x, datum.y, center.x, center.y]}
              stroke="#facc15"
              strokeWidth={1}
            />
            {[datum, center].map((point, index) => (
              <Line
                key={`tick:${index}`}
                points={[point.x - 3, point.y + 3, point.x + 3, point.y - 3]}
                stroke="#facc15"
                strokeWidth={1}
              />
            ))}
            <Text
              x={midX - 40}
              y={datum.y - 14}
              width={80}
              align="center"
              text={marker.anchor === 'center' ? `℄ ${formatDimension(marker.value)}` : formatDimension(marker.value)}
              fontSize={11}
              fill="#facc15"
            />
          </Group>
        );
      })}

      {renderAnchor('left')}
      {renderAnchor('right')}

      {highlight.run && (
        <Rect
          {...runRect}
          fillEnabled={false}
          stroke="#38bdf8"
          strokeWidth={2.5}
          listening={false}
        />
      )}

      {renderStretchHandle('left')}
      {renderStretchHandle('right')}
    </Group>
  );
}

export default memo(RunGroup);
