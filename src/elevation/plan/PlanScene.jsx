import { Line } from 'react-konva';
import { KIND_COLORS } from '../model/constants.js';
import { elevationToPlan } from '../model/geometry.js';
import { wallEndPanelPolygon, wallEndPanels } from '../model/wallEndPanels.js';
import { wallSideFrame } from '../model/wallSides.js';
import PlanClearances from './PlanClearances.jsx';
import PlanOpening from './PlanOpening.jsx';
import PlanRecess from './PlanRecess.jsx';
import PlanWallShape from './PlanWallShape.jsx';
import PlanRunFootprint from './PlanRunFootprint.jsx';

export default function PlanScene({
  walls,
  room,
  selectedWall,
  scale,
  handleWallSelect,
  handleWallOpen,
  cursor,
  settings,
  selection,
  orderedOpenings,
  tool,
  entry,
  handleOpeningSelect,
  handleOpeningMove,
  orderedFootprints,
  collisionMessages,
  handleRunSelect,
  clearances,
}) {
  return (
    <>
      {walls.map((wall) => (
        <PlanWallShape
          key={wall.id}
          room={room}
          wall={wall}
          isSelected={wall.id === selectedWall?.id}
          scale={scale}
          onSelect={(event) => handleWallSelect(wall.id, event)}
          onOpen={(event) => handleWallOpen(wall.id, event)}
          cursor={cursor}
          settings={settings}
        />
      ))}
      {walls.flatMap((wall) => (wall.recesses ?? []).map((recess) => (
        <PlanRecess
          key={`${wall.id}:${recess.id}`}
          wall={wall}
          frame={wallSideFrame(room, wall, recess.wallSide)}
          recess={recess}
          scale={scale}
          selected={selection.recessId === recess.id}
        />
      )))}
      {orderedOpenings.map(({ frame, wall, opening }) => (
        <PlanOpening
          key={opening.id}
          room={room}
          wall={wall}
          frame={frame}
          opening={opening}
          settings={settings}
          selected={selection.openingId === opening.id}
          selectable={tool === 'select' && !entry}
          scale={scale}
          onSelect={handleOpeningSelect}
          onMove={(x) => handleOpeningMove(wall.id, opening.id, x)}
          cursor={cursor}
        />
      ))}
      {orderedFootprints.map(({ frame, wall, run }) => (
        <PlanRunFootprint
          key={run.id}
          frame={frame}
          room={room}
          wall={wall}
          run={run}
          settings={settings}
          collision={collisionMessages.has(run.id)}
          collisionMessage={collisionMessages.get(run.id)}
          selected={selection.runId === run.id}
          selectable={tool === 'select' && !entry}
          scale={scale}
          onSelect={handleRunSelect}
          cursor={cursor}
        />
      ))}
      {walls.flatMap((wall) => wallEndPanels(room, wall, settings).map((panel) => (
        <Line
          key={`${wall.id}:${panel.endpoint}`}
          points={wallEndPanelPolygon(room, wall, panel)
            .flatMap((point) => [point.x, point.y])}
          closed
          fill={KIND_COLORS.end_panel}
          opacity={0.7}
          listening={false}
        />
      )))}
      <PlanClearances dimensions={clearances} scale={scale} />
      {walls.flatMap((wall) => (wall.soffits ?? []).map((soffit) => {
        const frame = wallSideFrame(room, wall, soffit.wallSide);
        return (
          <Line
            key={`${wall.id}:${soffit.id}`}
            points={[
              elevationToPlan(frame, soffit.x, 0),
              elevationToPlan(frame, soffit.x + soffit.width, 0),
              elevationToPlan(frame, soffit.x + soffit.width, soffit.depth),
              elevationToPlan(frame, soffit.x, soffit.depth),
            ].flatMap((point) => [point.x, point.y])}
            closed
            dash={[6 / scale, 4 / scale]}
            stroke="#94a3b8"
            strokeWidth={1 / scale}
            listening={false}
          />
        );
      }))}
    </>
  );
}
