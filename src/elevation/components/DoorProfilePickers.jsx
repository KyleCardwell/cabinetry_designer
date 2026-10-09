import { useSelector } from 'react-redux';
import { DOOR_PROFILE_SLOTS } from '../model/doorStyles.js';
import { doorProfileChoices } from '../model/sectionProfiles.js';

const SLOT_LABELS = {
  outside: 'Outside edge',
  inside: 'Inside profile',
  panel: 'Raised panel',
  applied: 'Applied molding',
};
const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

export default function DoorProfilePickers({ draft, setDraft, design }) {
  const profiles = useSelector((state) => state.elevation.settings.sectionProfiles);
  const pickProfile = (slot, id) => setDraft((previous) => ({
    ...previous,
    profiles: { ...previous.profiles, [slot]: id },
  }));

  return (
    <div className="space-y-2">
      {DOOR_PROFILE_SLOTS.map((slot) => {
        const usable = Boolean(design?.slots.includes(slot));
        return (
          <label key={slot} className={`block text-xs text-gray-400 ${usable ? '' : 'opacity-50'}`}>
            {SLOT_LABELS[slot]}
            <select
              className={`mt-1 ${INPUT_CLASS}`}
              aria-label={SLOT_LABELS[slot]}
              disabled={!usable}
              value={draft.profiles?.[slot] ?? ''}
              onChange={(event) => pickProfile(slot, event.target.value === '' ? null : event.target.value)}
            >
              {doorProfileChoices(profiles, slot, draft.profiles?.[slot] ?? null).map(({ id, name, note }) => (
                <option key={id ?? ''} value={id ?? ''}>{note ? `${name} (${note})` : name}</option>
              ))}
            </select>
          </label>
        );
      })}
      <p className="text-xs text-gray-400">
        Pick from the profile library. To make or change a profile, go to Library → Profiles.
      </p>
      {DOOR_PROFILE_SLOTS.some((slot) => !design?.slots.includes(slot)) && (
        <p className="text-xs text-gray-400">Greyed slots aren't used by this design — kept if you switch back.</p>
      )}
    </div>
  );
}
