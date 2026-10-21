import { useDispatch, useSelector } from 'react-redux';
import { selectRoomInheritedChain, selectSettings } from '../store/selectors.js';
import { counterTop, crownOverlap, moldingStack, resolveProfile } from '../model/profile.js';
import { formatInches } from '../model/units.js';
import { resolveSetting, resolveSettings } from '../model/settingsResolve.js';
import {
  updateRoomProfile,
  useAutoHeightsForRoom as autoHeightsForRoom,
} from '../store/elevationSlice.js';
import { CABINET_TYPE_IDS } from '../model/constants.js';
import { runBase } from '../model/furnitureBase.js';
import { moldingProfiles } from '../model/moldingProfiles.js';
import InchInput from './InchInput.jsx';
import Field from './properties/Field.jsx';
import OverrideField from './OverrideField.jsx';
import OverrideInput from './OverrideInput.jsx';
import SettingField, { ownSettingValue } from './SettingField.jsx';
import HeightBands from './HeightBands.jsx';
import { BAND_SETTING_KEYS, bandFieldsFor } from '../model/heightBands.js';

export default function RoomHeightsPanel() {
  const dispatch = useDispatch();
  const { rooms, activeRoomId } = useSelector((state) => state.elevation);
  const inheritedChain = useSelector(selectRoomInheritedChain);
  const settings = useSelector(selectSettings);
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;

  if (!room) return null;
  const inheritedProfile = resolveProfile(resolveSettings(inheritedChain));
  const resolvedProfile = resolveProfile(settings, room);
  const moldings = moldingProfiles(resolvedProfile, settings);
  const base = runBase(room, null, { cabinetTypeId: CABINET_TYPE_IDS.BASE }, settings);
  const overlap = crownOverlap(resolvedProfile);
  const inheritedSource = (key) => resolveSetting(`defaultProfile.${key}`, inheritedChain).source;

  const renderField = ({ key, label, type, pickKind: kind }) => {
    if (type === 'setting') return <SettingField settingKey={key} scope="room" />;
    if (type === 'baseKind') return (
      <OverrideInput
        kind="enum"
        label="Base"
        aria-label="Room Base"
        value={room.profile.baseKind ?? null}
        inherited={inheritedProfile.baseKind}
        source={inheritedSource('baseKind')}
        choices={[
          { value: 'toe_kick', label: 'Toe kick' },
          { value: 'furniture_base', label: 'Furniture base' },
        ]}
        onChange={(value) => dispatch(updateRoomProfile({ roomId: room.id, key: 'baseKind', value }))}
      />
    );
    if (type === 'pick') {
      const pickedId = room.profile[key];
      const choices = (settings.sectionProfiles ?? []).filter((entry) => entry.kind === kind && !entry.archived);
      const unavailable = pickedId && !choices.some((entry) => entry.id === pickedId);
      const plainLabel = kind === 'nosing' ? 'None' : kind === 'base_cutout' ? 'Square' : 'Plain';
      const inheritedText = inheritedProfile[key]
        ? settings.sectionProfiles?.find((entry) => entry.id === inheritedProfile[key])?.name ?? 'Missing profile'
        : plainLabel;
      return (
        <OverrideField
          key={key}
          label={label}
          overridden={pickedId !== undefined}
          inheritedText={inheritedText}
          inheritedSource={inheritedSource(key)}
          onReset={() => dispatch(updateRoomProfile({ roomId: room.id, key, value: undefined }))}
        >
          {(borderClass) => <select
            aria-label={`Room ${label}`}
            value={pickedId === null ? 'plain' : pickedId ?? ''}
            onChange={(event) => {
              const value = event.target.value === 'plain' ? null : event.target.value || undefined;
              dispatch(updateRoomProfile({ roomId: room.id, key, value }));
            }}
            className={`mt-1 w-full rounded border ${borderClass} bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none`}
          >
            <option value="">{`Inherit (${inheritedText})`}</option>
            <option value="plain">{plainLabel}</option>
            {choices.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            {unavailable && <option value={pickedId} disabled>{settings.sectionProfiles?.find((entry) => entry.id === pickedId)?.name ?? 'Missing profile'} (unavailable)</option>}
          </select>}
        </OverrideField>
      );
    }
    const fromProfile = (key === 'crownHeight' && Boolean(moldings.crown))
      || (key === 'topMoldHeight' && Boolean(moldings.topMold && !moldings.topMold.profile.stretch));
    return fromProfile ? (
      <Field key={key} label={label} tag="profile">
        <InchInput
          value={resolvedProfile[key]}
          readOnly
          onCommit={() => undefined}
          aria-label={`Room ${label}`}
          className="mt-1"
        />
      </Field>
    ) : (
      <OverrideInput
        key={key}
        kind="number"
        readOnly={false}
        label={label}
        aria-label={`Room ${label}`}
        value={room.profile[key] ?? null}
        inherited={inheritedProfile[key]}
        source={inheritedSource(key)}
        onChange={(value) => key === 'furnitureBaseProud' && value !== null && value < 0 ? false : dispatch(updateRoomProfile({ roomId: room.id, key, value }))}
      />
    );
  };

  return (
    <div className="space-y-3">
      <HeightBands
        level="room"
        fields={bandFieldsFor('room', { furnitureBase: resolvedProfile.baseKind === 'furniture_base' })}
        renderField={renderField}
        isSet={(key) => BAND_SETTING_KEYS.includes(key)
          ? ownSettingValue(room.settingsOverrides, key) !== null
          : room.profile[key] !== undefined}
        warnings={[...moldings.warnings, ...base.warnings]}
        overlap={overlap}
      />

      <div className="grid grid-cols-2 gap-2 rounded border border-gray-700 bg-gray-900/45 p-2.5 text-xs">
        <div>
          <p className="text-gray-500">Molding stack</p>
          <p className="mt-1 text-gray-200">{formatInches(moldingStack(resolvedProfile))}</p>
        </div>
        <div>
          <p className="text-gray-500">Counter height</p>
          <p className="mt-1 text-gray-200">{formatInches(counterTop(resolvedProfile))}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => dispatch(autoHeightsForRoom({ roomId: room.id }))}
        className="w-full rounded bg-gray-700 px-3 py-2 text-xs font-medium text-gray-100 transition-colors hover:bg-gray-600"
      >
        Use auto heights for all runs
      </button>
    </div>
  );
}
