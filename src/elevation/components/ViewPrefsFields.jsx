import { useDispatch, useSelector } from 'react-redux';
import { PAPER_SIZES, PLOT_SCALES, paperSize } from '../model/drawingScale.js';
import { setPref } from '../store/elevationSlice.js';
import InchInput from './InchInput.jsx';

const NUMBER_PREFS = [
  ['planGrid', 'Plan grid'],
  ['openingSnap', 'Opening snap'],
  ['cornerSnapDistance', 'Corner snap distance'],
];

const VIEW_LABELS = ['Drawing scale', 'PDF paper', 'Orthogonal plan walls', ...NUMBER_PREFS.map(([, label]) => label)];

function matchesViewField(label, query) {
  const search = query.trim().toLowerCase();
  return 'view'.includes(search) || label.toLowerCase().includes(search);
}

export function hasMatchingViewPrefs(query = '') {
  return VIEW_LABELS.some((label) => matchesViewField(label, query));
}

export default function ViewPrefsFields({ query = '' }) {
  const dispatch = useDispatch();
  const prefs = useSelector((state) => state.elevation.prefs);
  const updatePref = (key, value) => dispatch(setPref({ key, value }));
  const matches = (label) => matchesViewField(label, query);

  return (
    <div className="space-y-3">
      {matches('Drawing scale') && (
        <label className="block text-xs text-gray-400">
          Drawing scale
          <select
            value={prefs.plotScale}
            onChange={(event) => updatePref('plotScale', Number(event.target.value))}
            aria-label="Drawing scale"
            className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            {PLOT_SCALES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      )}

      {matches('PDF paper') && (
        <label className="block text-xs text-gray-400">
          PDF paper
          <select
            value={paperSize(prefs)}
            onChange={(event) => updatePref('paperSize', event.target.value)}
            aria-label="PDF paper"
            className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            {PAPER_SIZES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      )}

      {matches('Orthogonal plan walls') && (
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            aria-label="Orthogonal plan walls"
            checked={prefs.orthoWalls}
            onChange={(event) => updatePref('orthoWalls', event.target.checked)}
            className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
          />
          Orthogonal plan walls
        </label>
      )}

      <div className="grid grid-cols-2 gap-2">
        {NUMBER_PREFS.filter(([, label]) => matches(label)).map(([key, label]) => (
          <label key={key} className="text-xs text-gray-400">
            {label}
            <InchInput
              value={prefs[key]}
              onCommit={(value) => value <= 0 ? false : updatePref(key, value)}
              aria-label={label}
              className="mt-1"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
