import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  addRoom,
  deleteRoom,
  renameRoom,
  setActiveRoom,
} from '../store/elevationSlice.js';

export default function RoomPicker() {
  const dispatch = useDispatch();
  const { rooms, activeRoomId } = useSelector((state) => state.elevation);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">Rooms</h2>
        <button
          type="button"
          onClick={() => dispatch(addRoom({ name: `Room ${rooms.length + 1}` }))}
          className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-blue-500"
        >
          Add room
        </button>
      </div>

      <div className="space-y-2">
        {rooms.map((room) => {
          const active = room.id === activeRoomId;
          const confirming = room.id === confirmDeleteId;
          return (
            <div
              key={room.id}
              className={`rounded-lg border p-2.5 ${
                active ? 'border-blue-500 bg-blue-950/30' : 'border-gray-700 bg-gray-800/70'
              }`}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => dispatch(setActiveRoom(room.id))}
                  className={`h-3 w-3 shrink-0 rounded-full border ${
                    active ? 'border-blue-400 bg-blue-500' : 'border-gray-500'
                  }`}
                  aria-label={`Select ${room.name}`}
                />
                <input
                  value={room.name}
                  onChange={(event) => dispatch(renameRoom({
                    roomId: room.id,
                    name: event.target.value,
                  }))}
                  onFocus={() => dispatch(setActiveRoom(room.id))}
                  aria-label="Room name"
                  className="min-w-0 flex-1 rounded bg-transparent px-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(room.id)}
                  className="text-xs text-gray-500 transition-colors hover:text-red-400"
                >
                  Delete
                </button>
              </div>

              {confirming && (
                <div className="mt-2 rounded border border-red-900/70 bg-red-950/40 p-2 text-xs">
                  <p className="mb-2 text-red-200">Delete this room and all its walls?</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        dispatch(deleteRoom(room.id));
                        setConfirmDeleteId(null);
                      }}
                      className="rounded bg-red-700 px-2 py-1 text-white hover:bg-red-600"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded bg-gray-700 px-2 py-1 hover:bg-gray-600"
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

      {rooms.length === 0 && (
        <p className="rounded border border-dashed border-gray-700 p-3 text-xs text-gray-500">
          No rooms yet. Add one to continue.
        </p>
      )}
    </section>
  );
}
