import { useDispatch } from 'react-redux';
import { stepEndSides } from '../../model/index.js';
import { setStepEnd } from '../../store/elevationSlice.js';
import SideEndsSection from './SideEndsSection.jsx';

export default function StepEndsSection({ room, wall, run, item, cells, settings, side: onlySide }) {
  const dispatch = useDispatch();
  if (item?.kind !== 'cabinet') return null;
  const sides = [...new Set(stepEndSides(run, cells, settings, room)
    .filter((entry) => entry.leafId === item.id && (!onlySide || entry.side === onlySide))
    .map((entry) => entry.side))];
  if (!sides.length) return null;
  const commit = (side, value) => dispatch(setStepEnd({
    wallId: wall.id, runId: run.id, cellId: item.id, side, value,
  }));

  return SideEndsSection({
    id: 'piece.stepEnds', title: 'Step ends', ariaName: 'step end',
    ends: item.stepEnds, sides, defaultEnd: 'return', onCommit: commit,
  });
}
