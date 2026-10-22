import { useDispatch } from 'react-redux';
import { v4 as uuid } from 'uuid';
import { runItems } from '../../model/grid.js';
import { resolveProfile } from '../../model/profile.js';
import { topSegmentRange } from '../../model/topSegments.js';
import { isCountertop, runTop } from '../../model/tops.js';
import { addTopSegment } from '../../store/elevationSlice.js';

export function coveringTopSegments(run, piece) {
  return (run.topSegments ?? []).filter((segment) => (
    topSegmentRange(run, segment)?.some(({ id }) => id === piece.id)
  ));
}

export default function AddTopSegmentButton({ room, wall, run, piece, settings }) {
  const dispatch = useDispatch();
  if (piece.kind !== 'cabinet' || !runItems(run).some(({ id }) => id === piece.id)
    || !isCountertop(runTop(wall, run, resolveProfile(settings, room, wall)).kind)
    || coveringTopSegments(run, piece).length) return null;

  return (
    <button
      type="button"
      onClick={() => dispatch(addTopSegment({
        wallId: wall.id, runId: run.id,
        segment: { id: uuid(), from: piece.id, to: piece.id, kind: 'wood', drop: 1, mode: 'box' },
      }))}
      className="w-full rounded bg-gray-700 px-3 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600"
    >
      Add top segment
    </button>
  );
}
