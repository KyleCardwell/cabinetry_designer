import { useDispatch } from 'react-redux';
import { elevationKey, elevationLeadKey, returnsView } from '../model/topology.js';
import { setElevationOption } from '../store/elevationSlice.js';

export default function ReturnsViewControl({ room, wallId, side, readOnly = false }) {
  const dispatch = useDispatch();
  if (!room || !wallId) return null;
  const key = elevationLeadKey(room, elevationKey(wallId, side));
  const endView = returnsView(room, key) === 'end';
  return (
    <button
      type="button"
      aria-pressed={endView}
      disabled={readOnly}
      onClick={() => dispatch(setElevationOption({ roomId: room.id, key, returns: endView ? 'section' : 'end' }))}
      className={`rounded px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        endView ? 'bg-cyan-700 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }`}
    >
      {`Returns: ${endView ? 'End view' : 'Section'}`}
    </button>
  );
}
