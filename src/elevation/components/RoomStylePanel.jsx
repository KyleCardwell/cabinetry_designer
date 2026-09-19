import { useDispatch, useSelector } from 'react-redux';
import { resolveStyle } from '../model/index.js';
import { setRoomStyle } from '../store/elevationSlice.js';
import StyleFields from './properties/StyleFields.jsx';

export default function RoomStylePanel() {
  const dispatch = useDispatch();
  const { rooms, activeRoomId, settings } = useSelector((state) => state.elevation);
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  if (!room) return null;

  return (
    <section className="border-t border-gray-700 pt-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-300">Cabinet style</h3>
      <StyleFields
        label="Room"
        value={room.style}
        inherited={resolveStyle(settings)}
        onChange={(style) => dispatch(setRoomStyle({ roomId: room.id, style }))}
      />
    </section>
  );
}
