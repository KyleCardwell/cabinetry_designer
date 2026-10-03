import { Layer, Text } from 'react-konva';
import { wallToScreen } from '../canvas/transform.js';
import { elevationLabel } from '../model/topology.js';
import DimensionRow from './DimensionRow.jsx';

export default function ElevationDimensions({
  dimensionChains,
  dimensionOffsets,
  tool,
  transform,
  wall,
  editPieceSegment,
  cursor,
  handleRunSegmentClick,
  startRunMove,
  updateRunMove,
  finishRunMove,
  selection,
  selectFeature,
  room,
}) {
  return (
    <>
      {dimensionChains && dimensionOffsets && (
        <Layer listening={tool === 'select'}>
          <DimensionRow
            segments={dimensionChains.clearances}
            orientation="horizontal"
            side="below"
            offsetPx={dimensionOffsets.clearances}
            transform={transform}
            edgeGapPx={dimensionOffsets.clear.below}
            wallEndMarks={[0, wall.length]}
            onPieceClick={tool === 'select' ? editPieceSegment : undefined}
            cursor={cursor}
          />
          <DimensionRow
            segments={dimensionChains.lower.inner}
            orientation="horizontal"
            side="below"
            offsetPx={dimensionOffsets.lower.inner}
            transform={transform}
            edgeGapPx={dimensionOffsets.clear.below}
            wallEndMarks={[0, wall.length]}
            cursor={cursor}
          />
          <DimensionRow
            segments={dimensionChains.lower.outer}
            orientation="horizontal"
            side="below"
            offsetPx={dimensionOffsets.lower.outer}
            transform={transform}
            edgeGapPx={dimensionOffsets.clear.below}
            onSegmentClick={handleRunSegmentClick}
            draggableRuns={tool === 'select'}
            onSegmentDragStart={startRunMove}
            onSegmentDragMove={updateRunMove}
            onSegmentDragEnd={finishRunMove}
            highlightRunId={selection.runId}
            activeRunId={selection.runId}
            wallEndMarks={[0, wall.length]}
            cursor={cursor}
          />
          <DimensionRow
            segments={dimensionChains.openings}
            orientation="horizontal"
            side="below"
            offsetPx={dimensionOffsets.openings}
            transform={transform}
            edgeGapPx={dimensionOffsets.clear.below}
            onFeatureClick={tool === 'select' ? selectFeature : undefined}
            wallEndMarks={[0, wall.length]}
            cursor={cursor}
          />
          {elevationLabel(room, wall) && (
            <Text
              x={wallToScreen({ x: wall.length / 2, z: 0 }, transform).x}
              y={wallToScreen({ x: wall.length / 2, z: 0 }, transform).y + dimensionOffsets.label}
              text={elevationLabel(room, wall)}
              fontSize={20}
              fill="#e2e8f0"
              align="center"
              offsetX={70}
              width={140}
              listening={false}
            />
          )}
          <DimensionRow
            segments={dimensionChains.upper.inner}
            orientation="horizontal"
            side="above"
            offsetPx={dimensionOffsets.upper.inner}
            transform={transform}
            edgeGapPx={dimensionOffsets.clear.above}
            wallEndMarks={[0, wall.length]}
            onPieceClick={tool === 'select' ? editPieceSegment : undefined}
            cursor={cursor}
          />
          <DimensionRow
            segments={dimensionChains.upper.outer}
            orientation="horizontal"
            side="above"
            offsetPx={dimensionOffsets.upper.outer}
            transform={transform}
            edgeGapPx={dimensionOffsets.clear.above}
            onSegmentClick={handleRunSegmentClick}
            draggableRuns={tool === 'select'}
            onSegmentDragStart={startRunMove}
            onSegmentDragMove={updateRunMove}
            onSegmentDragEnd={finishRunMove}
            highlightRunId={selection.runId}
            activeRunId={selection.runId}
            wallEndMarks={[0, wall.length]}
            cursor={cursor}
          />
          <DimensionRow
            segments={dimensionChains.vertical.left.inner}
            orientation="vertical"
            side="left"
            offsetPx={dimensionOffsets.vertical.left.inner}
            transform={transform}
            edgeGapPx={dimensionOffsets.clear.left}
            cursor={cursor}
          />
          <DimensionRow
            segments={dimensionChains.vertical.left.middle}
            orientation="vertical"
            side="left"
            offsetPx={dimensionOffsets.vertical.left.middle}
            transform={transform}
            edgeGapPx={dimensionOffsets.clear.left}
            cursor={cursor}
          />
          <DimensionRow
            segments={dimensionChains.vertical.left.outer}
            orientation="vertical"
            side="left"
            offsetPx={dimensionOffsets.vertical.left.outer}
            transform={transform}
            edgeGapPx={dimensionOffsets.clear.left}
            cursor={cursor}
          />
          <DimensionRow
            segments={dimensionChains.vertical.right.inner}
            orientation="vertical"
            side="right"
            offsetPx={dimensionOffsets.vertical.right.inner}
            transform={transform}
            edgeGapPx={dimensionOffsets.clear.right}
            wallLength={wall.length}
            cursor={cursor}
          />
          <DimensionRow
            segments={dimensionChains.vertical.right.middle}
            orientation="vertical"
            side="right"
            offsetPx={dimensionOffsets.vertical.right.middle}
            transform={transform}
            edgeGapPx={dimensionOffsets.clear.right}
            wallLength={wall.length}
            cursor={cursor}
          />
          <DimensionRow
            segments={dimensionChains.vertical.right.outer}
            orientation="vertical"
            side="right"
            offsetPx={dimensionOffsets.vertical.right.outer}
            transform={transform}
            edgeGapPx={dimensionOffsets.clear.right}
            wallLength={wall.length}
            cursor={cursor}
          />
        </Layer>
      )}
    </>
  );
}
