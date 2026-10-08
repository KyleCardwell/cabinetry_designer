import { useEffect, useId, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { PROFILE_TAG_LABELS, isProfileTag, normalizeProfileTags } from '../elevation/model/sectionProfiles.js';
import { updateSectionProfile } from '../elevation/store/elevationSlice.js';

const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const KNOWN_TAGS = Object.keys(PROFILE_TAG_LABELS);

export default function ProfileDetailsDialog({ profile, onClose }) {
  const dispatch = useDispatch();
  const [name, setName] = useState(profile.name);
  const [checkedTags, setCheckedTags] = useState(() => profile.tags.filter((tag) => KNOWN_TAGS.includes(tag)));
  const [other, setOther] = useState(() => profile.tags.filter((tag) => !KNOWN_TAGS.includes(tag)).join(', '));
  const titleId = useId();
  const panelRef = useRef(null);
  const knownTags = KNOWN_TAGS.filter((tag) => checkedTags.includes(tag));
  const tags = [...knownTags, ...normalizeProfileTags(other).filter((tag) => !knownTags.includes(tag))];
  const reason = !name.trim() ? 'Name is required'
    : tags.some((tag) => !isProfileTag(tag)) ? 'Tags can use lowercase letters, numbers and single underscores' : '';
  const attachPoints = Object.entries(profile.attach).map(([key, point]) => `${key} → ${point}`).join(', ');

  useEffect(() => {
    const previousFocus = document.activeElement;
    const panel = panelRef.current;
    panel.querySelector('input')?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Tab') {
        const controls = panel.querySelectorAll('input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)');
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-[36rem] max-h-[90vh] overflow-y-auto rounded border border-gray-700 bg-gray-800 p-5"
      >
        <h2 id={titleId} className="mb-4 text-lg font-semibold text-gray-100">Profile details</h2>
        <div className="space-y-4">
          <label className="block text-xs text-gray-400">
            Name
            <input required value={name} onChange={(event) => setName(event.target.value)} aria-label="Name" className={`mt-1 ${INPUT_CLASS}`} />
          </label>
          <fieldset>
            <legend className="mb-2 text-xs text-gray-400">Tags</legend>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(PROFILE_TAG_LABELS).map(([tag, label]) => (
                <label key={tag} className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={checkedTags.includes(tag)}
                    onChange={(event) => {
                      setCheckedTags((previous) => event.target.checked
                        ? [...previous, tag] : previous.filter((entry) => entry !== tag));
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-xs text-gray-400">
            Other tags
            <input value={other} onChange={(event) => setOther(event.target.value)} aria-label="Other tags" placeholder="e.g. shop_bead, ogee" className={`mt-1 ${INPUT_CLASS}`} />
          </label>
          <p className="text-xs text-gray-500">Version {profile.version} · {Object.keys(profile.geometry.points).length} points · {profile.geometry.loops.length} loops</p>
          <p className="text-xs text-gray-500">{attachPoints || 'No attach points'}</p>
          <p className="text-xs text-gray-500">The shape, attach points and drawn points are edited in the profile editor (next round).</p>
          {reason && <p role="status" className="text-xs text-red-400">{reason}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={BUTTON_CLASS} onClick={onClose}>Cancel</button>
            <button
              type="button"
              disabled={Boolean(reason)}
              className={`${BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
              onClick={() => {
                if (reason) return;
                dispatch(updateSectionProfile({ profileId: profile.id, profile: { ...profile, name: name.trim(), tags } }));
                onClose();
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
