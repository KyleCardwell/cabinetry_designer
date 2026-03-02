import { useDispatch, useSelector } from 'react-redux';
import { setTool, toggleSnap } from '../store/slices/canvasSlice';

const tools = [
  { id: 'select', label: 'Select', shortcut: 'V' },
  { id: 'wall', label: 'Wall', shortcut: 'W' },
  { id: 'measure', label: 'Measure', shortcut: 'M' },
];

export default function CanvasToolbar() {
  const dispatch = useDispatch();
  const { tool: activeTool, snapEnabled } = useSelector((state) => state.canvas);

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 border-b border-gray-700 shrink-0">
      {tools.map((t) => (
        <button
          key={t.id}
          onClick={() => dispatch(setTool(t.id))}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            activeTool === t.id
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
          title={`${t.label} (${t.shortcut})`}
        >
          {t.label}
        </button>
      ))}

      <div className="w-px h-5 bg-gray-600 mx-2" />

      <button
        onClick={() => dispatch(toggleSnap())}
        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
          snapEnabled
            ? 'bg-green-700 text-green-100'
            : 'bg-gray-700 text-gray-400'
        }`}
      >
        Snap {snapEnabled ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}
