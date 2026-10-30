import { Layer } from 'react-konva';
import { openingGeometry } from '../model/openings.js';
import JointMarkers from './JointMarkers.jsx';
import LayoutLines from './LayoutLines.jsx';
import OpeningShape from './OpeningShape.jsx';
import RunGroup from './RunGroup.jsx';
import SoffitShapes from './SoffitShapes.jsx';
import RecessShapes from './RecessShapes.jsx';
import WallEndPanelShapes from './WallEndPanelShapes.jsx';

export default function WallContentLayer({
  wall,
  transform,
  selection,
  tool,
  pick,
  settings,
  selectOpening,
  selectLine,
  moveSelectedOpening,
  cursor,
  room,
  soffitJoins,
  activeKey,
  diagnostics,
  facePath,
  pickFace,
  doorsOff,
  showThrough,
  interiors,
  drawerBoxes,
  adjustableShelves,
  rollouts,
  accessories,
  interiorPath,
  interiorDivider,
  pickInterior,
  setDividerEdit,
  moveDivider,
  editTrack,
  startStretch,
  updateStretch,
  finishStretch,
  startJointDrag,
  previewJointDrag,
  finishJointDrag,
  unjoinRunSide,
  hoveredGlyphId,
  setHoveredGlyphId,
}) {
  return (
          <Layer>
            <RecessShapes
              wall={wall}
              transform={transform}
              selectedRecessId={selection.recessId}
              onSelect={tool === 'select' ? pick : undefined}
            />
            {(wall.openings ?? []).map((opening) => (
              <OpeningShape
                key={opening.id}
                opening={opening}
                geometry={openingGeometry(opening, wall.length, settings)}
                settings={settings}
                transform={transform}
                selected={selection.openingId === opening.id}
                selectable={tool === 'select' && wall.side !== 'back'}
                onSelect={selectOpening}
                onPick={pick}
                onMove={(x) => moveSelectedOpening(opening.id, x)}
                locked={Boolean(opening.attach)}
                cursor={cursor}
              />
            ))}
            <SoffitShapes
              room={room}
              wall={wall}
              settings={settings}
              transform={transform}
              selectedSoffitId={selection.soffitId}
              onSelect={tool === 'select' ? pick : undefined}
              combinedJoins={soffitJoins.filter((join) => join.key === activeKey)}
            />
            {wall.runs.map((run) => (
              <RunGroup
                key={run.id}
                run={run}
                room={room}
                wall={wall}
                settings={settings}
                diagnostic={diagnostics[run.id]}
                transform={transform}
                selectedRun={selection.runId === run.id}
                selectedPieceId={
                  selection.runId === run.id ? selection.pieceId : null
                }
                onSelectRun={pick}
                onSelectPiece={pick}
                selectedFacePath={selection.runId === run.id ? facePath : null}
                onSelectFace={pickFace}
                doorsOff={doorsOff}
                showThrough={showThrough.filter((entry) => entry.runId === run.id)}
                interiors={interiors.filter((entry) => entry.runId === run.id)}
                drawerBoxes={drawerBoxes.filter((entry) => entry.runId === run.id)}
                adjustableShelves={adjustableShelves}
                rollouts={rollouts}
                accessories={accessories}
                interiorPath={interiorPath}
                interiorDivider={interiorDivider}
                onSelectInterior={pickInterior}
                onEditDivider={setDividerEdit}
                onMoveDivider={moveDivider}
                onEditTrack={editTrack}
                stretchable={tool === 'select'}
                onStretchStart={startStretch}
                onStretchMove={updateStretch}
                onStretchEnd={finishStretch}
                cursor={cursor}
              />
            ))}
            <WallEndPanelShapes
              room={room}
              wall={wall}
              settings={settings}
              transform={transform}
              selectedEndpoint={selection.endPanel ?? null}
              onSelect={tool === 'select' ? pick : undefined}
              cursor={cursor}
            />
            <LayoutLines
              wall={wall}
              transform={transform}
              selectedLineId={selection.lineId ?? null}
              onSelect={tool === 'select' ? selectLine : undefined}
              cursor={cursor}
            />
            {tool === 'select' && (
              <JointMarkers
                wall={wall}
                transform={transform}
                selectedRunId={selection.runId}
                onJointDragStart={startJointDrag}
                onJointDragMove={previewJointDrag}
                onJointDragEnd={finishJointDrag}
                onUnjoin={unjoinRunSide}
                hoveredGlyphId={hoveredGlyphId}
                setHoveredGlyphId={setHoveredGlyphId}
                cursor={cursor}
              />
            )}
          </Layer>
  );
}
