import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { missingPullName, missingPulls } from '../model/pulls.js';
import { moveMissingPull } from '../store/elevationSlice.js';

const SELECT_CLASS = 'w-auto rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-700';
const LEVEL_NAMES = { team: 'shop standard', project: 'project settings', phase: 'phase settings' };

export function MissingPullRow({ room, pullId, roomUses, setIn, readOnly }) {
  const dispatch = useDispatch();
  const pulls = useSelector((state) => state.elevation.settings.pulls);
  const [choice, setChoice] = useState('');
  const reassignTo = choice === 'none' || pulls.some((pull) => pull.id === choice)
    ? choice : (pulls[0]?.id ?? 'none');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p>
        {missingPullName(pullId)} isn&apos;t in the Library any more.
        {roomUses > 0 && <> {roomUses} {roomUses === 1 ? 'place' : 'places'} in this room{' '}
          {roomUses === 1 ? 'uses' : 'use'} it and draw as the 4&quot; pull until moved.</>}
        {setIn.map((level) => <span key={level}> Set in the {LEVEL_NAMES[level]} — change it there.</span>)}
        {roomUses > 0 && readOnly && ' Someone who can edit the room can move them.'}
      </p>
      {roomUses > 0 && !readOnly && <>
        <label className="flex items-center gap-2">
          Move them to
          <select value={reassignTo} onChange={(event) => setChoice(event.target.value)}
            aria-label={`Move places using ${pullId} to`} className={SELECT_CLASS}>
            {pulls.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            <option value="none">No pull</option>
          </select>
        </label>
        <button type="button" className={BUTTON_CLASS}
          onClick={() => dispatch(moveMissingPull({ roomId: room.id, pullId, reassignTo }))}>Move</button>
      </>}
    </div>
  );
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
