import { useDispatch } from 'react-redux';
import { v4 as uuid } from 'uuid';
import { baseCutoutSpan } from '../../model/baseCutouts.js';
import { runScene } from '../../model/runScene.js';
import { runBaseProfile } from '../../model/furnitureBase.js';
import { addBaseCutout } from '../../store/elevationSlice.js';

export function coveringBaseCutouts(run, piece, settings, cabinets) {
  return (run.baseCutouts ?? []).filter((cutout) => {
    const span = baseCutoutSpan(cutout, cabinets, settings);
    return span && piece.x >= span.s0 - 1e-6 && piece.x + piece.width <= span.s1 + 1e-6;
  });
}

export default function AddBaseCutoutButton({ room, wall, run, piece, settings, cabinets }) {
  const dispatch = useDispatch();
  if (piece.kind !== 'cabinet' || Math.abs(piece.z - run.z) > 1e-6
    || runBaseProfile(room, wall, run, settings).kind !== 'furniture_base') return null;

  const bottomCabinets = cabinets ?? runScene(room, wall, run, settings).cells.pieces.filter((candidate) => (
    candidate.kind === 'cabinet' && Math.abs(candidate.z - run.z) <= 1e-6
  ));
  if (coveringBaseCutouts(run, piece, settings, bottomCabinets).length) return null;

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
