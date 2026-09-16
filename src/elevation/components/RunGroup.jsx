import { memo, useMemo } from 'react';
import { Group, Rect } from 'react-konva';
import { CABINET_TYPE_IDS } from '../model/constants.js';
import { splitRun } from '../model/splitRun.js';
import { wallRectToScreen } from '../canvas/transform.js';
import DimensionLine from './DimensionLine.jsx';
import PieceRect from './PieceRect.jsx';

function RunGroup({ run, settings, transform }) {
  const result = useMemo(() => splitRun(run, settings), [run, settings]);
  const warningPieceIds = useMemo(
    () => new Set(result.warnings.map((entry) => entry.pieceId)),
    [result.warnings],
  );
  const hasErrors = result.errors.length > 0;
  const hasToeKick = run.cabinetTypeId === CABINET_TYPE_IDS.BASE
    || run.cabinetTypeId === CABINET_TYPE_IDS.TALL;
  const isBase = run.cabinetTypeId === CABINET_TYPE_IDS.BASE;
  const toeKickWidth = Math.max(0, run.width - 6);
  const toeKick = wallRectToScreen({
    x: run.x + Math.min(3, run.width / 2),
    z: 0,
    width: toeKickWidth,
    height: settings.toeKickHeight,
  }, transform);
  const countertop = wallRectToScreen({
    x: run.x - 1,
    z: run.z + run.height,
    width: run.width + 2,
    height: settings.countertopThickness,
  }, transform);

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

      {result.pieces.map((piece) => (
        <PieceRect
          key={piece.id}
          piece={piece}
          transform={transform}
          warning={warningPieceIds.has(piece.id)}
          error={hasErrors}
        />
      ))}

      <DimensionLine
        run={run}
        transform={transform}
        color={hasErrors ? '#ef4444' : '#94a3b8'}
        topOffset={isBase ? settings.countertopThickness + 4 : 4}
      />
    </Group>
  );
}

export default memo(RunGroup);
