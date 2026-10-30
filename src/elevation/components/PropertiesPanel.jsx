import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectSettings } from '../store/selectors.js';
import {
  cellPieces,
  centerOverTargets,
  recessesOn,
  soffitsOn,
  splitOptionsForRun,
  splitRun,
  teeFillers,
  wallEndPanels,
} from '../model/index.js';
import {
  resolveWall,
  roomDiagnostics,
} from '../model/room.js';
import { resolveSelectedPiece } from '../properties/helpers.js';
import {
  clearSelection,
  setMessage,
  setSelection,
} from '../store/elevationSlice.js';
import OpeningProperties from './properties/OpeningProperties.jsx';
import LineProperties from './properties/LineProperties.jsx';
import { linesOn } from '../model/layoutLines.js';
import RecessProperties from './properties/RecessProperties.jsx';
import PieceProperties from './properties/PieceProperties.jsx';
import RunProperties from './properties/RunProperties.jsx';
import SoffitProperties from './properties/SoffitProperties.jsx';
import WallEndPanelProperties from './properties/WallEndPanelProperties.jsx';
import PropertiesHeader from './PropertiesHeader.jsx';

export default function PropertiesPanel() {
  const dispatch = useDispatch();
  const messageTimer = useRef(null);
  const {
    rooms,
    activeRoomId,
    activeWallId,
    activeWallSide,
    selection,
    message,
  } = useSelector(
    (state) => state.elevation,
  );
  const settings = useSelector(selectSettings);
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  const storedWall = room?.walls.find(
    (candidate) => candidate.id === selection.wallId,
  ) ?? null;
  const wall = useMemo(() => resolveWall(room, storedWall, storedWall?.id === activeWallId ? activeWallSide : 'front'), [room, storedWall, activeWallId, activeWallSide]);
  const opening = wall?.openings.find(
    (candidate) => candidate.id === selection.openingId,
  ) ?? null;
  const soffit = wall
    ? soffitsOn(wall).find((candidate) => candidate.id === selection.soffitId) ?? null
    : null;
  const recess = wall
    ? recessesOn(wall).find((candidate) => candidate.id === selection.recessId) ?? null
    : null;
  const endPanel = wall && selection.endPanel
    ? wallEndPanels(room, wall, settings).find((candidate) => candidate.endpoint === selection.endPanel) ?? null
    : null;
  const line = wall && selection.lineId
    ? linesOn(wall).find((candidate) => candidate.id === selection.lineId) ?? null
    : null;
  const run = wall?.runs.find((candidate) => candidate.id === selection.runId) ?? null;
  const layout = useMemo(
    () => (run ? splitRun(run, settings, splitOptionsForRun(room, wall, run, settings)) : null),
    [room, run, settings, wall],
  );
  const canCenter = useMemo(
    () => Boolean(room && wall && run) && centerOverTargets(room, wall.id, run.id, settings).length > 0,
    [room, run, settings, wall],
  );
  const cells = useMemo(
    () => (run && layout ? cellPieces(run, layout) : null),
    [run, layout],
  );
  const diagnostics = useMemo(
    () => (room ? roomDiagnostics(room, settings) : {}),
    [room, settings],
  );
  const displayLayout = layout && diagnostics[run?.id]
    ? { ...layout, ...diagnostics[run.id] }
    : layout;
  const tees = useMemo(
    () => (run && cells ? teeFillers(room, run, cells, settings).tees : []),
    [room, run, cells, settings],
  );
  const selectionContext = useMemo(
    () => (run && cells
      ? resolveSelectedPiece(run, cells, selection.pieceId, tees)
      : null),
    [run, cells, selection.pieceId, tees],
  );

  const showMessage = useCallback((message) => {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    dispatch(setMessage(message));
    messageTimer.current = setTimeout(() => {
      dispatch(setMessage(null));
      messageTimer.current = null;
    }, 3000);
  }, [dispatch]);

  useEffect(() => () => {
    if (messageTimer.current) clearTimeout(messageTimer.current);
  }, []);

  useEffect(() => {
    if (!selection.runId) return;
    if (!run) {
      dispatch(clearSelection());
      return;
    }
    if (selection.pieceId && !selectionContext) {
      dispatch(setSelection({ runId: run.id, pieceId: null }));
    }
  }, [dispatch, run, selection.pieceId, selection.runId, selectionContext]);

  useEffect(() => {
    if (selection.openingId && !opening) dispatch(clearSelection());
  }, [dispatch, opening, selection.openingId]);

  useEffect(() => {
    if (selection.recessId && !recess) dispatch(clearSelection());
  }, [dispatch, recess, selection.recessId]);

  useEffect(() => {
    if (selection.lineId && !line) dispatch(clearSelection());
  }, [dispatch, line, selection.lineId]);

  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-l border-gray-700 bg-gray-800/50 p-4">
      <PropertiesHeader
        key={`${wall?.id}/${line?.id}/${opening?.id}/${soffit?.id}/${recess?.id}/${endPanel?.endpoint}/${run?.id}/${selectionContext?.piece.id}`}
        room={room}
        wall={wall}
        run={run}
        opening={opening}
        soffit={soffit}
        recess={recess}
        endPanel={endPanel}
        line={line}
        cells={cells}
        selectionContext={selectionContext}
        layout={displayLayout}
      />

      <div className="mt-4">
        {!wall ? (
          <p className="text-sm leading-relaxed text-gray-500">
            Select a wall, run or opening to edit it.
          </p>
        ) : opening ? (
          <OpeningProperties
            wall={wall}
            opening={opening}
            settings={settings}
            placementMessage={message}
          />
        ) : line ? (
          <LineProperties wall={wall} line={line} settings={settings} />
        ) : recess ? (
          <RecessProperties wall={wall} recess={recess} placementMessage={message} />
        ) : soffit ? (
          <SoffitProperties
            room={room}
            wall={wall}
            soffit={soffit}
            settings={settings}
          />
        ) : endPanel ? (
          <WallEndPanelProperties
            room={room}
            wall={wall}
            panel={endPanel}
            settings={settings}
          />
        ) : !run || !displayLayout ? (
          <p className="text-sm leading-relaxed text-gray-500">
            Wall settings are on the left. Select a run, cabinet or opening to edit it here.
          </p>
        ) : selectionContext ? (
          <PieceProperties
            room={room}
            wall={wall}
            run={run}
            layout={layout}
            cells={cells}
            selectionContext={selectionContext}
            settings={settings}
          />
        ) : (
          <RunProperties
            wall={wall}
            room={room}
            run={run}
            layout={displayLayout}
            settings={settings}
            showMessage={showMessage}
            canCenter={canCenter}
          />
        )}
      </div>
    </aside>
  );
}
