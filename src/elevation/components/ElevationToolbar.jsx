import { useDispatch, useSelector } from 'react-redux';
import { setTool, setView, updateSettings } from '../store/elevationSlice.js';

export default function ElevationToolbar({
  onZoomToFit,
  onZoomIn,
  onZoomOut,
  zoom = 1,
}) {
  const dispatch = useDispatch();
  const {
    tool,
    message,
    view,
    settings,
  } = useSelector((state) => state.elevation);
  const toolNames = view === 'plan'
    ? ['select', 'wall', 'door', 'window']
    : ['select', 'draw', 'door', 'window'];

  return (
    <div className="flex min-h-12 shrink-0 items-center gap-2 border-b border-gray-700 bg-gray-800 px-4">
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
          onClick={() => dispatch(setTool(toolName))}
          className={`rounded px-3 py-1.5 text-sm capitalize transition-colors ${
            tool === toolName
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {toolName === 'draw' ? 'Draw run' : toolName === 'wall' ? 'Draw wall' : toolName}
        </button>
      ))}
      {view === 'plan' && (
        <button
          type="button"
          aria-pressed={settings.orthoWalls}
          onClick={() => dispatch(updateSettings({ orthoWalls: !settings.orthoWalls }))}
          className={`rounded px-3 py-1.5 text-sm transition-colors ${
            settings.orthoWalls
              ? 'bg-cyan-700 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Ortho
        </button>
      )}
      <div className="mx-1 h-5 w-px bg-gray-700" />
      {view === 'elevation' && (
        <div className="flex items-center gap-1">
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
        </div>
      )}
      <button
        type="button"
        onClick={onZoomToFit}
        className="rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-600"
      >
        Zoom to fit
      </button>
      <div className="ml-2 min-w-0 flex-1 text-sm text-amber-300" role="status">
        {message}
      </div>
    </div>
  );
}
