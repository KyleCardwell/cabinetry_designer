import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setTool } from './store/elevationSlice.js';
import { selectSettings } from './store/selectors.js';
import ElevationCanvas from './components/ElevationCanvas.jsx';
import MessageToast from './components/MessageToast.jsx';
import ElevationToolbar from './components/ElevationToolbar.jsx';
import ExportDxfButton from './components/ExportDxfButton.jsx';
import ReportsButton from '../reports/ReportsButton.jsx';
import MissingDoorDesignsNotice from './components/MissingDoorDesignsNotice.jsx';
import MissingPullsNotice from './components/MissingPullsNotice.jsx';
import MissingSlidesNotice from './components/MissingSlidesNotice.jsx';
import MissingAccessoriesNotice from './components/MissingAccessoriesNotice.jsx';
import JsonToggle from './components/JsonToggle.jsx';
import PropertiesPanel from './components/PropertiesPanel.jsx';
import RoomHeightsPanel from './components/RoomHeightsPanel.jsx';
import RoomPartNumbersPanel from './components/RoomPartNumbersPanel.jsx';
import RoomStylePanel from './components/RoomStylePanel.jsx';
import RoomDoorStylesPanel from './components/RoomDoorStylesPanel.jsx';
import RoomPicker from './components/RoomPicker.jsx';
import SampleRunsButton from './components/SampleRunsButton.jsx';
import SettingsDrawer from './components/SettingsDrawer.jsx';
import usePanelState from './components/panel/usePanelState.js';
import WallList from './components/WallList.jsx';
import PanelSection from './components/panel/PanelSection.jsx';
import { resolveWall } from './model/room.js';
import PlanCanvas from './plan/PlanCanvas.jsx';

export default function DesignerEditor({ mode = 'lab', header = null, banners = null, readOnly = false }) {
  const dispatch = useDispatch();
  const roomMode = mode === 'room';
  const [settingsOpen, setSettingsOpen] = usePanelState('settingsDrawer', false);
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

  useEffect(() => {
    if (readOnly) dispatch(setTool('select'));
  }, [dispatch, readOnly]);

  const roomPanels = (
    <>
      <PanelSection id="left.walls" title="Walls">
        <WallList />
      </PanelSection>
      {activeRoom && <>
        <PanelSection
          id="left.heights"
          title="Room heights"
          badge={Object.values(activeRoom.profile ?? {}).filter((value) => value !== undefined).length}
        >
          <RoomHeightsPanel />
        </PanelSection>
        <PanelSection
          id="left.style"
          title="Style & door styles"
          defaultOpen={false}
          badge={Object.values(activeRoom.style ?? {}).filter((value) => value != null).length}
        >
          <div className="space-y-3">
            <RoomStylePanel />
            <RoomDoorStylesPanel />
          </div>
        </PanelSection>
        <PanelSection id="left.parts" title="Part numbers & report" defaultOpen={false}>
          <RoomPartNumbersPanel />
        </PanelSection>
      </>}
    </>
  );

  return (
    <div className="flex h-full min-h-0 bg-gray-900 text-gray-100">
      <aside className="w-80 shrink-0 flex flex-col overflow-y-auto border-r border-gray-700 bg-gray-800/60 p-4">
        <div className="mb-5">
          {roomMode ? header : (
            <>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-blue-400">Elevation Lab</p>
              <p className="mt-1 text-xs text-gray-500">Scratch walls and cabinet runs</p>
            </>
          )}
          <div className="mt-3 flex items-center gap-2" aria-label="Room outputs">
            <ExportDxfButton />
            <ReportsButton />
          </div>
        </div>
        <div className="space-y-5">
          {!roomMode && <RoomPicker />}
          {roomMode ? (
            <fieldset disabled={readOnly} className="contents">
              <div className="space-y-5">{roomPanels}</div>
            </fieldset>
          ) : roomPanels}
          {!roomMode && <SampleRunsButton />}
          <JsonToggle />
        </div>
        <button
          type="button"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
          className="mt-auto w-full border-t border-gray-700 pt-4 text-left text-sm font-semibold text-gray-300"
        >
          Settings
        </button>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <ElevationToolbar
          onZoomToFit={() => setFitRequest((value) => value + 1)}
          onZoomIn={() => elevationCanvasRef.current?.zoomIn()}
          onZoomOut={() => elevationCanvasRef.current?.zoomOut()}
          zoom={elevationZoom}
          readOnly={readOnly}
        />
        {roomMode && banners}
        <MissingDoorDesignsNotice />
        <MissingPullsNotice />
        <MissingSlidesNotice />
        <MissingAccessoriesNotice />
        <div className="relative min-h-0 flex-1">
          <SettingsDrawer shopStandards={!roomMode} readOnly={readOnly} />
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

      {roomMode ? (
        <fieldset disabled={readOnly} className="contents">
          <PropertiesPanel />
        </fieldset>
      ) : <PropertiesPanel />}
    </div>
  );
}
