import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DOOR_PROFILE_SLOTS } from '../model/doorStyles.js';
import { doorProfileChoices, doorProfileSlotKind } from '../model/sectionProfiles.js';
import { addSectionProfile, deleteSectionProfile } from '../store/elevationSlice.js';
import ProfileEditorOverlay from '../../library/profileEditor/ProfileEditorOverlay.jsx';

const SLOT_LABELS = {
  outside: 'Outside edge',
  inside: 'Inside profile',
  panel: 'Raised panel',
  applied: 'Applied molding',
};
const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';

export default function DoorProfilePickers({ draft, setDraft, design, onEditorChange }) {
  const profiles = useSelector((state) => state.elevation.settings.sectionProfiles);
  const dispatch = useDispatch();
  const [editing, setEditing] = useState(null);
  const open = (next) => {
    setEditing(next);
    onEditorChange?.(true);
  };
  const pickProfile = (slot, id) => setDraft((previous) => ({
    ...previous,
    profiles: { ...previous.profiles, [slot]: id },
  }));
  const close = ({ saved }) => {
    if (editing.created) {
      if (saved) pickProfile(editing.slot, editing.profileId);
      else dispatch(deleteSectionProfile({ profileId: editing.profileId }));
    }
    setEditing(null);
    onEditorChange?.(false);
  };

  return (
    <div className="space-y-2">
      {DOOR_PROFILE_SLOTS.map((slot) => {
        const usable = Boolean(design?.slots.includes(slot));
        const pick = draft.profiles?.[slot] ?? null;
        const editable = typeof pick === 'string' && profiles.some((profile) => profile.id === pick);
        return (
          <label key={slot} className={`block text-xs text-gray-400 ${usable ? '' : 'opacity-50'}`}>
            {SLOT_LABELS[slot]}
            <div className="mt-1 flex gap-2">
              <select
                className={`flex-1 ${INPUT_CLASS}`}
                aria-label={SLOT_LABELS[slot]}
                disabled={!usable}
                value={draft.profiles?.[slot] ?? ''}
                onChange={(event) => pickProfile(slot, event.target.value === '' ? null : event.target.value)}
              >
                {doorProfileChoices(profiles, slot, draft.profiles?.[slot] ?? null).map(({ id, name, note }) => (
                  <option key={id ?? ''} value={id ?? ''}>{note ? `${name} (${note})` : name}</option>
                ))}
              </select>
              <button
                type="button"
                className={`${BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
                disabled={!usable}
                onClick={() => {
                  const action = addSectionProfile({ kind: doorProfileSlotKind(slot) });
                  dispatch(action);
                  open({ slot, profileId: action.payload.id, created: true });
                }}
              >
                New…
              </button>
              <button
                type="button"
                className={`${BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
                disabled={!usable || !editable}
                onClick={() => open({ slot, profileId: pick, created: false })}
              >
                Edit…
              </button>
            </div>
          </label>
        );
      })}
      <p className="text-xs text-gray-400">
        Doors still draw with square edges until profiles are drawn on doors. New and Edit open the profile editor; a new profile closed without saving is removed.
      </p>
      {DOOR_PROFILE_SLOTS.some((slot) => !design?.slots.includes(slot)) && (
        <p className="text-xs text-gray-400">Greyed slots aren't used by this design — kept if you switch back.</p>
      )}
      {editing && <ProfileEditorOverlay profileId={editing.profileId} backLabel="← Door style" onClose={close} />}
    </div>
  );
}
