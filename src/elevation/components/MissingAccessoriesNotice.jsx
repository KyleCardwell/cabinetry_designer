import { useDispatch, useSelector } from 'react-redux';
import { missingAccessoryName, missingAccessories } from '../model/accessories.js';
import { moveMissingAccessory } from '../store/elevationSlice.js';
import MissingCatalogRow from './MissingCatalogRow.jsx';

export function MissingAccessoryRow({ room, accessoryId, place = 'section', roomUses, readOnly }) {
  const dispatch = useDispatch();
  const accessories = useSelector((state) => state.elevation.settings.accessories ?? [])
    .filter(({ attachesTo }) => attachesTo === place).sort((a, b) => a.name.localeCompare(b.name));
  return MissingCatalogRow({
    canMove: roomUses > 0, readOnly,
    options: [...accessories.map(({ id, name }) => ({ value: id, label: name })), { value: '', label: 'Remove them' }],
    ariaLabel: `Move ${place === 'drawer_box' ? 'drawer boxes' : 'sections'} using ${accessoryId} to`,
    onMove: (value) => dispatch(moveMissingAccessory({ roomId: room.id, accessoryId, place, reassignTo: value === '' ? null : value })),
    message: <>
        {missingAccessoryName(accessoryId)} isn&apos;t in the Library any more.
        {roomUses > 0 && <> {roomUses} {roomUses === 1 ? 'place' : 'places'} in this room{' '}
          {roomUses === 1 ? 'uses' : 'use'} it{place === 'drawer_box' ? ' on drawer boxes' : ' in sections'}.</>}
    </>,
  });
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
