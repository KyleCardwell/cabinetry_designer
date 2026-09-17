import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import ElevationCanvas from './components/ElevationCanvas.jsx';
import ElevationToolbar from './components/ElevationToolbar.jsx';
import JsonToggle from './components/JsonToggle.jsx';
import PropertiesPanel from './components/PropertiesPanel.jsx';
import RoomHeightsPanel from './components/RoomHeightsPanel.jsx';
import RoomPicker from './components/RoomPicker.jsx';
import SampleRunsButton from './components/SampleRunsButton.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import WallList from './components/WallList.jsx';
import { resolveWall } from './model/room.js';
import PlanCanvas from './plan/PlanCanvas.jsx';

export default function ElevationLab() {
  const [fitRequest, setFitRequest] = useState(0);
  const {
    rooms,
    activeRoomId,
    activeWallId,
    settings,
    view,
  } = useSelector((state) => state.elevation);
  const activeRoom = rooms.find((room) => room.id === activeRoomId) ?? null;
  const activeWall = useMemo(() => resolveWall(
    activeRoom,
    activeRoom?.walls.find((wall) => wall.id === activeWallId) ?? null,
  ), [activeRoom, activeWallId]);

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
          <WallList />
          <SampleRunsButton />
          <SettingsPanel />
          <JsonToggle />
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <ElevationToolbar onZoomToFit={() => setFitRequest((value) => value + 1)} />
        <div className="min-h-0 flex-1">
          {view === 'plan' ? (
            <PlanCanvas fitRequest={fitRequest} />
          ) : (
            <ElevationCanvas
              room={activeRoom}
              wall={activeWall}
              settings={settings}
              fitRequest={fitRequest}
            />
          )}
        </div>
      </section>

      <PropertiesPanel />
    </div>
  );
}
