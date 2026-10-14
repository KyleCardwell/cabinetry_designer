import { useState } from 'react';
import { useSelector } from 'react-redux';
import { groupsFor } from '../model/settingGroups.js';
import SettingGroups, { countOverrides } from './SettingGroups.jsx';

export default function RoomSettingsPanel() {
  const [open, setOpen] = useState(false);
  const { rooms, activeRoomId } = useSelector((state) => state.elevation);
  const room = rooms.find(({ id }) => id === activeRoomId);

  if (!room) return null;
  const count = countOverrides(groupsFor('room').flatMap(({ keys }) => keys), room.settingsOverrides);

  return (
    <section className="border-t border-gray-700 pt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 text-sm font-semibold uppercase tracking-wide text-gray-300"
      >
        <span>Room settings</span>
        {count > 0 && <span className="text-teal-400">{count} overridden</span>}
        <span className="text-gray-500" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="mt-3"><SettingGroups scope="room" /></div>}
    </section>
  );
}
