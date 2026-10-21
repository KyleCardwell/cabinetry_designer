import { useDispatch } from 'react-redux';
import { CABINET_TYPE_IDS, isInsetStyle, resolveStyle } from '../../model/index.js';
import { setRunFaceOptions, setRunStyle } from '../../store/elevationSlice.js';
import StyleFields from './StyleFields.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

const UPPER_BOTTOM_LABELS = {
  overhang: 'Overhang (doors below box)',
  counter: 'Flush (on counter / nothing below)',
};

export default function RunStyleFields({ room, wall, run, settings }) {
  const dispatch = useDispatch();
  const at = { wallId: wall.id, runId: run.id };

  return (
    <section className="space-y-3 border-t border-gray-700 pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cabinet style</h3>
      <StyleFields
        label="Run"
        level="Run"
        inheritedFrom="Room"
        value={run.style}
        inherited={resolveStyle(settings, room)}
        onChange={(style) => dispatch(setRunStyle({ ...at, style }))}
      />

      {run.cabinetTypeId === CABINET_TYPE_IDS.BASE && isInsetStyle(resolveStyle(settings, room, run)) && (
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={run.hanging === true}
            onChange={(event) => dispatch(setRunFaceOptions({ ...at, hanging: event.target.checked }))}
            aria-label="Hanging base"
          />
          Hanging (bottom rail hangs below the box)
        </label>
      )}

      {run.cabinetTypeId === CABINET_TYPE_IDS.UPPER && (
        !(run.bottom?.length) ? (
          <label className="block text-xs text-gray-400">
            Bottom
            <select
              value={run.upperBottom === 'flush' ? 'counter' : (run.upperBottom ?? 'overhang')}
              onChange={(event) => dispatch(setRunFaceOptions({ ...at, upperBottom: event.target.value }))}
              aria-label="Upper bottom"
              className={`mt-1 ${SELECT_CLASS}`}
            >
              {Object.entries(UPPER_BOTTOM_LABELS).map(([value, text]) => (
                <option key={value} value={value}>{text}</option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-xs text-gray-500">Bottom: set by Below the run</p>
        )
      )}
    </section>
  );
}
