import { useEffect, useId, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { BUILT_IN_PULL_IDS, PULL_KINDS, PULL_SIZE_KEYS, defaultPullSizes, isPullList } from '../elevation/model/pulls.js';
import { updatePull } from '../elevation/store/elevationSlice.js';
import InchInput from '../elevation/components/InchInput.jsx';
import PricingFields from './PricingFields.jsx';

const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const KIND_LABELS = { pull: 'Pull', knob: 'Knob', tab: 'Tab' };
const SIZE_LABELS = { length: 'Length', centers: 'Centers', width: 'Width', diameter: 'Diameter', height: 'Height', projection: 'Projection' };

export default function PullEditor({ pull, pulls, services = [], onClose }) {
  const dispatch = useDispatch();
  const [draft, setDraft] = useState(() => structuredClone(pull));
  const titleId = useId();
  const panelRef = useRef(null);
  const builtIn = BUILT_IN_PULL_IDS.includes(pull.id);
  const savedPull = { ...draft, name: draft.name.trim() };
  const duplicateName = pulls.some((entry) => entry.id !== pull.id
    && entry.name.toLowerCase() === savedPull.name.toLowerCase());
  const reason = !savedPull.name ? 'Name is required'
    : duplicateName ? 'Name already used'
      : savedPull.kind === 'pull' && savedPull.centers > savedPull.length ? "Centers can't be longer than the pull"
        : !isPullList(pulls.map((entry) => entry.id === pull.id ? savedPull : entry))
          ? 'Not a valid pull' : '';
  const change = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }));
  const changeKind = (kind) => setDraft((previous) => ({
    id: previous.id,
    name: previous.name,
    kind,
    ...defaultPullSizes(kind),
    projection: previous.projection,
    hardwarePullId: previous.hardwarePullId,
    price: previous.price,
    actualCost: previous.actualCost,
    labor: previous.labor,
  }));
  const changeSize = (key, value) => {
    if (value === null ? key !== 'centers' : !Number.isFinite(value) || value <= 0) return false;
    setDraft((previous) => {
      const next = { ...previous };
      if (value === null) delete next[key];
      else next[key] = value;
      return next;
    });
    return true;
  };

  // Dialog focus handling follows DoorDesignEditor.
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
        <h2 id={titleId} className="mb-4 text-lg font-semibold text-gray-100">Pull {pull.name}</h2>
        <div className="space-y-4">
          <label className="block text-xs text-gray-400">
            Name
            <input required value={draft.name} onChange={(event) => change('name', event.target.value)} aria-label="Name" className={`mt-1 ${INPUT_CLASS}`} />
          </label>
          <label className={`block text-xs text-gray-400 ${builtIn ? 'opacity-50' : ''}`}>
            Kind
            <select value={draft.kind} disabled={builtIn} onChange={(event) => changeKind(event.target.value)} aria-label="Kind" className={`mt-1 ${INPUT_CLASS}`}>
              {PULL_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            {[...PULL_SIZE_KEYS[draft.kind], 'projection'].map((key) => (
              <label key={key} className="block text-xs text-gray-400">
                {SIZE_LABELS[key]}{key === 'centers' ? ' (optional)' : ''}
                <InchInput
                  value={draft[key] ?? null}
                  allowBlank={key === 'centers'}
                  required={key !== 'centers'}
                  onCommit={(value) => changeSize(key, value)}
                  aria-label={SIZE_LABELS[key]}
                  className="mt-1"
                />
              </label>
            ))}
          </div>
          <PricingFields value={{ price: draft.price, actualCost: draft.actualCost, labor: draft.labor }}
            onChange={(value) => setDraft((previous) => ({ ...previous, ...value }))}
            showPricing={false} unitLabel="each" services={services} />
          {reason && <p role="status" className="text-xs text-red-400">{reason}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={BUTTON_CLASS} onClick={onClose}>Cancel</button>
            <button
              type="button"
              disabled={Boolean(reason)}
              className={`${BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
              onClick={() => {
                if (reason) return;
                dispatch(updatePull({ pullId: pull.id, pull: savedPull }));
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
