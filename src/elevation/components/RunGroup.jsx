import { memo, useMemo, useState } from 'react';
import {
  Group,
  Label,
  Line,
  Rect,
  Tag,
  Text,
} from 'react-konva';
import { blindEntries } from '../model/blind.js';
import { runBottomParts } from '../model/bottoms.js';
import {
  blindCellWidths, cellPieces, panelOrientation, shelfParts,
} from '../model/cells.js';
import { CABINET_TYPE_IDS, KIND_COLORS } from '../model/constants.js';
import { cornerAt } from '../model/corners.js';
import { runFaceLayouts } from '../model/faceLayouts.js';
import { runItems } from '../model/grid.js';
import { isFollowAnchor, isJointAnchor } from '../model/joints.js';
import { panelDrop, resolveStyle } from '../model/styles.js';
import { centerlineMarkers } from '../model/dimensions.js';
import { splitRun } from '../model/splitRun.js';
import { resolveProfile } from '../model/profile.js';
import { runTop } from '../model/tops.js';
import {
  endCornerAnglesForRun,
  endMinWidthsForRun,
  pinTargetsForRun,
} from '../model/room.js';
import { formatInches } from '../model/units.js';
import { CURSORS, useCursorKeys } from '../canvas/cursor.js';
import { wallRectToScreen } from '../canvas/transform.js';
import CellChains from './CellChains.jsx';
import FaceOutlines from './FaceOutlines.jsx';
import PieceRect from './PieceRect.jsx';

const PANEL_LABELS = { side: 'Side', top: 'Top', back: 'Back' };

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
  const result = useMemo(() => splitRun(run, settings, {
    endMinWidths: endMinWidthsForRun(room, wall, run, settings),
    endCornerAngles: endCornerAnglesForRun(room, wall, run),
    pinTargets: pinTargetsForRun(run, wall, wall.length, settings),
  }), [room, run, settings, wall]);
  const cells = useMemo(() => cellPieces(run, result), [result, run]);
  const faceLayouts = useMemo(
    () => runFaceLayouts(room, wall, run, settings, result),
    [result, room, run, settings, wall],
  );
  const blind = useMemo(
    () => blindEntries(room, wall, run, settings, result),
    [result, room, run, settings, wall],
  );
  const subLabels = useMemo(() => {
    const labels = new Map();
    for (const piece of cells.pieces) {
      if (piece.kind === 'void') labels.set(piece.id, 'Open');
      if (piece.kind === 'panel') labels.set(piece.id, `${PANEL_LABELS[panelOrientation(piece)]} panel`);
      if (piece.kind === 'shelves') {
        labels.set(piece.id, `${piece.shelves.count} shelves${piece.shelves.back ? ' + back' : ''}`);
      }
    }
    for (const entry of blind.entries) {
      labels.set(entry.pieceId, `Blind ${formatInches(entry.boxWidth)}`);
      for (const [id, width] of blindCellWidths(cells.pieces, result.pieces, [entry])) {
        labels.set(id, `Blind ${formatInches(width)}`);
      }
      if (entry.panel && entry.endPieceId) {
        labels.set(entry.endPieceId, `Panel ${formatInches(entry.panel.width)}`);
      }
    }
    return labels;
  }, [blind, cells, result]);
  const panels = useMemo(
    () => blind.entries.filter((entry) => entry.panel).map((entry) => ({
      key: `panel:${entry.side}`,
      x: entry.panel.x,
      width: entry.panel.width,
    })),
    [blind],
  );
  const panelPieceIds = useMemo(
    () => new Set(blind.entries
      .filter((entry) => entry.panel && entry.endPieceId)
      .map((entry) => entry.endPieceId)),
    [blind],
  );
  const panelBySide = useMemo(() => {
    const sides = { left: null, right: null };
    for (const entry of blind.entries) {
      if (entry.panel) sides[entry.side] = entry.panel;
    }
    return sides;
  }, [blind]);
  const runEnd = run.x + run.width;
  const panelStart = panelBySide.left
    ? Math.min(panelBySide.left.x, run.x)
    : null;
  const panelEnd = panelBySide.right
    ? Math.max(panelBySide.right.x + panelBySide.right.width, runEnd)
    : null;
  // A band (toe kick, countertop, molding) runs to the wall wherever a blind
  // panel does, and keeps its own inset or overhang wherever one does not.
  const bandStart = (inset) => panelStart ?? run.x + inset;
  const bandEnd = (inset) => panelEnd ?? runEnd - inset;
  const drop = panelDrop(run, resolveStyle(settings, room, run), settings);
  const shelves = useMemo(
    () => cells.pieces.flatMap((piece) => shelfParts(piece, settings)),
    [cells, settings],
  );
  const drawnPieces = useMemo(() => cells.pieces.map((piece) => {
    const dropped = drop > 0
      && (piece.kind === 'filler' || piece.kind === 'end_panel')
      ? { ...piece, z: piece.z - drop, height: piece.height + drop }
      : piece;
    return panelPieceIds.has(piece.id)
      ? { ...dropped, kind: 'end_panel' }
      : dropped;
  }), [cells, drop, panelPieceIds]);
  const profile = useMemo(
    () => resolveProfile(settings, room, wall),
    [room, settings, wall],
  );
  const toeKickHeight = run.overrides?.toeKickHeight ?? profile.toeKickHeight;
  const top = runTop(wall, run, profile);
  const boxTop = run.z + run.height;
  const bandX = bandStart(0);
  const bandWidth = bandEnd(0) - bandX;
  const topMold = wallRectToScreen({
    x: bandX,
    z: boxTop,
    width: bandWidth,
    height: profile.topMoldHeight,
  }, transform);
  const crown = wallRectToScreen({
    x: bandX,
    z: boxTop + profile.crownStackHeight - profile.crownHeight,
    width: bandWidth,
    height: profile.crownHeight,
  }, transform);
  const bottomParts = runBottomParts(run).map((part) => ({
    ...part,
    rect: wallRectToScreen({ x: bandX, z: part.z, width: bandWidth, height: part.height }, transform),
  }));
  const warningPieceIds = useMemo(
    () => new Set(
      [...result.warnings, ...cells.warnings, ...(diagnostic?.warnings ?? [])]
        .map((entry) => entry.pieceId),
    ),
    [cells.warnings, diagnostic?.warnings, result.warnings],
  );
  const hasErrors = (diagnostic?.errors ?? result.errors).length > 0;
  const hasToeKick = run.cabinetTypeId === CABINET_TYPE_IDS.BASE
    || run.cabinetTypeId === CABINET_TYPE_IDS.TALL;
  const toeKickInset = Math.min(3, run.width / 2);
  const toeKickX = bandStart(toeKickInset);
  const toeKickWidth = Math.max(0, bandEnd(toeKickInset) - toeKickX);
  const toeKick = wallRectToScreen({
    x: toeKickX,
    z: 0,
    width: toeKickWidth,
    height: toeKickHeight,
  }, transform);
  const countertopX = bandStart(-1);
  const countertop = wallRectToScreen({
    x: countertopX,
    z: run.z + run.height,
    width: bandEnd(-1) - countertopX,
    height: top.height,
  }, transform);
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
      {hasToeKick && toeKickWidth > 0 && (
        <Rect
          {...toeKick}
          fill="#111827"
          stroke="#334155"
          strokeWidth={1}
          listening={false}
        />
      )}

      {(top.kind === 'stone' || top.kind === 'wood') && (
        <Rect
          {...countertop}
          fill={top.kind === 'wood' ? '#c8a27a' : '#cbd5e1'}
          opacity={0.9}
          stroke="#64748b"
          strokeWidth={1}
          listening={false}
        />
      )}

      {(top.kind === 'crown' || top.kind === 'topMold') && (
        <Rect
          {...topMold}
          fill="#94a3b8"
          opacity={0.9}
          stroke="#cbd5e1"
          strokeWidth={1}
          listening={false}
        />
      )}
      {top.kind === 'crown' && (
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
          fill="#94a3b8"
          opacity={0.9}
          stroke="#cbd5e1"
          strokeWidth={1}
          dash={part.kind === 'corbels' ? [4, 3] : undefined}
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

      {drawnPieces.map((piece) => (
        <PieceRect
          key={piece.id}
          piece={piece}
          transform={transform}
          warning={warningPieceIds.has(piece.id) || warningPieceIds.has(piece.columnId)}
          error={hasErrors}
          selected={selectedPieceId === piece.id}
          subLabel={subLabels.get(piece.id) ?? null}
          cornerFiller={!panelPieceIds.has(piece.id) && (piece.role === 'end-left'
            ? cornerFillers.left
            : piece.role === 'end-right' && cornerFillers.right)}
          onSelect={() => onSelectPiece(run.id, piece.id)}
          cursor={cursor}
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
