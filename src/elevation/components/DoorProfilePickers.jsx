import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { DOOR_PROFILE_SLOTS } from '../model/doorStyles.js';
import { addAppliedMolding, removeAppliedMolding, updateAppliedMolding } from '../model/doorStyleEdits.js';
import { doorProfileChoices } from '../model/sectionProfiles.js';
import { formatInchesInput, parseInches } from '../model/units.js';

const SLOT_LABELS = {
  outside: 'Outside edge',
  inside: 'Inside profile',
  panel: 'Raised panel',
};
const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

function displayOffset(value) {
  const fraction = formatInchesInput(value);
  return parseInches(fraction) === value ? fraction : String(value);
}

function MoldingOffsetInput({ value, onChange, ...inputProps }) {
  const [text, setText] = useState(() => displayOffset(value));
  useEffect(() => {
    // Keep the text being typed when it already represents the new draft value.
    setText((previous) => (parseInches(previous) === value ? previous : displayOffset(value)));
  }, [value]);

  return (
    <input
      {...inputProps}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const parsed = parseInches(next);
        if (Number.isFinite(parsed)) onChange(parsed);
      }}
      onBlur={() => setText(displayOffset(value))}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
      }}
    />
  );
}

export default function DoorProfilePickers({ draft, setDraft, design }) {
  const profiles = useSelector((state) => state.elevation.settings.sectionProfiles);
  const moldings = draft.appliedMoldings ?? [];
  const appliedUsable = Boolean(design?.slots.includes('applied'));
  const editMolding = (index, changes) => setDraft((previous) => updateAppliedMolding(previous, index, changes));
  const pickProfile = (slot, id) => setDraft((previous) => ({
    ...previous, profiles: { ...previous.profiles, [slot]: id },
  }));

  return (
    <div className="space-y-2">
      {DOOR_PROFILE_SLOTS.filter((slot) => slot !== 'applied').map((slot) => {
        const usable = Boolean(design?.slots.includes(slot));
        const profileId = draft.profiles?.[slot];
        return (
          <label key={slot} className={`block text-xs text-gray-400 ${usable ? '' : 'opacity-50'}`}>
            {SLOT_LABELS[slot]}
            <select
              className={`mt-1 ${INPUT_CLASS}`}
              aria-label={SLOT_LABELS[slot]}
              disabled={!usable}
              value={profileId ?? ''}
              onChange={(event) => pickProfile(slot, event.target.value === '' ? null : event.target.value)}
            >
              {doorProfileChoices(profiles, slot, profileId ?? null).map(({ id, name, note }) => (
                <option key={id ?? ''} value={id ?? ''}>{note ? `${name} (${note})` : name}</option>
              ))}
            </select>
          </label>
        );
      })}
      <fieldset disabled={!appliedUsable} className={`min-w-0 space-y-2 ${appliedUsable ? '' : 'opacity-50'}`}>
        <legend className="text-xs text-gray-400">Applied moldings</legend>
        {moldings.map((molding, index) => (
          <div key={index} className="flex items-end gap-2">
            <label className="min-w-0 flex-1 text-xs text-gray-400">
              Profile
              <select
                className={`mt-1 ${INPUT_CLASS}`}
                aria-label={`Applied molding ${index + 1} profile`}
                value={molding.profileId ?? ''}
                onChange={(event) => editMolding(index, { profileId: event.target.value === '' ? null : event.target.value })}
              >
                {doorProfileChoices(profiles, 'applied', molding.profileId).map(({ id, name, note }) => (
                  <option key={id ?? ''} value={id ?? ''}>
                    {id === null ? 'Plain line' : note ? `${name} (${note})` : name}
                  </option>
                ))}
              </select>
            </label>
            <label className="w-24 text-xs text-gray-400">
              Offset (in)
              <MoldingOffsetInput
                className={`mt-1 ${INPUT_CLASS}`}
                aria-label={`Applied molding ${index + 1} offset`}
                value={molding.offset}
                onChange={(offset) => editMolding(index, { offset })}
              />
            </label>
            <button
              type="button"
              className="rounded px-2 py-1.5 text-sm text-gray-400 hover:text-gray-100"
              aria-label={`Remove applied molding ${index + 1}`}
              onClick={() => setDraft((previous) => removeAppliedMolding(previous, index))}
            >✕</button>
          </div>
        ))}
        <button
          type="button"
          className="text-xs text-blue-400 hover:underline disabled:opacity-50"
          disabled={!appliedUsable || moldings.length >= 6}
          onClick={() => setDraft(addAppliedMolding)}
        >Add molding</button>
        <p className="text-xs text-gray-400">
          {design?.construction === 'slab'
            ? "Offset from the door edge to the molding's outer edge."
            : 'Offset from the stile/rail line; + toward the centre.'}
        </p>
      </fieldset>
      <p className="text-xs text-gray-400">
        Pick from the profile library. To make or change a profile, go to Library → Profiles.
      </p>
      {DOOR_PROFILE_SLOTS.some((slot) => !design?.slots.includes(slot)) && (
        <p className="text-xs text-gray-400">Greyed slots aren't used by this design — kept if you switch back.</p>
      )}
    </div>
  );
}
