import { EXTEND_TARGETS, runShortLabel } from '../../model/index.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';

const DIRECTION_LABELS = {
  up: 'Extend up',
  down: 'Extend down',
  left: 'Extend left',
  right: 'Extend right',
};
const TARGET_LABELS = {
  floor: 'To the floor',
  ceiling: 'To the ceiling / soffit',
  wall: 'To the wall end',
};
const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

function optionValue(target) {
  if (!target) return '';
  return target.to === 'run' ? `run:${target.runId}` : target.to;
}

/**
 * One "Extend …" select per direction: no, a fixed target, another run on this wall, or a distance.
 * `onChange(direction, target | null)`.
 */
export default function ExtendFields({ directions, extend, runs = [], label, onChange }) {
  return directions.map((direction) => {
    const target = extend?.[direction] ?? null;
    const fixed = EXTEND_TARGETS[direction].filter((to) => to !== 'run' && to !== 'by');
    return (
      <div key={direction}>
        <Field label={DIRECTION_LABELS[direction]}>
          <select
            value={optionValue(target)}
            onChange={(event) => {
              const { value } = event.target;
              if (value === '') onChange(direction, null);
              else if (value.startsWith('run:')) onChange(direction, { to: 'run', runId: value.slice(4) });
              else if (value === 'by') onChange(direction, { to: 'by', amount: target?.to === 'by' ? target.amount : 1 });
              else onChange(direction, { to: value });
            }}
            aria-label={`${label} extend ${direction}`}
            className={SELECT_CLASS}
          >
            <option value="">No</option>
            {fixed.map((to) => (
              <option key={to} value={to}>{TARGET_LABELS[to]}</option>
            ))}
            {runs.map((other) => (
              <option key={other.id} value={`run:${other.id}`}>{`To ${runShortLabel(other)}`}</option>
            ))}
            <option value="by">By a distance</option>
          </select>
        </Field>
        {target?.to === 'by' && (
          <Field label="Distance">
            <InchInput
              value={target.amount}
              onCommit={(amount) => {
                if (!(amount > 0)) return false;
                onChange(direction, { to: 'by', amount });
                return true;
              }}
              aria-label={`${label} extend ${direction} distance`}
            />
          </Field>
        )}
      </div>
    );
  });
}
