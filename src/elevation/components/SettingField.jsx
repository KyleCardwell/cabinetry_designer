import { useDispatch, useSelector } from 'react-redux';
import { allowedAt, registryEntry } from '../model/settingsRegistry.js';
import { BUILT_IN_PULLS } from '../model/pulls.js';
import { BUILT_IN_SLIDES } from '../model/slides.js';
import { choiceOptions } from '../model/settingGroups.js';
import { resolveSetting } from '../model/settingsResolve.js';
import { setLayerSetting, setRoomSetting, setSetting } from '../store/elevationSlice.js';
import { inheritedChain } from '../store/selectors.js';
import InchInput from './InchInput.jsx';
import OverrideInput from './OverrideInput.jsx';
import TextInput from './TextInput.jsx';

export function ownSettingValue(values, key) {
  const value = key.split('.').reduce((parent, part) => parent?.[part], values);
  return value === undefined || value === '' ? null : value;
}

export default function SettingField({ settingKey, scope }) {
  const dispatch = useDispatch();
  const elevation = useSelector((state) => state.elevation);
  const { settings, rooms, activeRoomId, layers } = elevation;
  const isLayer = scope === 'project' || scope === 'phase';
  const room = rooms.find(({ id }) => id === activeRoomId);
  const entry = registryEntry(settingKey);
  const choices = entry?.kind === 'pull'
    ? [...(settings.pulls ?? BUILT_IN_PULLS).map(({ id, name }) => ({ value: id, label: name })),
      { value: 'none', label: 'No pull' }]
    : entry?.kind === 'slide'
    ? (settings.slides ?? BUILT_IN_SLIDES).map(({ id, name }) => ({ value: id, label: name }))
    : choiceOptions(settingKey);

  if (!entry || !allowedAt(settingKey, scope) || (scope === 'room' && !room) || (isLayer && !layers?.[scope])) return null;

  const onChange = (value) => {
    if (value !== null && ((settingKey === 'baseCutoutFoot' && value < 0)
      || (settingKey === 'baseCutoutHeight' && value <= 0))) return false;
    return dispatch(isLayer
      ? setLayerSetting({ level: scope, key: settingKey, value })
      : scope === 'room'
      ? setRoomSetting({ roomId: room.id, key: settingKey, value })
      : setSetting({ key: settingKey, value }));
  };

  const addMissing = (value) => {
    if (['pull', 'slide'].includes(entry.kind) && value != null && !choices.some((choice) => choice.value === value)) {
      choices.push({ value, label: `Missing (${value})` });
    }
  };
  addMissing(ownSettingValue(isLayer ? layers[scope].values : scope === 'room' ? room.settingsOverrides : settings, settingKey));

  if (scope === 'room' || isLayer) {
    const inherited = resolveSetting(settingKey, inheritedChain(elevation, scope));
    addMissing(inherited.value);
    return (
      <OverrideInput
        kind={entry.kind}
        label={entry.label}
        aria-label={`${scope[0].toUpperCase()}${scope.slice(1)} ${entry.label}`}
        value={ownSettingValue(isLayer ? layers[scope].values : room.settingsOverrides, settingKey)}
        inherited={inherited.value}
        source={inherited.source}
        level={scope}
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
      ) : entry.kind === 'text' ? (
        <TextInput aria-label={entry.label} value={value} onCommit={onChange} className="mt-1" />
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
