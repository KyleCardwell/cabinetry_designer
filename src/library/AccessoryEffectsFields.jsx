import InchInput from '../elevation/components/InchInput.jsx';
import { ACCESSORY_EFFECT_KINDS, effectText } from '../elevation/model/accessoryEffects.js';

const LABELS = {
  clear_behind: 'Clear behind', max_depth: 'Max depth', max_height: 'Max height',
  fixed_height: 'Fixed height', slide: 'Slide', probox_note: 'ProBox note',
};
const DEFAULT_INCHES = { clear_behind: 2, max_depth: 18, max_height: 4.25, fixed_height: 4.25 };

export default function AccessoryEffectsFields({ effects, slides, onChange, inputClass, buttonClass }) {
  const kinds = new Set(effects.map((effect) => effect.kind));
  const available = ACCESSORY_EFFECT_KINDS.filter((kind) => Object.hasOwn(LABELS, kind) && !kinds.has(kind)
    && !(kind === 'max_height' && kinds.has('fixed_height'))
    && !(kind === 'fixed_height' && kinds.has('max_height')));
  const change = (index, value) => onChange(effects.map((effect, i) => i === index ? { ...effect, ...value } : effect));

  return (
    <section aria-label="Drawer box effects" className="space-y-3">
      <h3 className="text-sm font-medium text-gray-200">Drawer box effects</h3>
      {effects.map((effect, index) => {
        const label = LABELS[effect.kind];
        const summary = effectText(effect, slides);
        return (
          <div key={effect.kind}>
            <div className="flex items-end gap-2">
              <label className="block min-w-0 flex-1 text-xs text-gray-400">
                {label}
                {effect.kind === 'slide' ? (
                  <select value={effect.slideId} aria-label={label} className={`mt-1 ${inputClass}`}
                    onChange={(event) => change(index, { slideId: event.target.value })}>
                    {!slides.some(({ id }) => id === effect.slideId) && <option value={effect.slideId}>Missing slide</option>}
                    {slides.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                  </select>
                ) : effect.kind === 'probox_note' ? (
                  <input value={effect.text} maxLength={120} aria-label={label} className={`mt-1 ${inputClass}`}
                    onChange={(event) => change(index, { text: event.target.value })} />
                ) : (
                  <InchInput value={effect.inches} displayStep={1 / 64} aria-label={label} className="mt-1"
                    onCommit={(inches) => {
                      if (!Number.isFinite(inches) || inches <= 0) return false;
                      change(index, { inches });
                      return true;
                    }} />
                )}
              </label>
              <button type="button" aria-label={`Remove ${label}`} className={buttonClass}
                onClick={() => onChange(effects.filter((_, i) => i !== index))}>Remove</button>
            </div>
            {summary && <p className="mt-1 text-xs text-gray-400">{summary}</p>}
          </div>
        );
      })}
      <select value="" aria-label="Add effect" className={inputClass} disabled={!available.length}
        onChange={(event) => {
          const kind = event.target.value;
          if (!available.includes(kind) || (kind === 'slide' && !slides.length)) return;
          const effect = kind === 'slide' ? { kind, slideId: slides[0].id }
            : kind === 'probox_note' ? { kind, text: '' } : { kind, inches: DEFAULT_INCHES[kind] };
          onChange([...effects, effect]);
        }}>
        <option value="">Add effect…</option>
        {available.map((kind) => <option key={kind} value={kind} disabled={kind === 'slide' && !slides.length}>{LABELS[kind]}</option>)}
      </select>
      <p className="text-xs text-gray-400">The drawer box sizes from these. A typed size on a box still wins, with a warning.</p>
    </section>
  );
}
