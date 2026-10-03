import { useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import ElevationCanvas from './components/ElevationCanvas.jsx';
import MessageToast from './components/MessageToast.jsx';
import ElevationToolbar from './components/ElevationToolbar.jsx';
import JsonToggle from './components/JsonToggle.jsx';
import PropertiesPanel from './components/PropertiesPanel.jsx';
import RoomHeightsPanel from './components/RoomHeightsPanel.jsx';
import RoomPartNumbersPanel from './components/RoomPartNumbersPanel.jsx';
import RoomStylePanel from './components/RoomStylePanel.jsx';
import RoomPicker from './components/RoomPicker.jsx';
import SampleRunsButton from './components/SampleRunsButton.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import WallList from './components/WallList.jsx';
import { resolveWall } from './model/room.js';
import PlanCanvas from './plan/PlanCanvas.jsx';

export default function ElevationLab() {
  const elevationCanvasRef = useRef(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [elevationZoom, setElevationZoom] = useState(1);
  const {
    rooms,
    activeRoomId,
    activeWallId,
    activeWallSide,
    settings,
    view,
  } = useSelector((state) => state.elevation);
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
          <RoomPartNumbersPanel />
          <RoomStylePanel />
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
