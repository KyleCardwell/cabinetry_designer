import { useMemo } from 'react';
import { Group, Line } from 'react-konva';
import { CABINET_TYPE_IDS, KIND_COLORS } from '../model/constants.js';
import { elevationToPlan } from '../model/geometry.js';
import { planDepthPositions } from '../model/planDepthPositions.js';
import { wallEndPanelPolygon, wallEndPanelReturnPolygons, wallEndPanels } from '../model/wallEndPanels.js';
import { wallSideFrame } from '../model/wallSides.js';
import PlanClearances from './PlanClearances.jsx';
import PlanOpening from './PlanOpening.jsx';
import PlanRecess, { PlanRecessDepth } from './PlanRecess.jsx';
import PlanWallShape, { PlanWallDimensions } from './PlanWallShape.jsx';
import PlanRunFootprint, { PlanRunDepth } from './PlanRunFootprint.jsx';
import PlanTops from './PlanTops.jsx';
import PlanTopOverhangs from './PlanTopOverhangs.jsx';
import { PLAN_DIM_FONT_SIZE } from './constants.js';
import { planDepthLabels } from './depthDimension.js';

export default function PlanScene({
  walls,
  room,
  selectedWall,
  scale,
  text,
  handleWallSelect,
  handleWallOpen,
  beginLandingSpan,
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
  handleRunContextMenu,
  clearances,
}) {
  const factor = text?.label ?? 1;
  const { depthPositions, depthLabels } = useMemo(() => {
    const gap = 28 * factor / scale;
    const depthPositions = planDepthPositions(room, settings, { laneShift: gap, gap, margin: 6 / scale });
    const depthLabels = planDepthLabels(room, settings, depthPositions, {
      scale, fontSize: PLAN_DIM_FONT_SIZE * factor, gap,
    });
    return { depthPositions, depthLabels };
  }, [room, settings, scale, factor]);
  const firstUpper = orderedFootprints.findIndex(({ run }) => (
    run.cabinetTypeId === CABINET_TYPE_IDS.UPPER
  ));
  // Insert tops before the first upper without disturbing the height order of later runs.
  // With no uppers, keep tops above wall end panels as before.
  const split = firstUpper < 0 ? orderedFootprints.length : firstUpper;
  const footprints = orderedFootprints.map(({ frame, wall, run }) => (
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
      text={text}
      onSelect={handleRunSelect}
      onContextMenu={handleRunContextMenu}
      cursor={cursor}
    />
  ));
  const tops = <PlanTops room={room} settings={settings} scale={scale} />;

  return (
    <>
      {walls.map((wall) => (
        <PlanWallShape
          key={wall.id}
          room={room}
          wall={wall}
          isSelected={wall.id === selectedWall?.id}
          scale={scale}
          text={text}
          onSelect={(event) => handleWallSelect(wall.id, event)}
          onOpen={(event) => handleWallOpen(wall.id, event)}
          onLandingSpan={beginLandingSpan}
          cursor={cursor}
          settings={settings}
        />
      ))}
      {walls.flatMap((wall) => (wall.recesses ?? []).map((recess) => (
        <PlanRecess
          key={`${wall.id}:${recess.id}`}
          room={room}
          wall={wall}
          frame={wallSideFrame(room, wall, recess.wallSide)}
          recess={recess}
          settings={settings}
          scale={scale}
          text={text}
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
          text={text}
          onSelect={handleOpeningSelect}
          onMove={(x) => handleOpeningMove(wall.id, opening.id, x)}
          cursor={cursor}
        />
      ))}
      {footprints.slice(0, split)}
      {firstUpper >= 0 && tops}
      {footprints.slice(split)}
      {walls.flatMap((wall) => wallEndPanels(room, wall, settings).flatMap((panel) => [
        { key: `${wall.id}:${panel.endpoint}`, points: wallEndPanelPolygon(room, wall, panel) },
        // A fitted panel's returns (SH7.6 step f) make the L / C in plan.
        ...wallEndPanelReturnPolygons(room, wall, panel).map(({ edge, points }) => ({
          key: `${wall.id}:${panel.endpoint}:return-${edge}`, points })),
      ]).map(({ key, points }) => (
        <Line
          key={key}
          points={points.flatMap((point) => [point.x, point.y])}
          closed
          fill={KIND_COLORS.end_panel}
          opacity={0.7}
          listening={false}
        />
      )))}
      {firstUpper < 0 && tops}
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
      <Group listening={false}>
        {walls.map((wall) => (
          <PlanWallDimensions
            key={`${wall.id}:dim`}
            room={room}
            wall={wall}
            settings={settings}
            scale={scale}
            text={text}
          />
        ))}
        {walls.flatMap((wall) => (wall.recesses ?? []).map((recess) => (
          <PlanRecessDepth
            key={`${wall.id}:${recess.id}:dim`}
            room={room}
            wall={wall}
            frame={wallSideFrame(room, wall, recess.wallSide)}
            recess={recess}
            scale={scale}
            text={text}
          />
        )))}
        {orderedFootprints.map(({ frame, wall, run }) => (
          <PlanRunDepth
            key={`${run.id}:dim`}
            frame={frame}
            room={room}
            wall={wall}
            run={run}
            position={depthPositions.get(run.id)}
            depthLabels={depthLabels}
            settings={settings}
            scale={scale}
            text={text}
          />
        ))}
        <PlanTopOverhangs room={room} settings={settings} scale={scale} text={text} />
        <PlanClearances dimensions={clearances} scale={scale} text={text} />
      </Group>
    </>
  );
}
