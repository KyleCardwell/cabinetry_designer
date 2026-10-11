import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { counterTop, crownOverlap, moldingStack, resolveProfile } from '../model/profile.js';
import { formatInches, formatInchesInput } from '../model/units.js';
import {
  updateRoomProfile,
  useAutoHeightsForRoom,
} from '../store/elevationSlice.js';
import { moldingProfiles } from '../model/moldingProfiles.js';
import InchInput from './InchInput.jsx';

const MOLDING_NOTES = {
  'top-mold-above-crown': 'The top mold is taller than the crown total.',
  'top-mold-too-short': "The top mold is shorter than its profile's stretch line; drawn at its own size.",
  'molding-profile-missing': 'The picked profile is missing; plain molding used.',
  'molding-profile-open': 'The picked profile has no closed shape; plain molding used.',
};

const PROFILE_FIELDS = [
  ['wallHeight', 'Wall height'],
  ['toeKickHeight', 'Toe kick height'],
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
  const { rooms, activeRoomId, settings } = useSelector((state) => state.elevation);
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  const [open, setOpen] = useState(true);

  if (!room) return null;
  const inheritedProfile = resolveProfile(settings);
  const resolvedProfile = resolveProfile(settings, room);
  const moldings = moldingProfiles(resolvedProfile, settings);
  const overlap = crownOverlap(resolvedProfile);

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
              return (
                <label key={key} className="text-xs text-gray-400">
                  {label}
                  <InchInput
                    value={fromProfile ? resolvedProfile[key] : room.profile[key] ?? null}
                    allowBlank
                    placeholder={formatInchesInput(inheritedProfile[key])}
                    readOnly={fromProfile}
                    onCommit={(value) => fromProfile ? undefined : dispatch(updateRoomProfile({ roomId: room.id, key, value }))}
                    aria-label={`Room ${label}`}
                    className="mt-1"
                  />
                  {fromProfile && <span className="mt-1 block text-xs text-gray-500">from profile</span>}
                </label>
              );
            })}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              ['topMoldProfileId', 'Top mold profile', 'top_mold'],
              ['crownProfileId', 'Crown profile', 'crown'],
            ].map(([key, label, kind]) => {
              const pickedId = room.profile[key];
              const choices = (settings.sectionProfiles ?? []).filter((entry) => entry.kind === kind && !entry.archived);
              const unavailable = pickedId && !choices.some((entry) => entry.id === pickedId);
              return (
                <label key={key} className="block text-xs text-gray-400">
                  {label}
                  <select
                    aria-label={`Room ${label}`}
                    value={pickedId === null ? 'plain' : pickedId ?? ''}
                    onChange={(event) => {
                      const value = event.target.value === 'plain' ? null : event.target.value || undefined;
                      dispatch(updateRoomProfile({ roomId: room.id, key, value }));
                    }}
                    className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Inherit</option>
                    <option value="plain">Plain</option>
                    {choices.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                    {unavailable && <option value={pickedId} disabled>{settings.sectionProfiles?.find((entry) => entry.id === pickedId)?.name ?? 'Missing profile'} (unavailable)</option>}
                  </select>
                </label>
              );
            })}
          </div>
          <p className={`text-xs ${overlap < 0 ? 'text-amber-500/80' : 'text-gray-500'}`}>
            {overlap < 0 ? 'Gap' : 'Overlap'} {formatInches(Math.abs(overlap))}
          </p>
          {moldings.warnings.map(({ code, slot }, index) => (
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
