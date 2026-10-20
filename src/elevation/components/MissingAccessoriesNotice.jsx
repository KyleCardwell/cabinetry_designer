import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { missingAccessoryName, missingAccessories } from '../model/accessories.js';
import { moveMissingAccessory } from '../store/elevationSlice.js';

const SELECT_CLASS = 'w-auto rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-700';

export function MissingAccessoryRow({ room, accessoryId, place = 'section', roomUses, readOnly }) {
  const dispatch = useDispatch();
  const accessories = useSelector((state) => state.elevation.settings.accessories ?? [])
    .filter(({ attachesTo }) => attachesTo === place).sort((a, b) => a.name.localeCompare(b.name));
  const [choice, setChoice] = useState(null);
  const reassignTo = choice === '' || accessories.some((accessory) => accessory.id === choice)
    ? choice : (accessories[0]?.id ?? '');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p>
        {missingAccessoryName(accessoryId)} isn&apos;t in the Library any more.
        {roomUses > 0 && <> {roomUses} {roomUses === 1 ? 'place' : 'places'} in this room{' '}
          {roomUses === 1 ? 'uses' : 'use'} it{place === 'drawer_box' ? ' on drawer boxes' : ' in sections'}.</>}
        {roomUses > 0 && readOnly && ' Someone who can edit the room can move them.'}
      </p>
      {roomUses > 0 && !readOnly && <>
        <label className="flex items-center gap-2">
          Move them to
          <select value={reassignTo} onChange={(event) => setChoice(event.target.value)}
            aria-label={`Move ${place === 'drawer_box' ? 'drawer boxes' : 'sections'} using ${accessoryId} to`} className={SELECT_CLASS}>
            {accessories.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            <option value="">Remove them</option>
          </select>
        </label>
        <button type="button" className={BUTTON_CLASS}
          onClick={() => dispatch(moveMissingAccessory({ roomId: room.id, accessoryId, place, reassignTo: reassignTo === '' ? null : reassignTo }))}>Move</button>
      </>}
    </div>
  );
}

export default function MissingAccessoriesNotice() {
  const { rooms, activeRoomId, settings, cloud, source } = useSelector((state) => state.elevation);
  const room = rooms.find((candidate) => candidate.id === activeRoomId);
  if (!room) return null;
  const missing = missingAccessories(room, settings);
  if (!missing.length) return null;
  return (
    <div className="space-y-2 border-b border-amber-700 bg-amber-900/40 px-4 py-2 text-xs text-amber-100">
      {missing.map((row) => <MissingAccessoryRow key={`${row.accessoryId}:${row.place}`} room={room} {...row}
        readOnly={Boolean(cloud?.room?.readOnly) || source === 'version'} />)}
    </div>
  );
}
