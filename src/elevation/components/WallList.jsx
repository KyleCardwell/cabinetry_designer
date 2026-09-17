import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  addWall,
  deleteWall,
  setActiveWall,
  updateWall,
} from '../store/elevationSlice.js';
import InchInput from './InchInput.jsx';
import { formatInches } from '../model/units.js';
import { wallLength } from '../model/geometry.js';

export default function WallList() {
  const dispatch = useDispatch();
  const { rooms, activeRoomId, activeWallId } = useSelector((state) => state.elevation);
  const room = rooms.find((candidate) => candidate.id === activeRoomId);
  const walls = room?.walls ?? [];
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const update = (wallId, changes) => dispatch(updateWall({ wallId, changes }));

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">Walls</h2>
        <button
          type="button"
          onClick={() => dispatch(addWall({ name: `Wall ${walls.length + 1}` }))}
          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium transition-colors"
        >
          Add wall
        </button>
      </div>

      <div className="space-y-2">
        {walls.map((wall) => {
          const active = wall.id === activeWallId;
          const confirming = wall.id === confirmDeleteId;
          return (
            <div
              key={wall.id}
              className={`rounded-lg border p-3 ${
                active ? 'border-blue-500 bg-blue-950/30' : 'border-gray-700 bg-gray-800/70'
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => dispatch(setActiveWall(wall.id))}
                  className={`h-3 w-3 shrink-0 rounded-full border ${
                    active ? 'border-blue-400 bg-blue-500' : 'border-gray-500'
                  }`}
                  aria-label={`Select ${wall.name}`}
                />
                <input
                  value={wall.name}
                  onChange={(event) => update(wall.id, { name: event.target.value })}
                  onFocus={() => dispatch(setActiveWall(wall.id))}
                  aria-label="Wall name"
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1"
                />
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(wall.id)}
                  className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                >
                  Delete
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-gray-400">
                  Length
                  <span className="mt-1 block rounded border border-gray-700 bg-gray-900/60 px-2.5 py-1.5 text-sm text-gray-300">
                    {formatInches(wallLength(wall))}
                  </span>
                </label>
                <label className="text-xs text-gray-400">
                  Height
                  <InchInput
                    value={wall.height}
                    onCommit={(height) => update(wall.id, { height })}
                    aria-label={`${wall.name} height`}
                    className="mt-1"
                  />
                </label>
              </div>

              {confirming && (
                <div className="mt-3 rounded bg-red-950/40 border border-red-900/70 p-2 text-xs">
                  <p className="text-red-200 mb-2">Delete this wall and its runs?</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        dispatch(deleteWall(wall.id));
                        setConfirmDeleteId(null);
                      }}
                      className="px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-white"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {walls.length === 0 && (
        <p className="rounded border border-dashed border-gray-700 p-3 text-xs text-gray-500">
          No walls yet. Add one to start an elevation.
        </p>
      )}
    </section>
  );
}
