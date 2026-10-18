import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { missingSlideName, missingSlides } from '../model/slides.js';
import { moveMissingSlide } from '../store/elevationSlice.js';

const SELECT_CLASS = 'w-auto rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-700';
const LEVEL_NAMES = { team: 'shop standard', project: 'project settings', phase: 'phase settings' };

export function MissingSlideRow({ room, slideId, roomUses, setIn, readOnly }) {
  const dispatch = useDispatch();
  const slides = useSelector((state) => state.elevation.settings.slides);
  const [choice, setChoice] = useState(null);
  const reassignTo = choice === '' || slides.some((slide) => slide.id === choice)
    ? choice : (slides[0]?.id ?? '');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p>
        {missingSlideName(slideId)} isn&apos;t in the Library any more.
        {roomUses > 0 && <> {roomUses} {roomUses === 1 ? 'place' : 'places'} in this room{' '}
          {roomUses === 1 ? 'uses' : 'use'} it and size from the next slide up until moved.</>}
        {setIn.map((level) => <span key={level}> Set in the {LEVEL_NAMES[level]} — change it there.</span>)}
        {roomUses > 0 && readOnly && ' Someone who can edit the room can move them.'}
      </p>
      {roomUses > 0 && !readOnly && <>
        <label className="flex items-center gap-2">
          Move them to
          <select value={reassignTo} onChange={(event) => setChoice(event.target.value)}
            aria-label={`Move places using ${slideId} to`} className={SELECT_CLASS}>
            {slides.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            <option value="">Clear the pick</option>
          </select>
        </label>
        <button type="button" className={BUTTON_CLASS}
          onClick={() => dispatch(moveMissingSlide({ roomId: room.id, slideId, reassignTo: reassignTo === '' ? null : reassignTo }))}>Move</button>
      </>}
    </div>
  );
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
