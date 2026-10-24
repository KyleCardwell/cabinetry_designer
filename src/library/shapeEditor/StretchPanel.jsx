import { formatInches } from '../../elevation/model/units.js';
import { stretchProblemText } from '../../elevation/model/libraryShapes.js';
import CoordInput from '../profileEditor/CoordInput.jsx';
import { SHAPE_VIEWS } from './ViewTabs.jsx';

const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-50';
const snap = (value) => Math.round(value * 16) / 16;

export default function StretchPanel({ box, stretch, view, problems, onChange, readOnly }) {
  const keys = SHAPE_VIEWS[view].boxKeys;
  const updateZones = (axis, zones) => {
    if (readOnly) return false;
    const next = { ...stretch };
    if (zones.length) next[axis] = [...zones].sort((a, b) => a[0] - b[0]);
    else delete next[axis];
    return onChange(next);
  };

  return (
    <section aria-label="Stretch zones" className="space-y-3">
      <h2 className="text-sm font-medium text-gray-200">Stretch zones</h2>
      {keys.slice(0, 2).map((axis, coord) => {
        const zones = stretch[axis] ?? [];
        return (
          <div key={axis} className="space-y-2">
            {zones.map(([from, to], index) => (
              <div key={index} className="space-y-1">
                <p className="text-xs text-gray-300">{axis} {formatInches(from)} – {formatInches(to)}</p>
                <div className="flex items-end gap-2">
                  {['From', 'To'].map((label, end) => (
                    <label key={label} className="min-w-0 flex-1 space-y-1 text-xs text-gray-400">
                      <span>{label}</span>
                      <CoordInput aria-label={`${axis} zone ${index + 1} ${label}`} value={end === 0 ? from : to} disabled={readOnly}
                        onCommit={(value) => updateZones(axis, zones.map((zone, i) => i === index
                          ? zone.map((current, j) => j === end ? value : current) : zone))} />
                    </label>
                  ))}
                  <button type="button" className={BUTTON_CLASS} disabled={readOnly} aria-label={`Remove ${axis} zone ${index + 1}`}
                    onClick={() => updateZones(axis, zones.filter((_, i) => i !== index))}>Remove</button>
                </div>
              </div>
            ))}
            <button type="button" className={BUTTON_CLASS} disabled={readOnly || zones.length >= 4} aria-label={`Add ${axis} zone`}
              onClick={() => {
                if (zones.length >= 4) return;
                const size = box[keys[coord + 2]];
                updateZones(axis, [...zones, [snap(box[axis] + size / 3), snap(box[axis] + 2 * size / 3)]]);
              }}>Add zone ({axis})</button>
          </div>
        );
      })}
      {problems.map((problem, index) => <p key={index} role="alert" className="text-sm text-amber-300">
        {stretchProblemText(problem, stretch[problem.axis][problem.index])}
      </p>)}
    </section>
  );
}
