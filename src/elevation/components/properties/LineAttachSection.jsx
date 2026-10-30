import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';

// LL3/LL4: the "Layout line" controls shared by openings, columns and runs: which line, which point of
// the thing sits on it, and the offset from it. Callers give the heading/section around it.

export const NEW_LINE = '__new';
const POINTS = [['left', 'Left edge'], ['center', 'Centre'], ['right', 'Right edge']];
const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

/**
 * @param {{
 *   lines: object[], attach: object|null, line: object|null, ariaPrefix: string,
 *   onAttach: (attach: object|null) => void, onNewLine: () => void,
 *   extraOptions?: {value: string, label: string, onSelect: () => void}[], note?: string,
 * }} props
 */
export default function LineAttachSection({
  lines, attach, line, ariaPrefix, onAttach, onNewLine, extraOptions = [], note,
}) {
  return (
    <>
      <Field label="Line">
        <select
          value={line ? line.id : ''}
          onChange={(event) => {
            const { value } = event.target;
            const extra = extraOptions.find((option) => option.value === value);
            if (value === NEW_LINE) onNewLine();
            else if (extra) extra.onSelect();
            else if (!value) onAttach(null);
            else onAttach({ lineId: value, at: 'center', offset: 0 });
          }}
          aria-label={`${ariaPrefix} layout line`}
          className={SELECT_CLASS}
        >
          <option value="">None</option>
          {lines.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
          ))}
          <option value={NEW_LINE}>New line here</option>
          {extraOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </Field>
      {line && attach && (
        <>
          <div className="mt-2.5 grid grid-cols-3 overflow-hidden rounded border border-gray-700" aria-label="Point on line">
            {POINTS.map(([at, label]) => (
              <button
                key={at}
                type="button"
                aria-pressed={attach.at === at}
                onClick={() => onAttach({ ...attach, at })}
                className={`px-2 py-2 text-xs font-medium transition-colors ${
                  attach.at === at ? 'bg-blue-600 text-white' : 'bg-gray-900/45 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2.5">
            <Field label={`Offset from ${line.label}`} tag="+ = right">
              <InchInput
                value={attach.offset}
                onCommit={(offset) => {
                  onAttach({ ...attach, offset });
                  return true;
                }}
                aria-label={`${ariaPrefix} line offset`}
              />
            </Field>
          </div>
          {note && <p className="mt-2 text-xs leading-relaxed text-gray-500">{note}</p>}
        </>
      )}
    </>
  );
}
