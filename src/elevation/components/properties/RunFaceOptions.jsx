import { useDispatch } from 'react-redux';
import { CABINET_TYPE_IDS, resolveStyle } from '../../model/index.js';
import { setRunFaceOptions, setRunStyle } from '../../store/elevationSlice.js';
import StyleFields from './StyleFields.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

const UPPER_BOTTOM_LABELS = {
  overhang: 'Overhang (doors below box)',
  flush: 'Flush (light rail / trough)',
  counter: 'On counter (tall reveals)',
};

export default function RunFaceOptions({ room, wall, run, settings }) {
  const dispatch = useDispatch();
  const at = { wallId: wall.id, runId: run.id };

  return (
    <section className="space-y-3 border-t border-gray-700 pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cabinet style</h3>
      <StyleFields
        label="Run"
        value={run.style}
        inherited={resolveStyle(settings, room)}
        onChange={(style) => dispatch(setRunStyle({ ...at, style }))}
      />

      {run.cabinetTypeId === CABINET_TYPE_IDS.BASE && (
        <label className="block text-xs text-gray-400">
          Top
          <select
            value={run.top ?? 'stone'}
            onChange={(event) => dispatch(setRunFaceOptions({ ...at, top: event.target.value }))}
            aria-label="Run top"
            className={`mt-1 ${SELECT_CLASS}`}
          >
            <option value="stone">Stone</option>
            <option value="wood">Shop-built wood</option>
          </select>
        </label>
      )}

      {run.cabinetTypeId === CABINET_TYPE_IDS.UPPER && (
        <label className="block text-xs text-gray-400">
          Bottom
          <select
            value={run.upperBottom ?? 'overhang'}
            onChange={(event) => dispatch(setRunFaceOptions({ ...at, upperBottom: event.target.value }))}
            aria-label="Upper bottom"
            className={`mt-1 ${SELECT_CLASS}`}
          >
            {Object.entries(UPPER_BOTTOM_LABELS).map(([value, text]) => (
              <option key={value} value={value}>{text}</option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}
