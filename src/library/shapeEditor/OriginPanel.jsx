import { useState } from 'react';
import { moveShapeOriginTo, shapeOriginSpots } from '../../elevation/model/libraryShapes.js';
import CoordInput from '../profileEditor/CoordInput.jsx';
import { SHAPE_VIEWS } from './ViewTabs.jsx';

export default function OriginPanel({ shape, view, onApply, readOnly = false }) {
  const [at, setAt] = useState([0, 0]);
  const axes = SHAPE_VIEWS[view].boxKeys.slice(0, 2);
  const moveOrigin = (coordinates) => {
    if (readOnly || Object.values(coordinates).every((value) => value === 0)) return;
    if (onApply(moveShapeOriginTo(shape, coordinates))) setAt([0, 0]);
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-gray-200">0,0</h2>
      <div className="grid w-28 grid-cols-3 gap-1" role="group" aria-label="0,0 on the size box">
        {shapeOriginSpots(shape, view).map(({ row, col, at: coordinates }) => {
          const current = Object.values(coordinates).every((value) => Math.abs(value) < 1e-6);
          const label = `0,0 at the box's ${row} ${col}`;
          return (
            <button key={`${row}-${col}`} type="button" title={label} aria-label={label} aria-pressed={current}
              disabled={readOnly} onClick={() => moveOrigin(coordinates)}
              className={`h-8 rounded border border-gray-600 text-sm disabled:opacity-50 ${current ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
              {current ? '●' : '○'}
            </button>
          );
        })}
      </div>
      <div className="space-y-2">
        <h3 className="text-xs text-gray-400">Set 0,0 at</h3>
        <div className="flex items-end gap-2">
          {axes.map((axis, index) => (
            <label key={axis} className="min-w-0 flex-1 space-y-1 text-xs text-gray-400">
              <span>{axis.toUpperCase()}</span>
              <CoordInput aria-label={`Set 0,0 at ${axis.toUpperCase()}`} value={at[index]} disabled={readOnly}
                onCommit={(value) => setAt((current) => current.map((entry, i) => i === index ? value : entry))} />
            </label>
          ))}
          <button type="button" disabled={readOnly} className="rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-50"
            onClick={() => moveOrigin(Object.fromEntries(axes.map((axis, i) => [axis, at[i]])))}>Set</button>
        </div>
      </div>
    </section>
  );
}
