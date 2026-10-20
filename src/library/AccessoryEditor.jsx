import { useEffect, useId, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { isAccessoryList } from '../elevation/model/accessories.js';
import { PRICING_UNIT_LABELS } from '../elevation/model/libraryPricing.js';
import { updateAccessory } from '../elevation/store/elevationSlice.js';
import InchInput from '../elevation/components/InchInput.jsx';
import PricingFields from './PricingFields.jsx';
import AccessoryEffectsFields from './AccessoryEffectsFields.jsx';

const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const TEXT_LABELS = { name: 'Name', brand: 'Brand', model: 'Model', description: 'Description', reportText: 'Report text' };

export default function AccessoryEditor({ accessory, accessories, slides = [], services = [], onClose }) {
  const dispatch = useDispatch();
  const [draft, setDraft] = useState(() => structuredClone(accessory));
  const titleId = useId();
  const panelRef = useRef(null);
  const savedAccessory = {
    ...draft,
    ...Object.fromEntries(Object.keys(TEXT_LABELS).map((key) => [key, draft[key].trim()])),
    effects: draft.effects.map((effect) => effect.kind === 'probox_note' ? { ...effect, text: effect.text.trim() } : effect),
  };
  const duplicateName = accessories.some((entry) => entry.id !== accessory.id
    && entry.name.toLowerCase() === savedAccessory.name.toLowerCase());
  const reason = !savedAccessory.name ? 'Name is required'
    : duplicateName ? 'Name already used'
      : savedAccessory.effects.some((effect) => effect.kind === 'probox_note' && !effect.text)
        ? 'Fill in or remove the ProBox note'
        : !isAccessoryList(accessories.map((entry) => entry.id === accessory.id ? savedAccessory : entry))
          ? 'Not a valid accessory' : '';
  const change = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }));
  const changeDimension = (group, key, value) => {
    if (value !== null && (!Number.isFinite(value) || value <= 0)) return false;
    setDraft((previous) => ({ ...previous, [group]: { ...previous[group], [key]: value } }));
    return true;
  };
  const changeLengthDeduction = (value) => {
    if (value !== null && (!Number.isFinite(value) || value < 0)) return false;
    change('lengthDeduction', value);
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
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="w-[36rem] max-h-[90vh] overflow-y-auto rounded border border-gray-700 bg-gray-800 p-5">
        <h2 id={titleId} className="mb-4 text-lg font-semibold text-gray-100">Accessory {accessory.name}</h2>
        <div className="space-y-4">
          {Object.entries(TEXT_LABELS).map(([key, label]) => (
            <label key={key} className="block text-xs text-gray-400">
              {label}
              <input required={key === 'name'} maxLength={key === 'name' ? undefined : 120}
                value={draft[key]} onChange={(event) => change(key, event.target.value)}
                placeholder={key === 'reportText' ? 'Same as the name' : undefined}
                aria-label={label} className={`mt-1 ${INPUT_CLASS}`} />
            </label>
          ))}
          <label className="block text-xs text-gray-400">
            Goes in
            <select value={draft.attachesTo} aria-label="Goes in" className={`mt-1 ${INPUT_CLASS}`}
              onChange={(event) => {
                const attachesTo = event.target.value;
                setDraft((previous) => ({ ...previous, attachesTo, wholeSection: attachesTo === 'section' && previous.wholeSection,
                  size: { ...previous.size, width: attachesTo === 'drawer_box' && previous.size.width === 'section' ? null : previous.size.width },
                  lengthDeduction: attachesTo === 'drawer_box' ? null : previous.lengthDeduction,
                  effects: [] }));
              }}>
              <option value="section">Section</option>
              <option value="drawer_box">Drawer box</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={draft.wholeSection} disabled={draft.attachesTo === 'drawer_box'}
              aria-label="Takes the whole section" onChange={(event) => change('wholeSection', event.target.checked)} />
            Takes the whole section
          </label>
          <div className="grid grid-cols-3 gap-3">
            {['width', 'depth', 'height'].map((key) => (
              <label key={key} className="block text-xs text-gray-400">
                Min {key}
                <InchInput value={draft.minOpening[key]} allowBlank displayStep={1 / 64}
                  onCommit={(value) => changeDimension('minOpening', key, value)} aria-label={`Min ${key}`} className="mt-1" />
              </label>
            ))}
          </div>
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-medium text-gray-100">Size</legend>
            <div className="grid grid-cols-3 gap-3">
              {['width', 'height', 'depth'].map((key) => {
                const label = key[0].toUpperCase() + key.slice(1);
                const sectionWidth = key === 'width' && draft.size.width === 'section';
                return (
                  <div key={key}>
                    <label className="block text-xs text-gray-400">
                      {label}
                      <InchInput value={sectionWidth ? null : draft.size[key]} allowBlank displayStep={1 / 64}
                        disabled={sectionWidth} placeholder={sectionWidth ? 'Section width' : undefined}
                        onCommit={(value) => changeDimension('size', key, value)} aria-label={label} className="mt-1" />
                    </label>
                    {key === 'width' && draft.attachesTo === 'section' && (
                      <label className="mt-2 flex items-center gap-2 text-xs text-gray-300">
                        <input type="checkbox" checked={sectionWidth} aria-label="Section width"
                          onChange={(event) => setDraft((previous) => ({ ...previous,
                            size: { ...previous.size, width: event.target.checked ? 'section' : null } }))} />
                        Section width
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
            {draft.attachesTo === 'section' && (
              <>
                <label className="block text-xs text-gray-400">
                  Ordered length = section width −
                  <InchInput value={draft.lengthDeduction} allowBlank displayStep={1 / 64}
                    onCommit={changeLengthDeduction} aria-label="Ordered length = section width −" className="mt-1" />
                </label>
                <p className="text-xs text-gray-400">For rods and other parts cut to the section. Leave blank if not cut to size.</p>
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input type="checkbox" checked={draft.effects.some((effect) => effect.kind === 'line_bore_row')}
                    aria-label="Needs a 3rd row of line bore with shelves (3rd row lb)"
                    onChange={(event) => change('effects', event.target.checked ? [{ kind: 'line_bore_row' }] : [])} />
                  Needs a 3rd row of line bore with shelves (3rd row lb)
                </label>
              </>
            )}
            <p className="text-xs text-gray-400">Used to draw the accessory. Min opening is still the smallest space it fits in.</p>
          </fieldset>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={draft.ownSlides} aria-label="Brings its own slides"
              onChange={(event) => change('ownSlides', event.target.checked)} />
            Brings its own slides
          </label>
          {draft.attachesTo === 'drawer_box' && (
            <AccessoryEffectsFields effects={draft.effects} slides={slides}
              onChange={(effects) => change('effects', effects)} inputClass={INPUT_CLASS} buttonClass={BUTTON_CLASS} />
          )}
          <PricingFields value={{ pricing: draft.pricing, price: draft.price, actualCost: draft.actualCost, labor: draft.labor }}
            onChange={(value) => setDraft((previous) => ({ ...previous, ...value }))}
            showPricing unitLabel={PRICING_UNIT_LABELS[draft.pricing]} services={services} />
          {reason && <p role="status" className="text-xs text-red-400">{reason}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={BUTTON_CLASS} onClick={onClose}>Cancel</button>
            <button type="button" disabled={Boolean(reason)}
              className={`${BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
              onClick={() => {
                if (reason) return;
                dispatch(updateAccessory({ accessoryId: accessory.id, accessory: savedAccessory }));
                onClose();
              }}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
