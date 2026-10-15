import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { PAPER_SIZES, PLOT_SCALES, paperSize } from '../model/drawingScale.js';
import { crownOverlap, resolveProfile } from '../model/profile.js';
import { formatInches } from '../model/units.js';
import { setPref, updateSettings } from '../store/elevationSlice.js';
import { CABINET_TYPE_IDS } from '../model/constants.js';
import { runBase } from '../model/furnitureBase.js';
import { moldingProfiles } from '../model/moldingProfiles.js';
import InchInput from './InchInput.jsx';
import SettingGroups from './SettingGroups.jsx';

const NUMBER_PREFS = [
  ['planGrid', 'Plan grid'],
  ['openingSnap', 'Opening snap'],
  ['cornerSnapDistance', 'Corner snap distance'],
];

const MOLDING_NOTES = {
  'furniture-base-too-short': "The furniture base is shorter than its profile's stretch line; drawn at its own size.",
  'furniture-base-height-mismatch': 'The furniture base profile height differs from the base height; drawn at its own size.',
  'furniture-base-cut-bad': 'The furniture base cut goes outside the board; plain board used.',
  'furniture-base-extra-cuts': 'The furniture base profile has extra open lines; only the first cut is used.',
  'top-mold-above-crown': 'The top mold is taller than the crown total.',
  'top-mold-too-short': "The top mold is shorter than its profile's stretch line; drawn at its own size.",
  'molding-profile-missing': 'The picked profile is missing; plain molding used.',
  'molding-profile-open': 'The picked profile has no closed shape; plain molding used.',
};

const PROFILE_SETTINGS = [
  ['wallHeight', 'Wall height'],
  ['toeKickHeight', 'Toe kick / base height'],
  ['baseBoxHeight', 'Base box height'],
  ['countertopThickness', 'Countertop thickness'],
  ['upperClearance', 'Upper clearance'],
  ['crownTop', 'Top of crown'],
  ['topMoldHeight', 'Top mold'],
  ['crownHeight', 'Crown'],
  ['crownStackHeight', 'Crown total'],
  ['topMoldOverhang', 'Top mold overhang'],
];

export default function SettingsPanel({ shopStandards = true } = {}) {
  const dispatch = useDispatch();
  const settings = useSelector((state) => state.elevation.settings);
  const prefs = useSelector((state) => state.elevation.prefs);
  const [open, setOpen] = useState(false);
  const resolvedProfile = resolveProfile(settings);
  const moldings = moldingProfiles(resolvedProfile, settings);
  const base = runBase(null, null, { cabinetTypeId: CABINET_TYPE_IDS.BASE }, settings);
  const overlap = crownOverlap(resolvedProfile);

  const update = (changes) => dispatch(updateSettings(changes));
  const updatePref = (key, value) => dispatch(setPref({ key, value }));

  return (
    <section className="border-t border-gray-700 pt-4">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="w-full flex items-center justify-between text-sm font-semibold uppercase tracking-wide text-gray-300"
        aria-expanded={open}
      >
        Settings
        <span className="text-gray-500" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {shopStandards && (
            <>
              <SettingGroups scope="team" />
              <p className="text-xs text-gray-500">
                Door thickness is on the team door style —{' '}
                <Link to="/library/door-style" className="text-blue-400 hover:underline">Library</Link>
              </p>
            </>
          )}

          <div className="space-y-3">
            <h3 className="text-xs font-medium text-gray-300">View (not saved)</h3>
            <label className="block text-xs text-gray-400">
              Drawing scale
              <select
                value={prefs.plotScale}
                onChange={(event) => updatePref('plotScale', Number(event.target.value))}
                aria-label="Drawing scale"
                className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                {PLOT_SCALES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-gray-400">
              PDF paper
              <select
                value={paperSize(prefs)}
                onChange={(event) => updatePref('paperSize', event.target.value)}
                aria-label="PDF paper"
                className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                {PAPER_SIZES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-xs text-gray-300">
              <input
                type="checkbox"
                aria-label="Orthogonal plan walls"
                checked={prefs.orthoWalls}
                onChange={(event) => updatePref('orthoWalls', event.target.checked)}
                className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
              />
              Orthogonal plan walls
            </label>

            <div className="grid grid-cols-2 gap-2">
              {NUMBER_PREFS.map(([key, label]) => (
                <label key={key} className="text-xs text-gray-400">
                  {label}
                  <InchInput
                    value={prefs[key]}
                    onCommit={(value) => value <= 0 ? false : updatePref(key, value)}
                    aria-label={label}
                    className="mt-1"
                  />
                </label>
              ))}
            </div>
          </div>

          {shopStandards ? (
            <div>
              <p className="mb-2 text-xs font-medium text-gray-300">Default height profile</p>
              <div className="grid grid-cols-2 gap-2">
                {PROFILE_SETTINGS.map(([key, label]) => {
                  const fromProfile = (key === 'crownHeight' && Boolean(moldings.crown))
                    || (key === 'topMoldHeight' && Boolean(moldings.topMold && !moldings.topMold.profile.stretch));
                  return (
                    <label key={key} className="text-xs text-gray-400">
                      {label}
                      <InchInput
                        value={fromProfile ? resolvedProfile[key] : settings.defaultProfile[key] ?? resolvedProfile[key]}
                        readOnly={fromProfile}
                        onCommit={(value) => fromProfile ? undefined : update({ defaultProfile: { [key]: value } })}
                        aria-label={`Default ${label}`}
                        className="mt-1"
                      />
                      {fromProfile && <span className="mt-1 block text-xs text-gray-500">from profile</span>}
                    </label>
                  );
                })}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
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
                {resolvedProfile.baseKind === 'furniture_base' && (
                  <label className="block text-xs text-gray-400">
                    Base proud
                    <InchInput
                      aria-label="Default Base proud"
                      value={settings.defaultProfile.furnitureBaseProud ?? resolvedProfile.furnitureBaseProud}
                      onCommit={(value) => value !== null && value < 0 ? false : update({ defaultProfile: { furnitureBaseProud: value } })}
                      className="mt-1"
                    />
                  </label>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[
                  ['topMoldProfileId', 'Top mold profile', 'top_mold'],
                  ['crownProfileId', 'Crown profile', 'crown'],
                  ['nosingProfileId', 'Nosing profile', 'nosing'],
                  ...(resolvedProfile.baseKind === 'furniture_base'
                    ? [['furnitureBaseProfileId', 'Furniture base profile', 'furniture_base'],
                      ['baseCutoutProfileId', 'Cutout profile', 'base_cutout']] : []),
                ].map(([key, label, kind]) => {
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
                })}
              </div>
              <p className={`mt-2 text-xs ${overlap < 0 ? 'text-amber-500/80' : 'text-gray-500'}`}>
                {overlap < 0 ? 'Gap' : 'Overlap'} {formatInches(Math.abs(overlap))}
              </p>
              {[...moldings.warnings, ...base.warnings].map(({ code, slot }, index) => (
                <p key={`${code}-${slot ?? index}`} className="mt-1 text-xs text-amber-400">
                  {code === 'crown-gap'
                    ? `The top mold doesn't reach the crown (gap of ${formatInches(Math.abs(overlap))}).`
                    : MOLDING_NOTES[code]}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              Shop standards are on the{' '}
              <Link to="/settings" className="text-blue-400 hover:underline">Settings</Link> page.
            </p>
          )}

        </div>
      )}
    </section>
  );
}
