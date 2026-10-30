import { useDispatch } from 'react-redux';
import {
  OPENING_PLACEMENT_MESSAGES,
  validateOpeningPlacement,
} from '../../model/openings.js';
import { attachmentsTo } from '../../model/layoutLines.js';
import { formatInches } from '../../model/units.js';
import {
  deleteLayoutLine,
  setSelection,
  updateLayoutLine,
} from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import TextInput from '../TextInput.jsx';
import Field from './Field.jsx';

export const AT_LABELS = { left: 'left edge', center: 'centre', right: 'right edge' };

const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

function attachedRows(wall, line) {
  const source = wall.sideSource ?? wall;
  return attachmentsTo(source, line.id).map((target) => {
    if (target.kind === 'opening') {
      const opening = source.openings.find((candidate) => candidate.id === target.openingId);
      return {
        key: `opening:${opening.id}`,
        text: `${opening.label} · ${AT_LABELS[opening.attach.at]} · ${formatInches(opening.attach.offset)}`,
        selection: { openingId: opening.id },
        opening,
      };
    }
    const index = source.runs.findIndex((candidate) => candidate.id === target.runId);
    return target.kind === 'run'
      ? { key: `run:${target.runId}`, text: `Run ${index + 1}`, selection: { runId: target.runId } }
      : {
        key: `column:${target.runId}:${target.itemId}`,
        text: `Run ${index + 1} · cabinet`,
        selection: { runId: target.runId, pieceId: target.itemId },
      };
  });
}

/** LL3: a selected layout line: label, which end it's measured from, distance, what's attached. */
export default function LineProperties({ wall, line, settings }) {
  const dispatch = useDispatch();
  const base = { wallId: wall.id, lineId: line.id };
  const update = (changes) => dispatch(updateLayoutLine({ ...base, ...changes }));
  const rows = attachedRows(wall, line);
  const front = { ...(wall.sideSource ?? wall), length: wall.length };
  const warnings = [
    ...(line.value > wall.length + 1e-9 ? [`${line.label} is past the wall end`] : []),
    ...rows.flatMap(({ opening }) => {
      if (!opening) return [];
      const validation = validateOpeningPlacement(front, opening, settings);
      return validation.ok ? []
        : [`${opening.label}: ${OPENING_PLACEMENT_MESSAGES[validation.reason] ?? validation.reason}`];
    }),
  ];

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Layout line
          </h3>
          <button
            type="button"
            onClick={() => dispatch(deleteLayoutLine(base))}
            className="rounded bg-red-900/70 px-2.5 py-1.5 text-xs text-red-100 hover:bg-red-800"
          >
            Delete
          </button>
        </div>
        <Field label="Label">
          <TextInput
            value={line.label}
            onCommit={(text) => {
              if (!text || text.length > 24) return false;
              update({ label: text });
              return true;
            }}
            aria-label="Layout line label"
            className={INPUT_CLASS}
          />
        </Field>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Measured from
        </h3>
        <div className="grid grid-cols-2 overflow-hidden rounded border border-gray-700">
          {[['left', 'Left end'], ['right', 'Right end']].map(([from, label]) => (
            <button
              key={from}
              type="button"
              aria-pressed={line.from === from}
              onClick={() => update({ from })}
              className={`px-2 py-2 text-xs font-medium transition-colors ${
                line.from === from ? 'bg-blue-600 text-white' : 'bg-gray-900/45 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-2.5">
          <Field label="Distance">
            <InchInput
              value={line.value}
              onCommit={(value) => {
                if (!(value >= 0)) return false;
                update({ value });
                return true;
              }}
              aria-label="Layout line distance"
            />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Attached
        </h3>
        {rows.length === 0 ? (
          <p className="text-xs text-gray-500">Nothing is attached. Attach a door or window from its properties.</p>
        ) : (
          <ul className="space-y-1">
            {rows.map((row) => (
              <li key={row.key}>
                <button
                  type="button"
                  onClick={() => dispatch(setSelection(row.selection))}
                  className="w-full rounded border border-gray-700 bg-gray-900/45 px-2.5 py-1.5 text-left text-xs text-gray-300 hover:bg-gray-700"
                >
                  {row.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Warnings &amp; errors
        </h3>
        {warnings.length === 0 ? (
          <p className="mt-2 text-xs text-gray-500">No warnings or errors.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-xs">
            {warnings.map((warning) => (
              <li key={warning} className="rounded border border-amber-900/80 bg-amber-950/35 px-2.5 py-2 text-amber-300">
                {warning}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
