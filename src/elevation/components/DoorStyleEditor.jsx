import { useEffect, useId, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { isDoorStyle } from '../model/doorStyles.js';
import { updateDoorStyle } from '../store/elevationSlice.js';
import DoorStyleFields from './DoorStyleFields.jsx';

const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';

export default function DoorStyleEditor({ room, styleId, onClose }) {
  const dispatch = useDispatch();
  const settings = useSelector((state) => state.elevation.settings);
  const [draft, setDraft] = useState(() => structuredClone(room.doorStyles.find((style) => style.id === styleId)));
  const titleId = useId();
  const panelRef = useRef(null);
  const duplicateLabel = room.doorStyles.some((style) => style.id !== styleId && style.label === draft.label);
  const reason = duplicateLabel ? 'Label already used' : !isDoorStyle(draft) ? 'Every size must be more than 0' : '';
  const change = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }));

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
        const controls = panel.querySelectorAll('input:not(:disabled), select:not(:disabled), button:not(:disabled)');
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
        className="w-[64rem] max-w-[95vw] max-h-[90vh] overflow-y-auto rounded border border-gray-700 bg-gray-800 p-5"
      >
        <h2 id={titleId} className="mb-4 text-lg font-semibold text-gray-100">Door style {draft.label}</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-gray-400">
              Label
              <input
                required
                value={draft.label}
                onChange={(event) => change('label', event.target.value)}
                aria-label="Label"
                className={`mt-1 ${INPUT_CLASS}`}
              />
            </label>
            <label className="block text-xs text-gray-400">
              Name
              <input
                value={draft.name ?? ''}
                onChange={(event) => {
                  const name = event.target.value;
                  setDraft((previous) => {
                    const next = { ...previous };
                    if (name.trim()) next.name = name;
                    else delete next.name;
                    return next;
                  });
                }}
                aria-label="Name"
                className={`mt-1 ${INPUT_CLASS}`}
              />
            </label>
          </div>
          <DoorStyleFields
            draft={draft}
            setDraft={setDraft}
            designs={settings.doorDesigns}
          />
          {reason && <p role="status" className="text-xs text-red-400">{reason}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={BUTTON_CLASS} onClick={onClose}>Cancel</button>
            <button
              type="button"
              disabled={Boolean(reason)}
              className={`${BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
              onClick={() => {
                if (reason) return;
                dispatch(updateDoorStyle({ roomId: room.id, styleId, style: draft }));
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
