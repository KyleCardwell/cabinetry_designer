import { useDispatch } from 'react-redux';
import { formatInches } from '../../model/units.js';
import { removeTopSegment, updateTopSegment } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

export default function TopSegmentRow({ wall, run, segment, index, columns, numbers, warnings }) {
  const dispatch = useDispatch();
  const actionBase = { wallId: wall.id, runId: run.id, segmentId: segment.id };
  const update = (changes) => dispatch(updateTopSegment({ ...actionBase, changes }));

  return (
    <div aria-label={`Top segment ${index + 1}`} className="rounded border border-gray-700 bg-gray-900/45 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-gray-300">Segment {index + 1}</span>
        <button
          type="button"
          aria-label={`Remove top segment ${index + 1}`}
          onClick={() => dispatch(removeTopSegment(actionBase))}
          className="px-2 text-sm text-red-300 hover:text-red-200"
        >✕</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {['from', 'to'].map((key) => (
          <Field key={key} label={key === 'from' ? 'From' : 'To'}>
            <select
              aria-label={`Segment ${index + 1} ${key === 'from' ? 'From' : 'To'}`}
              value={segment[key]}
              onChange={(event) => update({ [key]: event.target.value })}
              className={SELECT_CLASS}
            >
              {!columns.some(({ id }) => id === segment[key]) && <option value={segment[key]} disabled>Missing cabinet</option>}
              {columns.map((column, position) => <option key={column.id} value={column.id}>{numbers?.byKey.get(column.id) == null ? position + 1 : `#${numbers.byKey.get(column.id)}`} — {formatInches(column.width)}</option>)}
            </select>
          </Field>
        ))}
        <Field label="Kind">
          <select
            aria-label={`Segment ${index + 1} Kind`}
            value={segment.kind}
            onChange={(event) => update({ kind: event.target.value })}
            className={SELECT_CLASS}
          >
            <option value="wood">Wood</option>
            <option value="stone">Stone</option>
          </select>
        </Field>
        <Field label="Drop">
          <InchInput
            aria-label={`Segment ${index + 1} Drop`}
            value={segment.drop}
            onCommit={(value) => {
              if (!Number.isFinite(value) || value <= 0) return false;
              update({ drop: value });
              return true;
            }}
          />
        </Field>
      </div>
      {warnings.filter(({ segmentId }) => segmentId === segment.id).map(({ code, message }, warningIndex) => (
        <p key={`${code}-${warningIndex}`} className="mt-2 text-xs text-amber-400">{message}</p>
      ))}
    </div>
  );
}
