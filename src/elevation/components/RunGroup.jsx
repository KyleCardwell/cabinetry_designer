import { memo, useMemo } from 'react';
import { Group, Rect } from 'react-konva';
import { CABINET_TYPE_IDS } from '../model/constants.js';
import { splitRun } from '../model/splitRun.js';
import { resolveProfile } from '../model/profile.js';
import { endMinWidthsForRun } from '../model/room.js';
import { wallRectToScreen } from '../canvas/transform.js';
import DimensionLine from './DimensionLine.jsx';
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
}) {
  const result = useMemo(() => splitRun(run, settings, {
    endMinWidths: endMinWidthsForRun(room, wall, run, settings),
  }), [room, run, settings, wall]);
  const profile = useMemo(
    () => resolveProfile(settings, room, wall),
    [room, settings, wall],
  );
  const toeKickHeight = run.overrides?.toeKickHeight ?? profile.toeKickHeight;
  const countertopThickness = run.overrides?.countertopThickness
    ?? profile.countertopThickness;
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

  const selectRun = (event) => {
    event.cancelBubble = true;
    onSelectRun(run.id);
  };

  return (
    <Group>
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

      <Rect
        {...runRect}
        fill="rgba(0, 0, 0, 0.001)"
        onClick={selectRun}
      />

      {result.pieces.map((piece) => (
        <PieceRect
          key={piece.id}
          piece={piece}
          transform={transform}
          warning={warningPieceIds.has(piece.id)}
          error={hasErrors}
          selected={selectedPieceId === piece.id}
          onSelect={() => onSelectPiece(run.id, piece.id)}
        />
      ))}

      {selectedRun && (
        <Rect
          {...runRect}
          fillEnabled={false}
          stroke="#38bdf8"
          strokeWidth={2.5}
          listening={false}
        />
      )}

      <DimensionLine
        run={run}
        transform={transform}
        color={hasErrors ? '#ef4444' : selectedRun ? '#38bdf8' : '#94a3b8'}
        topOffset={isBase ? countertopThickness + 4 : 4}
        onSelect={() => onSelectRun(run.id)}
      />
    </Group>
  );
}

export default memo(RunGroup);
