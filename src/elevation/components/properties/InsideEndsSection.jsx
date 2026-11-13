import { useDispatch } from 'react-redux';
import { insideEndSides, isInsetStyle, resolveStyle } from '../../model/index.js';
import { setInsideEnd } from '../../store/elevationSlice.js';
import SideEndsSection from './SideEndsSection.jsx';

export default function InsideEndsSection({ room, wall, run, item, cells, settings, side: onlySide }) {
  const dispatch = useDispatch();
  if (item?.kind !== 'cabinet') return null;
  // Generated panels occupy the opening; exclude them when checking the owner's neighbours.
  const sides = insideEndSides(run, {
    ...cells, pieces: cells.pieces.filter((piece) => !piece.inside),
  }, settings).filter((entry) => entry.leafId === item.id
    && (!onlySide || entry.side === onlySide));
  if (!sides.length) return null;
  const framed = Boolean(run._frame) || isInsetStyle(resolveStyle(settings, room, run));
  const commit = (side, value) => dispatch(setInsideEnd({
    wallId: wall.id, runId: run.id, cellId: item.id, side, value,
  }));

  return SideEndsSection({
    id: 'piece.insideEnds', title: 'Inside ends', ariaName: 'inside end',
    ends: item.insideEnds, sides: sides.map((entry) => entry.side),
    defaultEnd: 'panel', returnOption: framed, onCommit: commit,
  });
}
