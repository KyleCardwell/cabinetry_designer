import { useDispatch, useSelector } from 'react-redux';
import { setTool } from '../store/elevationSlice.js';

export default function ElevationToolbar({ onZoomToFit }) {
  const dispatch = useDispatch();
  const { tool, message } = useSelector((state) => state.elevation);

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-gray-700 bg-gray-800 px-4">
      {['select', 'draw'].map((toolName) => (
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
          {toolName === 'draw' ? 'Draw run' : toolName}
        </button>
      ))}
      <div className="mx-1 h-5 w-px bg-gray-700" />
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
