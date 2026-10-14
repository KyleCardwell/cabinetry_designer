import { useDispatch, useSelector } from 'react-redux';
import { registryEntry } from '../model/settingsRegistry.js';
import { choiceOptions } from '../model/settingGroups.js';
import { resolveSetting } from '../model/settingsResolve.js';
import { setRoomSetting, setSetting } from '../store/elevationSlice.js';
import InchInput from './InchInput.jsx';
import OverrideInput from './OverrideInput.jsx';

export function ownSettingValue(values, key) {
  const value = key.split('.').reduce((parent, part) => parent?.[part], values);
  return value === undefined || value === '' ? null : value;
}

export default function SettingField({ settingKey, scope }) {
  const dispatch = useDispatch();
  const { settings, rooms, activeRoomId } = useSelector((state) => state.elevation);
  const room = rooms.find(({ id }) => id === activeRoomId);
  const entry = registryEntry(settingKey);
  const choices = choiceOptions(settingKey);

  if (!entry || (scope === 'room' && !room)) return null;

  const onChange = (value) => {
    if (value !== null && ((settingKey === 'baseCutoutFoot' && value < 0)
      || (settingKey === 'baseCutoutHeight' && value <= 0))) return false;
    return dispatch(scope === 'room'
      ? setRoomSetting({ roomId: room.id, key: settingKey, value })
      : setSetting({ key: settingKey, value }));
  };

  if (scope === 'room') {
    const inherited = resolveSetting(settingKey, [{ level: 'team', values: settings }]);
    return (
      <OverrideInput
        kind={entry.kind}
        label={entry.label}
        aria-label={`Room ${entry.label}`}
        value={ownSettingValue(room.settingsOverrides, settingKey)}
        inherited={inherited.value}
        source={inherited.source}
        level="room"
        choices={choices}
        onChange={onChange}
      />
    );
  }

  const value = ownSettingValue(settings, settingKey);
  return (
    <label className="block text-xs text-gray-400">
      {entry.label}
      {entry.kind === 'number' ? (
        <InchInput aria-label={entry.label} value={value} onCommit={onChange} className="mt-1" />
      ) : entry.kind === 'bool' ? (
        <input
          type="checkbox"
          aria-label={entry.label}
          checked={value}
          onChange={(event) => onChange(event.target.checked)}
          className="ml-2"
        />
      ) : (
        <select
          aria-label={entry.label}
          value={value}
          onChange={(event) => onChange(choices.find((choice) => String(choice.value) === event.target.value).value)}
          className="mt-1 w-full px-2.5 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        >
          {choices.map((choice) => <option key={String(choice.value)} value={String(choice.value)}>{choice.label}</option>)}
        </select>
      )}
    </label>
  );
}
