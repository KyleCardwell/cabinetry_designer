import { memo, useMemo, useState } from 'react';
import {
  Group,
  Label,
  Line,
  Rect,
  Tag,
  Text,
} from 'react-konva';
import { CABINET_TYPE_IDS } from '../model/constants.js';
import { cornerAt } from '../model/corners.js';
import { runFaceLayouts } from '../model/faceLayouts.js';
import { isJointAnchor } from '../model/joints.js';
import { panelDrop, resolveStyle } from '../model/styles.js';
import { centerlineMarkers } from '../model/dimensions.js';
import { splitRun } from '../model/splitRun.js';
import { resolveProfile } from '../model/profile.js';
import { runMolding } from '../model/soffits.js';
import {
  endCornerAnglesForRun,
  endMinWidthsForRun,
  pinTargetsForRun,
} from '../model/room.js';
import { formatInches } from '../model/units.js';
import { wallRectToScreen } from '../canvas/transform.js';
import FaceOutlines from './FaceOutlines.jsx';
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
  stretchable = false,
  preview = false,
  onStretchStart,
  onStretchMove,
  onStretchEnd,
}) {
  const [anchorTooltip, setAnchorTooltip] = useState(null);
  const result = useMemo(() => splitRun(run, settings, {
    endMinWidths: endMinWidthsForRun(room, wall, run, settings),
    endCornerAngles: endCornerAnglesForRun(room, wall, run),
    pinTargets: pinTargetsForRun(run, wall, wall.length, settings),
  }), [room, run, settings, wall]);
  const faceLayouts = useMemo(
    () => runFaceLayouts(room, wall, run, settings, result),
    [result, room, run, settings, wall],
  );
  const drop = panelDrop(run, resolveStyle(settings, room, run), settings);
  const drawnPieces = useMemo(() => (drop > 0
    ? result.pieces.map((piece) => (piece.kind === 'filler' || piece.kind === 'end_panel'
      ? { ...piece, z: piece.z - drop, height: piece.height + drop }
      : piece))
    : result.pieces), [drop, result]);
  const profile = useMemo(
    () => resolveProfile(settings, room, wall),
    [room, settings, wall],
  );
  const toeKickHeight = run.overrides?.toeKickHeight ?? profile.toeKickHeight;
  const countertopThickness = run.overrides?.countertopThickness
    ?? profile.countertopThickness;
  const showsMolding = run.heightMode === 'auto'
    && (run.cabinetTypeId === CABINET_TYPE_IDS.UPPER
      || run.cabinetTypeId === CABINET_TYPE_IDS.TALL);
  const molding = runMolding(wall, run);
  const boxTop = run.z + run.height;
  const topMold = wallRectToScreen({
    x: run.x,
    z: boxTop,
    width: run.width,
    height: profile.topMoldHeight,
  }, transform);
  const crown = wallRectToScreen({
    x: run.x,
    z: boxTop + profile.crownStackHeight - profile.crownHeight,
    width: run.width,
    height: profile.crownHeight,
  }, transform);
  const warningPieceIds = useMemo(
    () => new Set(
      [...result.warnings, ...(diagnostic?.warnings ?? [])].map((entry) => entry.pieceId),
    ),
    [diagnostic?.warnings, result.warnings],
  );
  const hasErrors = (diagnostic?.errors ?? result.errors).length > 0;
  const hasToeKick = run.cabinetTypeId === CABINET_TYPE_IDS.BASE
    || run.cabinetTypeId === CABINET_TYPE_IDS.TALL;
  const isBase = run.cabinetTypeId === CABINET_TYPE_IDS.BASE;
  const toeKickWidth = Math.max(0, run.width - 6);
  const toeKick = wallRectToScreen({
    x: run.x + Math.min(3, run.width / 2),
    z: 0,
    width: toeKickWidth,
    height: toeKickHeight,
  }, transform);
  const countertop = wallRectToScreen({
    x: run.x - 1,
    z: run.z + run.height,
    width: run.width + 2,
    height: countertopThickness,
  }, transform);
  const runRect = wallRectToScreen(run, transform);
  const cornerFillers = useMemo(() => Object.fromEntries(
    ['left', 'right'].map((side) => [
      side,
      run.anchors?.[side] === true
        && run.ends[side].type === 'filler'
        && run.ends[side].width === null
        && cornerAt(room, wall, side).type === 'inside',
    ]),
  ), [room, run, wall]);

  const selectRun = (event) => {
    event.cancelBubble = true;
    onSelectRun(run.id);
  };

  const setResizeCursor = (event, cursor) => {
    const stage = event.target.getStage();
    if (stage) stage.container().style.cursor = cursor;
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
    if (!run.anchors?.[side] || isJointAnchor(run.anchors[side])) return null;
    const x = side === 'left' ? runRect.x + 2 : runRect.x + runRect.width - 9;
    const tooltipX = side === 'left' ? runRect.x + 8 : runRect.x + runRect.width - 8;
    return (
      <Group
        key={side}
        listening={selectedRun && stretchable}
        onMouseDown={stopHandleEvent}
        onMouseUp={stopHandleEvent}
        onClick={stopHandleEvent}
        onMouseEnter={(event) => {
          setAnchorTooltip(side);
          setResizeCursor(event, 'help');
        }}
        onMouseLeave={(event) => {
          setAnchorTooltip(null);
          setResizeCursor(event, 'default');
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
        onMouseEnter={(event) => setResizeCursor(event, 'ew-resize')}
        onMouseLeave={(event) => setResizeCursor(event, 'default')}
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
          setResizeCursor(event, 'ew-resize');
          onStretchEnd?.(run.id, side, newEdgeX);
        }}
      />
    );
  };

  return (
    <Group opacity={preview ? 0.72 : 1}>
      {hasToeKick && toeKickWidth > 0 && (
        <Rect
          {...toeKick}
          fill="#111827"
          stroke="#334155"
          strokeWidth={1}
          listening={false}
        />
      )}

      {isBase && (
        <Rect
          {...countertop}
          fill="#cbd5e1"
          opacity={0.9}
          stroke="#64748b"
          strokeWidth={1}
          listening={false}
        />
      )}

      {showsMolding && molding !== 'none' && (
        <Rect
          {...topMold}
          fill="#94a3b8"
          opacity={0.9}
          stroke="#cbd5e1"
          strokeWidth={1}
          listening={false}
        />
      )}
      {showsMolding && molding === 'crown' && (
        <Rect
          {...crown}
          fill="#e2e8f0"
          opacity={0.82}
          stroke="#f8fafc"
          strokeWidth={1}
          listening={false}
        />
      )}

      <Rect
        {...runRect}
        fill="rgba(0, 0, 0, 0.001)"
        onClick={selectRun}
      />

      {drawnPieces.map((piece) => (
        <PieceRect
          key={piece.id}
          piece={piece}
          transform={transform}
          warning={warningPieceIds.has(piece.id)}
          error={hasErrors}
          selected={selectedPieceId === piece.id}
          cornerFiller={piece.role === 'end-left'
            ? cornerFillers.left
            : piece.role === 'end-right' && cornerFillers.right}
          onSelect={() => onSelectPiece(run.id, piece.id)}
        />
      ))}

      {[...faceLayouts].map(([pieceId, layout]) => (
        <FaceOutlines
          key={`faces:${pieceId}`}
          faces={layout.faces}
          transform={transform}
          selectable={!preview && selectedPieceId === pieceId}
          showSizes={!preview && selectedPieceId === pieceId}
          selectedPath={selectedPieceId === pieceId ? selectedFacePath : null}
          onSelectFace={onSelectFace}
        />
      ))}

      {result.pieces.flatMap((piece) => {
        const item = piece.role === 'item'
          ? run.items.find((candidate) => candidate.id === piece.id)
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
        return (
          <Group key={`centerline:${marker.pieceId}`} listening={false}>
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
              text={`℄ ${formatInches(marker.value)}`}
              fontSize={11}
              fill="#facc15"
            />
          </Group>
        );
      })}

      {renderAnchor('left')}
      {renderAnchor('right')}

      {selectedRun && (
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
