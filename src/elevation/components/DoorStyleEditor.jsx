import { useEffect, useId, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { DOOR_DESIGNS, PANEL_TYPES, findDoorDesign, isDoorStyle } from '../model/doorStyles.js';
import { updateDoorStyle } from '../store/elevationSlice.js';
import InchInput from './InchInput.jsx';

const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const HEADING_CLASS = 'text-sm font-semibold text-gray-300';

function SizeField({ label, value, onChange, allowZero = false, disabled = false }) {
  return (
    <label className={`block text-xs text-gray-400 ${disabled ? 'opacity-50' : ''}`}>
      {label}
      <InchInput
        value={value}
        displayStep={1 / 16}
        disabled={disabled}
        onCommit={(next) => {
          if (!Number.isFinite(next) || (allowZero ? next < 0 : !(next > 0))) return false;
          onChange(next);
          return true;
        }}
        aria-label={label}
        className="mt-1"
      />
    </label>
  );
}

export default function DoorStyleEditor({ room, styleId, onClose }) {
  const dispatch = useDispatch();
  const [draft, setDraft] = useState(() => structuredClone(room.doorStyles.find((style) => style.id === styleId)));
  const titleId = useId();
  const panelRef = useRef(null);
  const design = findDoorDesign(draft.designId);
  const slab = design?.construction === 'slab';
  const fivePiece = design?.construction === 'five_piece';
  const applied = design?.construction === 'slab_applied';
  const arched = Boolean(design && (design.topRail.shape !== 'flat' || design.bottomRail.shape !== 'flat'));
  const duplicateLabel = room.doorStyles.some((style) => style.id !== styleId && style.label === draft.label);
  const reason = duplicateLabel ? 'Label already used' : !isDoorStyle(draft) ? 'Every size must be more than 0' : '';
  const change = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }));
  const changeSize = (group, key, value) => setDraft((previous) => ({
    ...previous,
    [group]: { ...previous[group], [key]: value },
  }));

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
        className="w-[36rem] max-h-[90vh] overflow-y-auto rounded border border-gray-700 bg-gray-800 p-5"
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
          <label className="block text-xs text-gray-400">
            Design
            <select
              value={draft.designId}
              onChange={(event) => change('designId', event.target.value)}
              aria-label="Design"
              className={`mt-1 ${INPUT_CLASS}`}
            >
              {DOOR_DESIGNS.map(({ id, code, description }) => (
                <option key={id} value={id}>{code} — {description}</option>
              ))}
            </select>
          </label>
          <SizeField label="Thickness" value={draft.thickness} onChange={(value) => change('thickness', value)} />
          <section className="space-y-2">
            <h3 className={HEADING_CLASS}>{applied ? 'Molding inset' : 'Stiles & rails'}</h3>
            {slab && <p className="text-xs text-gray-400">Not used by a slab — kept if you switch back</p>}
            <div className="grid grid-cols-2 gap-3">
              {[
                ['stiles', 'left', applied ? 'Left' : 'Left stile'],
                ['stiles', 'right', applied ? 'Right' : 'Right stile'],
                ['rails', 'top', applied ? 'Top' : 'Top rail'],
                ['rails', 'bottom', applied ? 'Bottom' : 'Bottom rail'],
              ].map(([group, key, label]) => (
                <SizeField
                  key={`${group}.${key}`}
                  label={label}
                  value={draft[group][key]}
                  disabled={slab}
                  onChange={(value) => changeSize(group, key, value)}
                />
              ))}
            </div>
          </section>
          <SizeField
            label="Mid rail/stile extra"
            value={draft.mid.extra}
            allowZero
            disabled={!fivePiece && !applied}
            onChange={(value) => changeSize('mid', 'extra', value)}
          />
          <section className="space-y-2">
            <h3 className={HEADING_CLASS}>Panel</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className={`block text-xs text-gray-400 ${fivePiece ? '' : 'opacity-50'}`}>
                Panel type
                <select
                  value={draft.panel.type}
                  disabled={!fivePiece}
                  onChange={(event) => changeSize('panel', 'type', event.target.value)}
                  aria-label="Panel type"
                  className={`mt-1 ${INPUT_CLASS}`}
                >
                  {PANEL_TYPES.map((type) => (
                    <option key={type} value={type}>{type === 'flat' ? 'Flat' : 'Raised'}</option>
                  ))}
                </select>
              </label>
              <SizeField
                label="Panel thickness"
                value={draft.panel.thickness}
                disabled={!fivePiece}
                onChange={(value) => changeSize('panel', 'thickness', value)}
              />
            </div>
          </section>
          <div className="space-y-1">
            <SizeField
              label="Arch rise"
              value={draft.arch.rise}
              disabled={!arched}
              onChange={(value) => changeSize('arch', 'rise', value)}
            />
            <p className="text-xs text-gray-400">For arched designs (46.3)</p>
          </div>
          <section className="space-y-2">
            <h3 className={HEADING_CLASS}>Short faces</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['minPanel', 'Min panel'],
                ['minRail', 'Min rail/inset'],
                ['slabBelow', 'Slab below'],
                ['step', 'Round to'],
              ].map(([key, label]) => (
                <SizeField
                  key={key}
                  label={label}
                  value={draft.shortFace[key]}
                  allowZero={key === 'slabBelow'}
                  disabled={slab}
                  onChange={(value) => changeSize('shortFace', key, value)}
                />
              ))}
            </div>
          </section>
          <section className="space-y-2">
            <h3 className={HEADING_CLASS}>Profiles</h3>
            <p className="text-xs text-gray-400">All square — the profile library comes later.</p>
          </section>
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
