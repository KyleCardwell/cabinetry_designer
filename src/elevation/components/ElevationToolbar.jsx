import { useDispatch, useSelector } from 'react-redux';
import { selectSettings } from '../store/selectors.js';
import { resolveSetting } from '../model/settingsResolve.js';
import { overrideTitle } from './overrideHelpers.js';
import AddToolMenu from './AddToolMenu.jsx';
import CombinedElevationControl from './CombinedElevationControl.jsx';
import ReturnsViewControl from './ReturnsViewControl.jsx';
import { nextWallId, wallLabel } from '../model/topology.js';
import {
  centerRoomOnOrigin,
  setActiveWall,
  setActiveWallSide,
  setTool,
  setView,
  setPref,
  setRoomSetting,
  setDoorsOff,
} from '../store/elevationSlice.js';

export default function ElevationToolbar({
  onZoomToFit,
  onZoomIn,
  onZoomOut,
  zoom = 1,
  readOnly = false,
}) {
  const dispatch = useDispatch();
  const {
    tool,
    view,
    doorsOff,
    rooms,
    activeRoomId,
    activeWallId,
    activeWallSide,
    settings: shopSettings,
  } = useSelector((state) => state.elevation);
  const settings = useSelector(selectSettings);
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  const orderedWallIds = (room?.wallOrder ?? []).filter((wallId) => (
    room.walls.some((wall) => wall.id === wallId)
  ));
  const activeWall = room?.walls.find((wall) => wall.id === activeWallId) ?? null;
  const wallNavigationDisabled = orderedWallIds.length < 2;
  const navigateWall = (direction) => {
    const wallId = nextWallId(room, activeWallId, direction);
    if (wallId) dispatch(setActiveWall(wallId));
  };
  const toolNames = readOnly ? ['select', 'measure']
    : view === 'plan' ? ['select', 'wall', 'measure'] : ['select', 'draw', 'measure'];
  const addTools = view === 'plan'
    ? [['door', 'Door'], ['window', 'Window']]
    : [['soffit', 'Soffit'], ['recess', 'Recess'], ['door', 'Door'], ['window', 'Window']];
  const soffitChoices = [['crown', 'Crown'], ['topMold', 'Top mold'], ['none', 'None']];
  const inheritedSoffit = resolveSetting('defaultSoffitMolding', [{ level: 'team', values: shopSettings }]);
  const soffitOverridden = room?.settingsOverrides?.defaultSoffitMolding != null;

  return (
    <div className="flex min-h-12 min-w-0 shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-gray-700 bg-gray-800 px-4 py-1.5">
      <div className="flex items-center gap-1" aria-label="Canvas tools">
        <div className="flex rounded bg-gray-950 p-0.5" aria-label="Canvas view">
          {['plan', 'elevation'].map((viewName) => (
            <button
              key={viewName}
              type="button"
              onClick={() => dispatch(setView(viewName))}
              className={`rounded px-2.5 py-1 text-xs capitalize transition-colors ${
                view === viewName ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {viewName}
            </button>
          ))}
        </div>
        <div className="mx-1 h-5 w-px bg-gray-700" />
        {toolNames.map((toolName) => (
          <button
            key={toolName}
            type="button"
            title={toolName === 'measure' ? 'Measure (D)' : undefined}
            onClick={() => dispatch(setTool(toolName))}
            className={`rounded px-3 py-1.5 text-sm capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              tool === toolName
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {toolName === 'draw'
              ? 'Draw run'
              : toolName === 'wall'
                ? 'Draw wall'
                : toolName === 'measure' ? 'Measure' : toolName}
          </button>
        ))}
        {!readOnly && (
          <AddToolMenu
            tools={addTools}
            tool={tool}
            disabledTools={view === 'elevation' && activeWallSide === 'back' ? ['door', 'window'] : []}
            disabledTitle="Add doors and windows from the front"
            onPick={(name) => dispatch(setTool(name))}
          />
        )}
        {!readOnly && view === 'elevation' && tool === 'soffit' && (
          <>
            <div
              className="flex rounded bg-gray-950 p-0.5"
              aria-label="Default soffit molding"
              title={overrideTitle({
                overridden: soffitOverridden,
                source: inheritedSoffit.source,
                inheritedText: soffitChoices.find(([value]) => value === inheritedSoffit.value)?.[1],
              })}
            >
              {soffitChoices.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={settings.defaultSoffitMolding === value}
                  onClick={() => dispatch(setRoomSetting({ roomId: activeRoomId, key: 'defaultSoffitMolding', value }))}
                  className={`rounded px-2.5 py-1 text-xs transition-colors ${
                    settings.defaultSoffitMolding === value
                      ? `bg-blue-600 text-white${soffitOverridden ? ' ring-1 ring-teal-500' : ''}`
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {soffitOverridden && (
              <button
                type="button"
                aria-label="Reset soffit molding"
                onClick={() => dispatch(setRoomSetting({ roomId: activeRoomId, key: 'defaultSoffitMolding', value: null }))}
                className="text-xs text-teal-400 hover:underline"
              >
                Reset
              </button>
            )}
          </>
        )}
        {view === 'plan' && (
          <button
            type="button"
            aria-pressed={settings.orthoWalls}
            onClick={() => dispatch(setPref({ key: 'orthoWalls', value: !settings.orthoWalls }))}
            className={`rounded px-3 py-1.5 text-sm transition-colors ${
              settings.orthoWalls
                ? 'bg-cyan-700 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Ortho
          </button>
        )}
        {view === 'plan' && (
          <button
            type="button"
            disabled={(room?.walls.length ?? 0) === 0}
            onClick={() => {
              dispatch(centerRoomOnOrigin({ roomId: activeRoomId }));
              onZoomToFit?.();
            }}
            className="rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Center room
          </button>
        )}
      </div>
      {view === 'elevation' && (
        <div className="flex items-center gap-1" aria-label="Elevation view">
          <CombinedElevationControl room={room} wallId={activeWallId} side={activeWallSide} readOnly={readOnly} />
          <ReturnsViewControl room={room} wallId={activeWallId} side={activeWallSide} readOnly={readOnly} />
          <button
            type="button"
            aria-pressed={settings.showPartNumbers}
            onClick={() => dispatch(setPref({ key: 'showPartNumbers', value: !settings.showPartNumbers }))}
            className={`rounded px-3 py-1.5 text-sm transition-colors ${
              settings.showPartNumbers
                ? 'bg-cyan-700 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Part #
          </button>
          <button
            type="button"
            aria-pressed={doorsOff}
            onClick={() => dispatch(setDoorsOff(!doorsOff))}
            className={`rounded px-3 py-1.5 text-sm transition-colors ${
              doorsOff
                ? 'bg-cyan-700 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Doors off
          </button>
        </div>
      )}
      <div className="ml-auto flex items-center gap-1" aria-label="Zoom">
        {view === 'elevation' && (
          <>
            {/* FX5: which wall and which face sit with the zoom, to its left (Kyle 2026-10-28). */}
            <div className="mr-2 flex items-center gap-1" aria-label="Which wall">
              <div className="flex items-center gap-1" aria-label="Wall navigation">
                <button
                  type="button"
                  aria-label="Previous wall"
                  disabled={wallNavigationDisabled}
                  onClick={() => navigateWall(-1)}
                  className="rounded bg-gray-700 px-2 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ‹
                </button>
                <span className="min-w-24 max-w-44 truncate text-center text-xs text-gray-300">
                  {activeWall
                    ? `${wallLabel(room, activeWall)} / ${orderedWallIds.length}${activeWallSide === 'back' ? ' · Back' : ''}`
                    : 'No wall'}
                </span>
                <button
                  type="button"
                  aria-label="Next wall"
                  disabled={wallNavigationDisabled}
                  onClick={() => navigateWall(1)}
                  className="rounded bg-gray-700 px-2 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ›
                </button>
              </div>
              <div className="flex rounded bg-gray-950 p-0.5" aria-label="Wall side">
                {['front', 'back'].map((side) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => dispatch(setActiveWallSide(side))}
                    className={`rounded px-2.5 py-1 text-xs capitalize transition-colors ${
                      activeWallSide === side ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {side === 'front' ? 'Front' : 'Back'}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              aria-label="Zoom out"
              onClick={onZoomOut}
              className="rounded bg-gray-700 px-2.5 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-600"
            >
              −
            </button>
            <span className="w-12 text-center text-xs tabular-nums text-gray-300">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={onZoomIn}
              className="rounded bg-gray-700 px-2.5 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-600"
            >
              +
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onZoomToFit}
          className="rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-600"
        >
          Zoom to fit
        </button>
      </div>
    </div>
  );
}
