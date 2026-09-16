import { useDispatch, useSelector } from 'react-redux';
import { CABINET_TYPE_IDS } from './model/constants.js';
import { formatInches } from './model/units.js';
import { setTool } from './store/elevationSlice.js';
import JsonToggle from './components/JsonToggle.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import WallList from './components/WallList.jsx';

const TYPE_LABELS = {
  [CABINET_TYPE_IDS.BASE]: 'Base',
  [CABINET_TYPE_IDS.UPPER]: 'Upper',
  [CABINET_TYPE_IDS.TALL]: 'Tall',
};

export default function ElevationLab() {
  const dispatch = useDispatch();
  const { walls, activeWallId, tool, message } = useSelector((state) => state.elevation);
  const activeWall = walls.find((wall) => wall.id === activeWallId) ?? null;

  return (
    <div className="flex h-full min-h-0 bg-gray-900 text-gray-100">
      <aside className="w-80 shrink-0 overflow-y-auto border-r border-gray-700 bg-gray-800/60 p-4">
        <div className="mb-5">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-blue-400">Elevation Lab</p>
          <p className="mt-1 text-xs text-gray-500">Scratch walls and cabinet runs</p>
        </div>
        <div className="space-y-5">
          <WallList />
          <SettingsPanel />
          <JsonToggle />
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
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
          {message && <span className="ml-2 text-sm text-amber-300">{message}</span>}
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto flex min-h-full max-w-4xl items-center justify-center rounded-xl border border-dashed border-gray-700 bg-gray-800/30 p-8">
            <div className="w-full max-w-xl text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-gray-700 bg-gray-800 text-xl text-gray-500">
                ▦
              </div>
              <h2 className="text-lg font-semibold">Canvas comes in step 3</h2>
              {activeWall ? (
                <>
                  <p className="mt-2 text-sm text-gray-400">
                    {activeWall.name} · {formatInches(activeWall.length)} × {formatInches(activeWall.height)}
                  </p>
                  <div className="mt-6 text-left">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Runs ({activeWall.runs.length})
                    </h3>
                    {activeWall.runs.length > 0 ? (
                      <ul className="space-y-2">
                        {activeWall.runs.map((run) => (
                          <li key={run.id} className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300">
                            {TYPE_LABELS[run.cabinetTypeId]} run · x {formatInches(run.x)} · width {formatInches(run.width)} · {run.items.length} items
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-4 text-sm text-gray-500">
                        No runs on this wall yet.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-gray-500">Add a wall to begin.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <aside className="w-72 shrink-0 border-l border-gray-700 bg-gray-800/50 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">Properties</h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-500">
          Select a run or piece to edit its properties. Controls arrive in step 4.
        </p>
      </aside>
    </div>
  );
}
