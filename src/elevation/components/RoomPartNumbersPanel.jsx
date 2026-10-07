import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { partNumbers } from '../model/partNumbers.js';
import { setRoomPartNumberStart } from '../store/elevationSlice.js';

export default function RoomPartNumbersPanel() {
  const dispatch = useDispatch();
  const { rooms, activeRoomId, settings } = useSelector((state) => state.elevation);
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  const numbers = useMemo(() => partNumbers(room, settings), [room, settings]);

  if (!room) return null;

  return (
    <section className="border-t border-gray-700 pt-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-300">
        Part numbers
      </h3>
      <label className="block text-xs text-gray-400">
        Start number
        <input
          type="number"
          min="1"
          step="1"
          value={room.partNumberStart ?? 1}
          onChange={(event) => {
            const value = event.target.value;
            dispatch(setRoomPartNumberStart({
              roomId: room.id,
              value: value === '' ? 1 : Number(value),
            }));
          }}
          aria-label="Part number start"
          className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        />
      </label>
      <p className="mt-2 text-xs text-gray-500">
        {numbers.parts.length} numbered parts
      </p>
      {numbers.warnings.map((warning) => (
        <p key={warning.number} className="mt-1 text-xs text-amber-500/80">
          Number {warning.number} is used by {warning.keys.length} parts.
        </p>
      ))}
    </section>
  );
}
