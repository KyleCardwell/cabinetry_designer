import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { crownOverlap, resolveProfile } from '../model/profile.js';
import { updateSettings } from '../store/elevationSlice.js';
import { CABINET_TYPE_IDS } from '../model/constants.js';
import { runBase } from '../model/furnitureBase.js';
import { moldingProfiles } from '../model/moldingProfiles.js';
import InchInput from './InchInput.jsx';
import Field from './properties/Field.jsx';
import SettingGroups from './SettingGroups.jsx';
import ViewPrefsFields from './ViewPrefsFields.jsx';
import SettingField from './SettingField.jsx';
import HeightBands from './HeightBands.jsx';
import { BAND_SETTING_KEYS, bandFieldsFor } from '../model/heightBands.js';

export default function SettingsPanel() {
  const dispatch = useDispatch();
  const settings = useSelector((state) => state.elevation.settings);
  const resolvedProfile = resolveProfile(settings);
  const moldings = moldingProfiles(resolvedProfile, settings);
  const base = runBase(null, null, { cabinetTypeId: CABINET_TYPE_IDS.BASE }, settings);
  const overlap = crownOverlap(resolvedProfile);

  const update = (changes) => dispatch(updateSettings(changes));

  const renderField = ({ key, label, type, pickKind: kind }) => {
    if (type === 'setting') return <SettingField settingKey={key} scope="team" />;
    if (type === 'baseKind') return (
      <label className="block text-xs text-gray-400">
        Base
        <select
          aria-label="Default Base"
          value={settings.defaultProfile.baseKind ?? resolvedProfile.baseKind}
          onChange={(event) => {
            const value = event.target.value || undefined;
            update({ defaultProfile: { baseKind: value } });
          }}
          className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        >
          <option value="toe_kick">Toe kick</option>
          <option value="furniture_base">Furniture base</option>
        </select>
      </label>
    );
    if (type === 'pick') {
      const pickedId = settings.defaultProfile[key];
      const choices = (settings.sectionProfiles ?? []).filter((entry) => entry.kind === kind && !entry.archived);
      const unavailable = pickedId && !choices.some((entry) => entry.id === pickedId);
      return (
        <label key={key} className="block text-xs text-gray-400">
          {label}
          <select
            aria-label={`Default ${label}`}
            value={pickedId === null ? 'plain' : pickedId ?? 'plain'}
            onChange={(event) => {
              const value = event.target.value === 'plain' ? null : event.target.value || undefined;
              update({ defaultProfile: { [key]: value } });
            }}
            className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >

            <option value="plain">{kind === 'nosing' ? 'None' : kind === 'base_cutout' ? 'Square' : 'Plain'}</option>
            {choices.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            {unavailable && <option value={pickedId} disabled>{settings.sectionProfiles?.find((entry) => entry.id === pickedId)?.name ?? 'Missing profile'} (unavailable)</option>}
          </select>
        </label>
      );
    }
    const fromProfile = (key === 'crownHeight' && Boolean(moldings.crown))
      || (key === 'topMoldHeight' && Boolean(moldings.topMold && !moldings.topMold.profile.stretch));
    return (
      <Field key={key} label={label} tag={fromProfile ? 'profile' : undefined}>
        <InchInput
          value={fromProfile ? resolvedProfile[key] : settings.defaultProfile[key] ?? resolvedProfile[key]}
          readOnly={fromProfile}
          onCommit={(value) => fromProfile ? undefined : key === 'furnitureBaseProud' && value !== null && value < 0 ? false : update({ defaultProfile: { [key]: value } })}
          aria-label={`Default ${label}`}
          className="mt-1"
        />
      </Field>
    );
  };

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-300">Shop standards</h2>
      <SettingGroups scope="team" exclude={BAND_SETTING_KEYS} />
      <p className="text-xs text-gray-500">
        Door thickness is on the team door style —{' '}
        <Link to="/library/door-style" className="text-blue-400 hover:underline">Library</Link>
      </p>
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-gray-300">View (not saved)</h3>
        <ViewPrefsFields />
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-gray-300">Default height profile</p>
        <HeightBands
          level="shop"
          fields={bandFieldsFor('shop', { furnitureBase: resolvedProfile.baseKind === 'furniture_base' })}
          renderField={renderField}
          warnings={[...moldings.warnings, ...base.warnings]}
          overlap={overlap}
        />
      </div>
    </section>
  );
}
