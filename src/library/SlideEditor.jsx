import { useEffect, useId, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { BUILT_IN_SLIDE_IDS, SLIDE_MOUNTS, isSlideList } from '../elevation/model/slides.js';
import { updateSlide } from '../elevation/store/elevationSlice.js';
import InchInput from '../elevation/components/InchInput.jsx';

const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const MOUNT_LABELS = { undermount: 'Undermount', side: 'Side mount' };
const TEXT_LABELS = { name: 'Name', brand: 'Brand', model: 'Model', description: 'Description' };
const SIZE_LABELS = { sideClearance: 'Side clearance (per side)', minBelow: 'Min below', minAbove: 'Min above', height: 'Slide height' };
const LENGTH_LABELS = { nominal: 'Nominal', length: 'Length', extension: 'Extension' };
const FLAG_LABELS = { clips: 'Clips', softClose: 'Soft close', heavyDuty: 'Heavy duty' };

export default function SlideEditor({ slide, slides, onClose }) {
  const dispatch = useDispatch();
  const [draft, setDraft] = useState(() => structuredClone(slide));
  const titleId = useId();
  const panelRef = useRef(null);
  const builtIn = BUILT_IN_SLIDE_IDS.includes(slide.id);
  const savedSlide = {
    ...draft,
    ...Object.fromEntries(Object.keys(TEXT_LABELS).map((key) => [key, draft[key].trim()])),
    lengths: [...draft.lengths].sort((a, b) => a.nominal - b.nominal),
  };
  const duplicateName = slides.some((entry) => entry.id !== slide.id
    && entry.name.toLowerCase() === savedSlide.name.toLowerCase());
  const duplicateLength = new Set(draft.lengths.map(({ nominal }) => nominal)).size !== draft.lengths.length;
  const reason = !savedSlide.name ? 'Name is required'
    : duplicateName ? 'Name already used'
      : duplicateLength ? 'Each length can only be listed once'
        : !isSlideList(slides.map((entry) => entry.id === slide.id ? savedSlide : entry))
          ? 'Not a valid slide' : '';
  const change = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }));
  const changeSize = (key, value) => {
    if (!Number.isFinite(value) || (key === 'height' ? value <= 0 : value < 0)) return false;
    change(key, value);
    return true;
  };
  const changeLength = (index, key, value) => {
    if (value === null ? key === 'nominal' : !Number.isFinite(value) || value <= 0) return false;
    setDraft((previous) => ({
      ...previous,
      lengths: previous.lengths.map((entry, row) => {
        if (row !== index) return entry;
        const next = { ...entry };
        if (value === null) delete next[key];
        else next[key] = value;
        return next;
      }),
    }));
    return true;
  };
  const addLength = () => setDraft((previous) => {
    if (previous.lengths.length >= 40) return previous;
    const sorted = [...previous.lengths].sort((a, b) => a.nominal - b.nominal);
    const last = sorted.at(-1).nominal;
    const gap = sorted.length > 1 ? last - sorted.at(-2).nominal : 1;
    return { ...previous, lengths: [...previous.lengths, { nominal: last + gap }] };
  });

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
        <h2 id={titleId} className="mb-4 text-lg font-semibold text-gray-100">Slide {slide.name}</h2>
        <div className="space-y-4">
          {Object.entries(TEXT_LABELS).map(([key, label]) => (
            <label key={key} className="block text-xs text-gray-400">
              {label}
              <input
                required={key === 'name'}
                maxLength={key === 'name' ? undefined : 120}
                value={draft[key]}
                onChange={(event) => change(key, event.target.value)}
                aria-label={label}
                className={`mt-1 ${INPUT_CLASS}`}
              />
            </label>
          ))}
          <label className={`block text-xs text-gray-400 ${builtIn ? 'opacity-50' : ''}`}>
            Mount
            <select value={draft.mount} disabled={builtIn} onChange={(event) => change('mount', event.target.value)} aria-label="Mount" className={`mt-1 ${INPUT_CLASS}`}>
              {SLIDE_MOUNTS.map((mount) => <option key={mount} value={mount}>{MOUNT_LABELS[mount]}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(SIZE_LABELS).map(([key, label]) => (
              <label key={key} className="block text-xs text-gray-400">
                {label}
                <InchInput
                  value={draft[key]}
                  required
                  displayStep={1 / 64}
                  onCommit={(value) => changeSize(key, value)}
                  aria-label={label}
                  className="mt-1"
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            {Object.entries(FLAG_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={draft[key]} onChange={(event) => change(key, event.target.checked)} aria-label={label} />
                {label}
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-100">Lengths</h3>
            <p className="text-xs text-gray-400">Length and Extension are optional.</p>
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="text-xs text-gray-400">
                <tr>
                  {['Nominal', 'Length', 'Extension', 'Actions'].map((label) => (
                    <th key={label} scope="col" className="px-1 py-2 font-medium">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draft.lengths.map((entry, index) => (
                  <tr key={index}>
                    {Object.entries(LENGTH_LABELS).map(([key, label]) => (
                      <td key={key} className="p-1">
                        <InchInput
                          value={entry[key] ?? null}
                          allowBlank={key !== 'nominal'}
                          required={key === 'nominal'}
                          displayStep={1 / 64}
                          onCommit={(value) => changeLength(index, key, value)}
                          aria-label={`${label} ${index + 1}`}
                        />
                      </td>
                    ))}
                    <td className="p-1">
                      <button
                        type="button"
                        className={`${BUTTON_CLASS} disabled:opacity-50`}
                        disabled={draft.lengths.length === 1}
                        aria-label={`Remove length ${index + 1}`}
                        onClick={() => {
                          if (draft.lengths.length > 1) change('lengths', draft.lengths.filter((_, row) => row !== index));
                        }}
                      >Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className={`${BUTTON_CLASS} disabled:opacity-50`} disabled={draft.lengths.length >= 40} onClick={addLength}>Add length</button>
          </div>
          {reason && <p role="status" className="text-xs text-red-400">{reason}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={BUTTON_CLASS} onClick={onClose}>Cancel</button>
            <button
              type="button"
              disabled={Boolean(reason)}
              className={`${BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
              onClick={() => {
                if (reason) return;
                dispatch(updateSlide({ slideId: slide.id, slide: savedSlide }));
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
