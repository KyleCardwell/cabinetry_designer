import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { counterTop, moldingStack } from '../model/profile.js';
import { formatInches } from '../model/units.js';
import {
  updateRoomProfile,
  useAutoHeightsForRoom,
} from '../store/elevationSlice.js';
import InchInput from './InchInput.jsx';

const PROFILE_FIELDS = [
  ['toeKickHeight', 'Toe kick height'],
  ['baseBoxHeight', 'Base box height'],
  ['countertopThickness', 'Countertop thickness'],
  ['upperClearance', 'Upper clearance'],
  ['crownTop', 'Top of crown'],
  ['topMoldHeight', 'Top mold height'],
  ['crownHeight', 'Crown height'],
  ['crownOverlap', 'Crown overlap'],
];

export default function RoomHeightsPanel() {
  const dispatch = useDispatch();
  const { rooms, activeRoomId } = useSelector((state) => state.elevation);
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  const [open, setOpen] = useState(true);

  if (!room) return null;

  return (
    <section className="border-t border-gray-700 pt-4">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-wide text-gray-300"
        aria-expanded={open}
      >
        Room heights
        <span className="text-gray-500" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {PROFILE_FIELDS.map(([key, label]) => (
              <label key={key} className="text-xs text-gray-400">
                {label}
                <InchInput
                  value={room.profile[key]}
                  onCommit={(value) => dispatch(updateRoomProfile({
                    roomId: room.id,
                    key,
                    value,
                  }))}
                  aria-label={`Room ${label}`}
                  className="mt-1"
                />
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 rounded border border-gray-700 bg-gray-900/45 p-2.5 text-xs">
            <div>
              <p className="text-gray-500">Molding stack</p>
              <p className="mt-1 text-gray-200">{formatInches(moldingStack(room.profile))}</p>
            </div>
            <div>
              <p className="text-gray-500">Counter height</p>
              <p className="mt-1 text-gray-200">{formatInches(counterTop(room.profile))}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => dispatch(useAutoHeightsForRoom({ roomId: room.id }))}
            className="w-full rounded bg-gray-700 px-3 py-2 text-xs font-medium text-gray-100 transition-colors hover:bg-gray-600"
          >
            Use auto heights for all runs
          </button>
        </div>
      )}
    </section>
  );
}
