import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectSettings } from '../store/selectors.js';
import { counterTop, crownOverlap, moldingStack, resolveProfile } from '../model/profile.js';
import { formatInches } from '../model/units.js';
import { resolveSetting } from '../model/settingsResolve.js';
import {
  updateRoomProfile,
  useAutoHeightsForRoom,
} from '../store/elevationSlice.js';
import { CABINET_TYPE_IDS } from '../model/constants.js';
import { runBase } from '../model/furnitureBase.js';
import { moldingProfiles } from '../model/moldingProfiles.js';
import InchInput from './InchInput.jsx';
import OverrideField from './OverrideField.jsx';
import OverrideInput from './OverrideInput.jsx';

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

const PROFILE_FIELDS = [
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

export default function RoomHeightsPanel() {
  const dispatch = useDispatch();
  const { rooms, activeRoomId, settings: shopSettings } = useSelector((state) => state.elevation);
  const settings = useSelector(selectSettings);
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  const [open, setOpen] = useState(true);

  if (!room) return null;
  const inheritedProfile = resolveProfile(shopSettings);
  const resolvedProfile = resolveProfile(settings, room);
  const moldings = moldingProfiles(resolvedProfile, settings);
  const base = runBase(room, null, { cabinetTypeId: CABINET_TYPE_IDS.BASE }, settings);
  const overlap = crownOverlap(resolvedProfile);
  const inheritedSource = (key) => resolveSetting(`defaultProfile.${key}`, [{ level: 'team', values: shopSettings }]).source;

  return (
    <section className="border-t border-gray-700 pt-4">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-wide text-gray-300"
        aria-expanded={open}
      >
        Room heights
        <span className="text-gray-500" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {PROFILE_FIELDS.map(([key, label]) => {
              const fromProfile = (key === 'crownHeight' && Boolean(moldings.crown))
                || (key === 'topMoldHeight' && Boolean(moldings.topMold && !moldings.topMold.profile.stretch));
              return fromProfile ? (
                <label key={key} className="text-xs text-gray-400">
                  {label}
                  <InchInput
                    value={resolvedProfile[key]}
                    readOnly
                    onCommit={() => undefined}
                    aria-label={`Room ${label}`}
                    className="mt-1"
                  />
                  <span className="mt-1 block text-xs text-gray-500">from profile</span>
                </label>
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
                  onChange={(value) => dispatch(updateRoomProfile({ roomId: room.id, key, value }))}
                />
              );
            })}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
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
            {resolvedProfile.baseKind === 'furniture_base' && (
              <OverrideInput
                kind="number"
                label="Base proud"
                aria-label="Room Base proud"
                value={room.profile.furnitureBaseProud ?? null}
                inherited={inheritedProfile.furnitureBaseProud}
                source={inheritedSource('furnitureBaseProud')}
                onChange={(value) => value !== null && value < 0 ? false : dispatch(updateRoomProfile({ roomId: room.id, key: 'furnitureBaseProud', value }))}
              />
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
            })}
          </div>
          <p className={`text-xs ${overlap < 0 ? 'text-amber-500/80' : 'text-gray-500'}`}>
            {overlap < 0 ? 'Gap' : 'Overlap'} {formatInches(Math.abs(overlap))}
          </p>
          {[...moldings.warnings, ...base.warnings].map(({ code, slot }, index) => (
            <p key={`${code}-${slot ?? index}`} className="mt-1 text-xs text-amber-400">
              {code === 'crown-gap'
                ? `The top mold doesn't reach the crown (gap of ${formatInches(Math.abs(overlap))}).`
                : MOLDING_NOTES[code]}
            </p>
          ))}

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
            onClick={() => dispatch(useAutoHeightsForRoom({ roomId: room.id }))}
            className="w-full rounded bg-gray-700 px-3 py-2 text-xs font-medium text-gray-100 transition-colors hover:bg-gray-600"
          >
            Use auto heights for all runs
          </button>
        </div>
      )}
    </section>
  );
}
