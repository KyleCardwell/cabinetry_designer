import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { cloudSync } from './store/cloudSync.js';
import { openLocalWorkspace } from './store/cloudThunks.js';
import { selectSettings } from './store/selectors.js';
import ElevationCanvas from './components/ElevationCanvas.jsx';
import MessageToast from './components/MessageToast.jsx';
import ElevationToolbar from './components/ElevationToolbar.jsx';
import MissingDoorDesignsNotice from './components/MissingDoorDesignsNotice.jsx';
import JsonToggle from './components/JsonToggle.jsx';
import PropertiesPanel from './components/PropertiesPanel.jsx';
import RoomHeightsPanel from './components/RoomHeightsPanel.jsx';
import RoomSettingsPanel from './components/RoomSettingsPanel.jsx';
import RoomPartNumbersPanel from './components/RoomPartNumbersPanel.jsx';
import RoomStylePanel from './components/RoomStylePanel.jsx';
import RoomDoorStylesPanel from './components/RoomDoorStylesPanel.jsx';
import RoomPicker from './components/RoomPicker.jsx';
import SampleRunsButton from './components/SampleRunsButton.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import WallList from './components/WallList.jsx';
import { resolveWall } from './model/room.js';
import PlanCanvas from './plan/PlanCanvas.jsx';

function ElevationLabEditor() {
  const elevationCanvasRef = useRef(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [elevationZoom, setElevationZoom] = useState(1);
  const {
    rooms,
    activeRoomId,
    activeWallId,
    activeWallSide,
    view,
  } = useSelector((state) => state.elevation);
  const settings = useSelector(selectSettings);
  const activeRoom = rooms.find((room) => room.id === activeRoomId) ?? null;
  const activeWall = useMemo(() => resolveWall(
    activeRoom,
    activeRoom?.walls.find((wall) => wall.id === activeWallId) ?? null,
    activeWallSide,
  ), [activeRoom, activeWallId, activeWallSide]);

  return (
    <div className="flex h-full min-h-0 bg-gray-900 text-gray-100">
      <aside className="w-80 shrink-0 overflow-y-auto border-r border-gray-700 bg-gray-800/60 p-4">
        <div className="mb-5">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-blue-400">Elevation Lab</p>
          <p className="mt-1 text-xs text-gray-500">Scratch walls and cabinet runs</p>
        </div>
        <div className="space-y-5">
          <RoomPicker />
          <RoomHeightsPanel />
          <RoomSettingsPanel />
          <RoomPartNumbersPanel />
          <RoomStylePanel />
          <RoomDoorStylesPanel />
          <WallList />
          <SampleRunsButton />
          <SettingsPanel />
          <JsonToggle />
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <ElevationToolbar
          onZoomToFit={() => setFitRequest((value) => value + 1)}
          onZoomIn={() => elevationCanvasRef.current?.zoomIn()}
          onZoomOut={() => elevationCanvasRef.current?.zoomOut()}
          zoom={elevationZoom}
        />
        <MissingDoorDesignsNotice />
        <div className="relative min-h-0 flex-1">
          <MessageToast />
          {view === 'plan' ? (
            <PlanCanvas fitRequest={fitRequest} />
          ) : (
            <ElevationCanvas
              ref={elevationCanvasRef}
              room={activeRoom}
              wall={activeWall}
              settings={settings}
              fitRequest={fitRequest}
              onZoomChange={setElevationZoom}
            />
          )}
        </div>
      </section>

      <PropertiesPanel />
    </div>
  );
}

/**
 * The Elevation Lab is the localStorage sandbox until the import (D7): coming here from the
 * shop data finishes its saves, then switches back to this browser's document (SPEC-DB4 g).
 */
export default function ElevationLab() {
  const dispatch = useDispatch();
  const source = useSelector((state) => state.elevation.source);

  useEffect(() => {
    if (source !== 'cloud') return undefined;
    let cancelled = false;
    cloudSync.flush().then(() => {
      if (!cancelled) dispatch(openLocalWorkspace());
    });
    return () => { cancelled = true; };
  }, [dispatch, source]);

  if (source === 'cloud') {
    return <div className="flex h-full items-center justify-center bg-gray-900 text-gray-400">Opening the sandbox…</div>;
  }
  return <ElevationLabEditor />;
}
