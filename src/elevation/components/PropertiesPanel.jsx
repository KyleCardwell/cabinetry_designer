import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  cellPieces,
  pinTargetsForRun,
  soffitsOn,
  splitRun,
} from '../model/index.js';
import {
  endCornerAnglesForRun,
  endMinWidthsForRun,
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
import PieceProperties from './properties/PieceProperties.jsx';
import RunProperties from './properties/RunProperties.jsx';
import SoffitProperties from './properties/SoffitProperties.jsx';
import WallHeightProperties from './properties/WallHeightProperties.jsx';

export default function PropertiesPanel() {
  const dispatch = useDispatch();
  const messageTimer = useRef(null);
  const {
    rooms,
    activeRoomId,
    activeWallId,
    activeWallSide,
    selection,
    settings,
    view,
    message,
  } = useSelector(
    (state) => state.elevation,
  );
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
  const run = wall?.runs.find((candidate) => candidate.id === selection.runId) ?? null;
  const layout = useMemo(
    () => (run ? splitRun(run, settings, {
      endMinWidths: endMinWidthsForRun(room, wall, run, settings),
      endCornerAngles: endCornerAnglesForRun(room, wall, run),
      pinTargets: pinTargetsForRun(run, wall, wall.length, settings),
    }) : null),
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
  const selectionContext = useMemo(
    () => (run && cells
      ? resolveSelectedPiece(run, cells, selection.pieceId)
      : null),
    [run, cells, selection.pieceId],
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

  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-l border-gray-700 bg-gray-800/50 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
        Properties
      </h2>

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
        ) : soffit ? (
          <SoffitProperties
            room={room}
            wall={wall}
            soffit={soffit}
            settings={settings}
          />
        ) : !run || !displayLayout ? (
          <WallHeightProperties room={room} wall={wall} plan={view === 'plan'} />
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
          />
        )}
      </div>
    </aside>
  );
}
