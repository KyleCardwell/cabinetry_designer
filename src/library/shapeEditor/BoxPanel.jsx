import CoordInput from '../profileEditor/CoordInput.jsx';

const FIELDS = { w: 'W', h: 'H', d: 'D', x: 'Left x', y: 'Front y', z: 'Bottom z' };

export default function BoxPanel({ box, onChange, onFit, readOnly }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-gray-200">Size box</h2>
      <div className="grid grid-cols-3 gap-2">
        {Object.entries(FIELDS).map(([key, label]) => (
          <label key={key} className="space-y-1 text-xs text-gray-400">
            <span>{label}</span>
            <CoordInput aria-label={label} value={box[key]} disabled={readOnly}
              onCommit={(value) => onChange({ ...box, [key]: value })} />
          </label>
        ))}
      </div>
      {onFit && <button type="button" disabled={readOnly} onClick={onFit}
        className="rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-50">
        Fit to drawing
      </button>}
    </section>
  );
}
