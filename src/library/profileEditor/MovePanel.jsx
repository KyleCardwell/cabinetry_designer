import { useState } from 'react';
import { moveProfilePoints } from '../../elevation/model/profileEditing.js';
import CoordInput from './CoordInput.jsx';
import { selectedPointIds } from './profileSelection.js';

export default function MovePanel({ profile, selection, axes = ['x', 'y'], onApply, readOnly = false }) {
  const [delta, setDelta] = useState([0, 0]);
  const ids = selectedPointIds(selection);
  if (!ids.length) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-gray-200">Move selected ({ids.length} points)</h2>
      <div className="flex items-end gap-2">
        {axes.map((axis, index) => (
          <label key={axis} className="min-w-0 flex-1 space-y-1 text-xs text-gray-400">
            <span>{axis.toUpperCase()}</span>
            <CoordInput aria-label={`Move selected ${axis.toUpperCase()}`} value={delta[index]} disabled={readOnly}
              onCommit={(value) => setDelta((current) => current.map((entry, i) => i === index ? value : entry))} />
          </label>
        ))}
        <button type="button" disabled={readOnly} className="rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-50"
          onClick={() => {
            if (readOnly || delta.every((value) => value === 0)) return;
            onApply(moveProfilePoints(profile, ids, delta), 'That move would make an arc impossible.');
          }}>Move</button>
      </div>
    </section>
  );
}
