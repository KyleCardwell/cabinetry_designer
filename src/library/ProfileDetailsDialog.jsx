import { useEffect, useId, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { PIN_LABELS, PROFILE_KINDS } from '../elevation/model/sectionProfiles.js';
import { setProfileKind } from '../elevation/model/profileEditing.js';
import { updateSectionProfile } from '../elevation/store/elevationSlice.js';

const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';

export default function ProfileDetailsDialog({ profile, onClose, showKind = true }) {
  const dispatch = useDispatch();
  const [name, setName] = useState(profile.name);
  const [kind, setKind] = useState(profile.kind);
  const titleId = useId();
  const panelRef = useRef(null);
  const reason = !name.trim() ? 'Name is required' : '';
  const pinPoints = PROFILE_KINDS[kind].pins
    .map((pin) => `${PIN_LABELS[pin]} → ${profile.attach[pin] ?? 'not set'}`).join(', ');

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
          {showKind && (
            <>
              <label className="block text-xs text-gray-400">
                Kind
                <select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Kind" className={`mt-1 ${INPUT_CLASS}`}>
                  {Object.entries(PROFILE_KINDS).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-gray-500">The kind sets which way the shape is drawn and which pin points it needs. To use the same shape as another kind, Copy it and change the copy&apos;s kind.</p>
              {kind !== profile.kind && <p className="text-xs text-amber-300">Changing the kind clears pin points the new kind doesn&apos;t use.</p>}
            </>
          )}
          <p className="text-xs text-gray-500">Version {profile.version} · {Object.keys(profile.geometry.points).length} points · {profile.geometry.loops.length} loops</p>
          <p className="text-xs text-gray-500">{kind === 'other' ? 'Other profiles have no pin points.' : `Pin points: ${pinPoints}`}</p>
          <p className="text-xs text-gray-500">The shape, pin points and drawn points are edited with Edit shape.</p>
          {reason && <p role="status" className="text-xs text-red-400">{reason}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={BUTTON_CLASS} onClick={onClose}>Cancel</button>
            <button
              type="button"
              disabled={Boolean(reason)}
              className={`${BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
              onClick={() => {
                if (reason) return;
                const base = { ...profile, name: name.trim() };
                const next = showKind ? setProfileKind(base, kind) : base;
                if (next !== null) {
                  dispatch(updateSectionProfile({ profileId: profile.id, profile: next }));
                  onClose();
                }
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
