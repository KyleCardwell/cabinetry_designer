import { useState } from 'react';
import { useSelector } from 'react-redux';
import { groupsFor } from '../model/settingGroups.js';
import SettingField, { ownSettingValue } from './SettingField.jsx';

export function countOverrides(keys, overrides) {
  return keys.filter((key) => ownSettingValue(overrides, key) !== null).length;
}

export default function SettingGroups({ scope }) {
  const [openGroups, setOpenGroups] = useState({});
  const { rooms, activeRoomId } = useSelector((state) => state.elevation);
  const room = rooms.find(({ id }) => id === activeRoomId);

  return (
    <div className="space-y-3">
      {groupsFor(scope).map((group) => {
        const open = Boolean(openGroups[group.id]);
        const count = scope === 'room' ? countOverrides(group.keys, room?.settingsOverrides) : 0;
        return (
          <section key={group.id}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenGroups((current) => ({ ...current, [group.id]: !current[group.id] }))}
              className="flex w-full items-center justify-between gap-2 text-xs font-semibold text-gray-300"
            >
              <span>{group.label}</span>
              {count > 0 && <span className="text-teal-400">{count} overridden</span>}
              <span className="text-gray-500" aria-hidden="true">{open ? '−' : '+'}</span>
            </button>
            {open && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {group.keys.map((key) => <SettingField key={key} settingKey={key} scope={scope} />)}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
