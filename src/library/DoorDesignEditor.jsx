import { useEffect, useId, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { DESIGN_SLOTS, SEEDED_DESIGN_IDS, isDoorDesignList } from '../elevation/model/doorDesigns.js';
import { DOOR_CONSTRUCTIONS, RAIL_SHAPES } from '../elevation/model/doorStyles.js';
import { updateDoorDesign } from '../elevation/store/elevationSlice.js';

const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const CONSTRUCTION_LABELS = {
  five_piece: '5-piece',
  slab: 'Slab',
  slab_applied: 'Slab + applied molding',
};

export default function DoorDesignEditor({ design, designs, onClose }) {
  const dispatch = useDispatch();
  const [draft, setDraft] = useState(() => structuredClone(design));
  const titleId = useId();
  const panelRef = useRef(null);
  const seeded = SEEDED_DESIGN_IDS.includes(design.id);
  const arched = draft.topRail.shape !== 'flat' || draft.bottomRail.shape !== 'flat';
  const savedDesign = {
    ...draft,
    code: draft.code.trim(),
    vendor: (draft.vendor ?? '').trim() || null,
    description: draft.description.trim(),
    slots: DESIGN_SLOTS[draft.construction],
  };
  const duplicateCode = designs.some((entry) => entry.id !== design.id
    && entry.code.toLowerCase() === savedDesign.code.toLowerCase());
  const reason = !savedDesign.code ? 'Code is required'
    : duplicateCode ? 'Code already used'
      : !isDoorDesignList(designs.map((entry) => entry.id === design.id ? savedDesign : entry))
        ? 'Not a valid design' : '';
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
        <h2 id={titleId} className="mb-4 text-lg font-semibold text-gray-100">Door design {design.code}</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-gray-400">
              Code
              <input required value={draft.code} onChange={(event) => change('code', event.target.value)} aria-label="Code" className={`mt-1 ${INPUT_CLASS}`} />
            </label>
            <label className="block text-xs text-gray-400">
              Vendor (optional)
              <input value={draft.vendor ?? ''} onChange={(event) => change('vendor', event.target.value)} aria-label="Vendor" className={`mt-1 ${INPUT_CLASS}`} />
            </label>
          </div>
          <label className="block text-xs text-gray-400">
            Description
            <textarea value={draft.description} onChange={(event) => change('description', event.target.value)} aria-label="Description" rows={3} className={`mt-1 ${INPUT_CLASS}`} />
          </label>
          <label className={`block text-xs text-gray-400 ${seeded ? 'opacity-50' : ''}`}>
            Construction
            <select value={draft.construction} disabled={seeded} onChange={(event) => change('construction', event.target.value)} aria-label="Construction" className={`mt-1 ${INPUT_CLASS}`}>
              {DOOR_CONSTRUCTIONS.map((construction) => (
                <option key={construction} value={construction}>{CONSTRUCTION_LABELS[construction]}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            {[['topRail', 'Top rail'], ['bottomRail', 'Bottom rail']].map(([key, label]) => (
              <label key={key} className={`block text-xs text-gray-400 ${seeded ? 'opacity-50' : ''}`}>
                {label}
                <select value={draft[key].shape} disabled={seeded} onChange={(event) => change(key, { shape: event.target.value })} aria-label={label} className={`mt-1 ${INPUT_CLASS}`}>
                  {RAIL_SHAPES.map((shape) => (
                    <option key={shape} value={shape}>{shape[0].toUpperCase()}{shape.slice(1)}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {arched && <p className="text-xs text-gray-400">Drawn flat until arched rails are added.</p>}
          {seeded && <p className="text-xs text-gray-400">Built-in design: only the code, vendor and description can change.</p>}
          <p className="text-xs text-gray-400">Profile slots: {DESIGN_SLOTS[draft.construction].join(', ')}</p>
          {reason && <p role="status" className="text-xs text-red-400">{reason}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={BUTTON_CLASS} onClick={onClose}>Cancel</button>
            <button
              type="button"
              disabled={Boolean(reason)}
              className={`${BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
              onClick={() => {
                if (reason) return;
                dispatch(updateDoorDesign({ designId: design.id, design: savedDesign }));
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
