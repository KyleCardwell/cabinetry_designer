import { memo, useMemo, useState } from 'react';
import {
  Group,
  Label,
  Line,
  Rect,
  Tag,
  Text,
} from 'react-konva';
import { KIND_COLORS } from '../model/constants.js';
import { cornerAt } from '../model/corners.js';
import { doorDrawing, runDoorDetails } from '../model/doorDetails.js';
import { runItems } from '../model/grid.js';
import { isFollowAnchor, isJointAnchor } from '../model/joints.js';
import { centerlineMarkers } from '../model/dimensions.js';
import { runBands } from '../model/runBands.js';
import { runScene } from '../model/runScene.js';
import { formatInches } from '../model/units.js';
import { CURSORS, useCursorKeys } from '../canvas/cursor.js';
import { runHighlight } from '../canvas/selectionHighlight.js';
import { wallRectToScreen, wallToScreen } from '../canvas/transform.js';
import CellChains from './CellChains.jsx';
import DoorDetails from './DoorDetails.jsx';
import FaceOutlines from './FaceOutlines.jsx';
import FrameOutline from './FrameOutline.jsx';
import PieceRect from './PieceRect.jsx';

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
  onEditTrack,
  stretchable = false,
  preview = false,
  onStretchStart,
  onStretchMove,
  onStretchEnd,
  cursor,
}) {
  const [anchorTooltip, setAnchorTooltip] = useState(null);
  const cursorKeys = useCursorKeys(cursor);
  const highlight = runHighlight(selectedRun, selectedPieceId, selectedFacePath);
  const scene = useMemo(() => runScene(room, wall, run, settings), [room, run, settings, wall]);
  const drawing = doorDrawing(room);
  const doorDetails = useMemo(
    () => runDoorDetails(room, wall, run, settings, scene),
    [room, run, scene, settings, wall],
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
  const toeKick = toScreen(bands.toeKick);
  const countertop = toScreen(bands.countertop);
  const topMold = toScreen(bands.topMold);
  const crown = toScreen(bands.crown);
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
      {toeKick && (
        <Rect
          {...toeKick}
          fill="#111827"
          stroke="#334155"
          strokeWidth={1}
          listening={false}
        />
      )}

      {countertop && (
        <Rect
          {...countertop}
          fill={bands.top.kind === 'wood' ? '#c8a27a' : '#cbd5e1'}
          opacity={0.9}
          stroke="#64748b"
          strokeWidth={1}
          listening={false}
        />
      )}

      {topMold && (
        <Rect
          {...topMold}
          fill="#94a3b8"
          opacity={0.9}
          stroke="#cbd5e1"
          strokeWidth={1}
          listening={false}
        />
      )}
      {crown && (
        <Rect
          {...crown}
          fill="#e2e8f0"
          opacity={0.82}
          stroke="#f8fafc"
          strokeWidth={1}
          listening={false}
        />
      )}

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

      <DoorDetails
        parts={doorDetails.parts}
        warnings={doorDetails.warnings}
        transform={transform}
        showDetails={drawing.details}
        showTags={drawing.tags}
      />

      {[...faceLayouts].map(([pieceId, layout]) => (
        <FaceOutlines
          key={`faces:${pieceId}`}
          faces={layout.faces}
          transform={transform}
          selectable={!preview && selectedPieceId === pieceId}
          showSizes={!preview && selectedPieceId === pieceId}
          selectedPath={selectedPieceId === pieceId ? highlight.facePath : null}
          onSelectFace={onSelectFace}
        />
      ))}

      <CellChains
        grids={cells.grids}
        transform={transform}
        editable={stretchable && !preview && Boolean(onEditTrack)}
        onEditTrack={(edit) => onEditTrack(run.id, edit)}
      />

      {result.pieces.flatMap((piece) => {
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

      {centerlineMarkers(run, result.pieces, wall, wall.length, settings).map((marker) => {
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
              text={marker.anchor === 'center' ? `℄ ${formatInches(marker.value)}` : formatInches(marker.value)}
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
