import { useDispatch } from 'react-redux';
import { v4 as uuid } from 'uuid';
import { runBaseProfile } from '../../model/furnitureBase.js';
import { addBaseCutout } from '../../store/elevationSlice.js';

export default function AddBaseCutoutButton({ room, wall, run, piece, settings }) {
  const dispatch = useDispatch();
  if (piece.kind !== 'cabinet' || Math.abs(piece.z - run.z) > 1e-6
    || runBaseProfile(room, wall, run, settings).kind !== 'furniture_base') return null;

  return (
    <button
      type="button"
      onClick={() => dispatch(addBaseCutout({
        wallId: wall.id, runId: run.id,
        cutout: { id: uuid(), from: piece.id, to: piece.id },
      }))}
      className="w-full rounded bg-gray-700 px-3 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600"
    >
      Add base cutout
    </button>
  );
}
