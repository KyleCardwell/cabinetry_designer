import { useDispatch } from 'react-redux';
import {
  BOTTOM_PART_DOORS,
  BOTTOM_PART_KINDS,
  BOTTOM_PART_LABELS,
  UNCOVERABLE_BOTTOM_PARTS,
  createBottomPart,
} from '../../model/index.js';
import { setRunBottom } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-200 hover:bg-gray-600 disabled:opacity-40';
const DOORS_LABELS = {
  cover: 'Doors cover it',
  flush: 'Doors stop flush above',
  visible: 'Visible',
};

export default function RunBottomSection({ run, settings, actionBase }) {
  const dispatch = useDispatch();
  const parts = run.bottom ?? [];
  const commit = (next) => dispatch(setRunBottom({ ...actionBase, bottom: next }));
  const change = (index, changes) => commit(parts.map((part, at) => (
    at === index ? { ...part, ...changes } : part
  )));
  const move = (index, delta) => {
    const next = [...parts];
    const [part] = next.splice(index, 1);
    next.splice(index + delta, 0, part);
    commit(next);
  };

  return (
    <section className="space-y-3 border-t border-gray-700 pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Below the run</h3>
      {parts.map((part, index) => {
        const label = BOTTOM_PART_LABELS[part.kind];
        return (
          <div key={part.id} className="space-y-2 rounded border border-gray-700 bg-gray-900/45 p-3">
            <div className="flex items-center justify-between text-xs text-gray-300">
              <span>{label}</span>
              <span className="flex gap-1">
                <button type="button" className={BUTTON_CLASS} disabled={index === 0}
                  onClick={() => move(index, -1)} aria-label={`Move ${label} up`}>↑</button>
                <button type="button" className={BUTTON_CLASS} disabled={index === parts.length - 1}
                  onClick={() => move(index, 1)} aria-label={`Move ${label} down`}>↓</button>
                <button type="button" className={BUTTON_CLASS}
                  onClick={() => commit(parts.filter((_, at) => at !== index))}
                  aria-label={`Remove ${label}`}>✕</button>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Height">
                <InchInput
                  value={part.height}
                  onCommit={(value) => {
                    if (!(value > 0)) return false;
                    change(index, { height: value });
                    return true;
                  }}
                  aria-label={`${label} height`}
                />
              </Field>
              <Field label="Doors">
                <select
                  value={part.doors}
                  onChange={(event) => change(index, { doors: event.target.value })}
                  aria-label={`${label} doors`}
                  className={SELECT_CLASS}
                >
                  {BOTTOM_PART_DOORS
                    .filter((doors) => doors !== 'cover' || !UNCOVERABLE_BOTTOM_PARTS.includes(part.kind))
                    .map((doors) => <option key={doors} value={doors}>{DOORS_LABELS[doors]}</option>)}
                </select>
              </Field>
            </div>
          </div>
        );
      })}
      <select
        value=""
        onChange={(event) => {
          if (event.target.value) commit([...parts, createBottomPart(event.target.value, settings)]);
        }}
        aria-label="Add a part below the run"
        className={SELECT_CLASS}
      >
        <option value="">Add a part below…</option>
        {BOTTOM_PART_KINDS.map((kind) => (
          <option key={kind} value={kind}>{BOTTOM_PART_LABELS[kind]}</option>
        ))}
      </select>
      <p className="text-xs text-gray-500">
        Listed top to bottom. The bottom reveal follows the parts the doors cover (REV-011).
      </p>
    </section>
  );
}
