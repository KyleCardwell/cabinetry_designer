import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  addWall,
  deleteWall,
  setActiveWall,
  setTool,
} from '../store/elevationSlice.js';
import { wallLabel, wallNumbers } from '../model/topology.js';
import { resolveWall } from '../model/room.js';
import WallHeightProperties from './properties/WallHeightProperties.jsx';

export default function WallList() {
  const dispatch = useDispatch();
  const {
    rooms,
    activeRoomId,
    activeWallId,
    activeWallSide,
    view,
  } = useSelector((state) => state.elevation);
  const room = rooms.find((candidate) => candidate.id === activeRoomId);
  const walls = room?.walls ?? [];
  const numbers = room ? wallNumbers(room) : new Map();
  const sortedWalls = [...walls].sort((a, b) => (
    (numbers.get(a.id) ?? Number.POSITIVE_INFINITY)
      - (numbers.get(b.id) ?? Number.POSITIVE_INFINITY)
    || walls.indexOf(a) - walls.indexOf(b)
  ));
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const [expandedWallId, setExpandedWallId] = useState(activeWallId);
  const selectedRow = useRef(null);

  useEffect(() => {
    setExpandedWallId(activeWallId);
    selectedRow.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeRoomId, activeWallId]);

  return (
    <section>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => {
            if (view === 'plan') dispatch(setTool('wall'));
            else dispatch(addWall());
          }}
          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium transition-colors"
        >
          Add wall
        </button>
      </div>

      <div className="space-y-2">
        {sortedWalls.map((wall) => {
          const active = wall.id === activeWallId;
          const expanded = active && expandedWallId === wall.id;
          const confirming = wall.id === confirmDeleteId;
          const label = wallLabel(room, wall);
          return (
            <div
              key={wall.id}
              ref={active ? selectedRow : null}
              data-wall-id={wall.id}
              className={`rounded-lg border p-3 ${
                active ? 'border-blue-500 bg-blue-950/30' : 'border-gray-700 bg-gray-800/70'
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <button
                  type="button"
                  aria-label={`Toggle ${label} settings`}
                  aria-expanded={expanded}
                  disabled={!active}
                  onClick={() => setExpandedWallId(expanded ? null : wall.id)}
                  className="shrink-0 text-gray-400 hover:text-gray-200 disabled:text-gray-600"
                >
                  <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => dispatch(setActiveWall(wall.id))}
                  className={`h-3 w-3 shrink-0 rounded-full border ${
                    active ? 'border-blue-400 bg-blue-500' : 'border-gray-500'
                  }`}
                  aria-label={`Select ${label}`}
                />
                <button
                  type="button"
                  onClick={() => dispatch(setActiveWall(wall.id))}
                  className="min-w-0 flex-1 truncate px-1 text-left text-sm font-medium"
                >
                  {label}
                </button>
                <span className="shrink-0 text-[10px] text-gray-500">
                  {wall.runs.length} {wall.runs.length === 1 ? 'run' : 'runs'} ·{' '}
                  {(wall.openings ?? []).length}{' '}
                  {(wall.openings ?? []).length === 1 ? 'opening' : 'openings'}
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(wall.id)}
                  className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                >
                  Delete
                </button>
              </div>

              {expanded && (
                <div className="pl-3 border-l border-gray-700">
                  <WallHeightProperties
                    key={wall.id}
                    room={room}
                    wall={resolveWall(room, wall, activeWallSide)}
                    plan={view === 'plan'}
                  />
                </div>
              )}

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
