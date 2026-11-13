import { useDispatch, useSelector } from 'react-redux';
import { missingSlideName, missingSlides } from '../model/slides.js';
import { moveMissingSlide } from '../store/elevationSlice.js';
import MissingCatalogRow, { LEVEL_NAMES } from './MissingCatalogRow.jsx';

export function MissingSlideRow({ room, slideId, roomUses, setIn, readOnly }) {
  const dispatch = useDispatch();
  const slides = useSelector((state) => state.elevation.settings.slides);
  return MissingCatalogRow({
    canMove: roomUses > 0, readOnly,
    options: [...slides.map(({ id, name }) => ({ value: id, label: name })), { value: '', label: 'Clear the pick' }],
    ariaLabel: `Move places using ${slideId} to`,
    onMove: (value) => dispatch(moveMissingSlide({ roomId: room.id, slideId, reassignTo: value === '' ? null : value })),
    message: <>
        {missingSlideName(slideId)} isn&apos;t in the Library any more.
        {roomUses > 0 && <> {roomUses} {roomUses === 1 ? 'place' : 'places'} in this room{' '}
          {roomUses === 1 ? 'uses' : 'use'} it and size from the next slide up until moved.</>}
        {setIn.map((level) => <span key={level}> Set in the {LEVEL_NAMES[level]} — change it there.</span>)}
    </>,
  });
}

export default function MissingSlidesNotice() {
  const { rooms, activeRoomId, settings, layers, cloud, source } = useSelector((state) => state.elevation);
  const room = rooms.find((candidate) => candidate.id === activeRoomId);
  if (!room) return null;
  const missing = missingSlides(room, settings, layers);
  if (!missing.length) return null;
  return (
    <div className="space-y-2 border-b border-amber-700 bg-amber-900/40 px-4 py-2 text-xs text-amber-100">
      {missing.map((row) => <MissingSlideRow key={row.slideId} room={room} {...row}
        readOnly={Boolean(cloud?.room?.readOnly) || source === 'version'} />)}
    </div>
  );
}
