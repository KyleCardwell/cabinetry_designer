import { useDispatch, useSelector } from 'react-redux';
import { missingPullName, missingPulls } from '../model/pulls.js';
import { moveMissingPull } from '../store/elevationSlice.js';
import MissingCatalogRow, { LEVEL_NAMES } from './MissingCatalogRow.jsx';

export function MissingPullRow({ room, pullId, roomUses, setIn, readOnly }) {
  const dispatch = useDispatch();
  const pulls = useSelector((state) => state.elevation.settings.pulls);
  return MissingCatalogRow({
    canMove: roomUses > 0, readOnly,
    options: [...pulls.map(({ id, name }) => ({ value: id, label: name })), { value: 'none', label: 'No pull' }],
    ariaLabel: `Move places using ${pullId} to`,
    onMove: (value) => dispatch(moveMissingPull({ roomId: room.id, pullId, reassignTo: value })),
    message: <>
        {missingPullName(pullId)} isn&apos;t in the Library any more.
        {roomUses > 0 && <> {roomUses} {roomUses === 1 ? 'place' : 'places'} in this room{' '}
          {roomUses === 1 ? 'uses' : 'use'} it and draw as the 4&quot; pull until moved.</>}
        {setIn.map((level) => <span key={level}> Set in the {LEVEL_NAMES[level]} — change it there.</span>)}
    </>,
  });
}

export default function MissingPullsNotice() {
  const { rooms, activeRoomId, settings, layers, cloud, source } = useSelector((state) => state.elevation);
  const room = rooms.find((candidate) => candidate.id === activeRoomId);
  if (!room) return null;
  const missing = missingPulls(room, settings, layers);
  if (!missing.length) return null;
  return (
    <div className="space-y-2 border-b border-amber-700 bg-amber-900/40 px-4 py-2 text-xs text-amber-100">
      {missing.map((row) => <MissingPullRow key={row.pullId} room={room} {...row}
        readOnly={Boolean(cloud?.room?.readOnly) || source === 'version'} />)}
    </div>
  );
}
