import { useState } from 'react';
import { PRICING_UNITS } from '../elevation/model/libraryPricing.js';

const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const PRICING_LABELS = { unit: 'Each', area: 'Square foot', length: 'Foot', perimeter: 'Foot of perimeter', volume: 'Cubic foot' };

function MoneyField({ label, value, onChange, readOnly }) {
  const [focused, setFocused] = useState(false);
  const shown = value === null || !Number.isFinite(value) ? '' : focused ? value : value.toFixed(2);
  return (
    <label className="block text-xs text-gray-400">
      {label}
      <span className="mt-1 flex items-center gap-2">
        <span aria-hidden="true">$</span>
        <input type="number" min="0" step="0.01" value={shown} disabled={readOnly}
          aria-label={label} className={INPUT_CLASS}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} />
      </span>
    </label>
  );
}

export default function PricingFields({ value, onChange, showPricing = false, unitLabel, services = [], readOnly = false }) {
  const perUnit = unitLabel === 'each' ? 'each' : `per ${unitLabel}`;
  const change = (key, next) => onChange({ ...value, [key]: next });
  const labor = value.labor;
  const serviceName = (id) => {
    const service = services.find((entry) => String(entry.id) === id);
    return service ? `${service.name}${service.active ? '' : ' (inactive)'}` : `Unknown service ${id}`;
  };
  const remove = (id) => {
    const next = { ...labor };
    delete next[id];
    change('labor', next);
  };
  const available = services.filter((service) => service.active && !Object.hasOwn(labor, String(service.id)));
  return (
    <section className="space-y-3" aria-label="Pricing">
      <h3 className="text-sm font-medium text-gray-100">Pricing</h3>
      {showPricing && (
        <label className="block text-xs text-gray-400">
          Priced by
          <select aria-label="Priced by" value={value.pricing} disabled={readOnly}
            className={`mt-1 ${INPUT_CLASS}`} onChange={(event) => change('pricing', event.target.value)}>
            {PRICING_UNITS.map((unit) => <option key={unit} value={unit}>{PRICING_LABELS[unit]}</option>)}
          </select>
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <MoneyField label={`Price ${perUnit}`} value={value.price} onChange={(next) => change('price', next)} readOnly={readOnly} />
        <MoneyField label={`Actual cost ${perUnit}`} value={value.actualCost} onChange={(next) => change('actualCost', next)} readOnly={readOnly} />
      </div>
      <div className="space-y-2">
        <h4 className="text-sm text-gray-300">Labour (minutes {perUnit})</h4>
        {Object.entries(labor).map(([id, minutes]) => {
          const name = serviceName(id);
          return (
            <div key={id} className="flex items-center gap-2">
              <label className="flex flex-1 items-center gap-2 text-sm text-gray-300">
                <span className="flex-1">{name}</span>
                <input type="number" min="0" step="any" value={minutes} disabled={readOnly}
                  aria-label={`Minutes for ${name}`} className={`${INPUT_CLASS} max-w-28`}
                  onChange={(event) => {
                    if (event.target.value === '') remove(id);
                    else change('labor', { ...labor, [id]: Number(event.target.value) });
                  }} />
              </label>
              <button type="button" className={BUTTON_CLASS} disabled={readOnly}
                aria-label={`Remove ${name}`} onClick={() => remove(id)}>Remove</button>
            </div>
          );
        })}
        <label className="block text-xs text-gray-400">
          Add service
          <select aria-label="Add service" value="" className={`mt-1 ${INPUT_CLASS}`}
            disabled={readOnly || !available.length || Object.keys(labor).length >= 20}
            onChange={(event) => {
              const id = event.target.value;
              if (readOnly || Object.keys(labor).length >= 20 || !available.some((service) => String(service.id) === id)) return;
              change('labor', { ...labor, [id]: 0 });
            }}>
            <option value="">Add service</option>
            {available.map((service) => <option key={service.id} value={String(service.id)}>{service.name}</option>)}
          </select>
        </label>
        {!services.length && <p className="text-xs text-gray-400">Services load with the shop&apos;s data.</p>}
      </div>
    </section>
  );
}
