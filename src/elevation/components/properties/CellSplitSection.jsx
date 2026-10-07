import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { MAX_CELL_SPLIT } from '../../model/index.js';
import {
  equalizeCells,
  removeCell,
  splitCell,
  unsplitCell,
} from '../../store/elevationSlice.js';

const BUTTON_CLASS = 'rounded bg-gray-700 px-2.5 py-2 text-xs text-gray-100 hover:bg-gray-600';
const REMOVE_CLASS = 'rounded bg-red-900/70 px-2.5 py-2 text-xs text-red-100 hover:bg-red-800';
const NUMBER_CLASS = 'w-16 rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

export default function CellSplitSection({
  wall, run, cellId, nested, removable = nested, canSplit = true,
}) {
  const dispatch = useDispatch();
  const [count, setCount] = useState(2);
  const actionBase = { wallId: wall.id, runId: run.id, cellId };
  const split = (direction) => dispatch(splitCell({
    ...actionBase,
    direction,
    count: Number(count),
  }));

  return (
    <section className="space-y-2">
      {canSplit && (
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Split</h3>
        <label className="flex items-center gap-2 text-xs text-gray-300">
          Cells
          <input
            type="number"
            min={2}
            max={MAX_CELL_SPLIT}
            value={count}
            onChange={(event) => setCount(event.target.value)}
            onBlur={() => {
              const value = Math.round(Number(count));
              setCount(Number.isFinite(value)
                ? Math.min(MAX_CELL_SPLIT, Math.max(2, value))
                : 2);
            }}
            className={NUMBER_CLASS}
          />
        </label>
      </div>
      )}
      {canSplit && (
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => split('across')} className={BUTTON_CLASS}>
          Split across
        </button>
        <button type="button" onClick={() => split('down')} className={BUTTON_CLASS}>
          Split down
        </button>
      </div>
      )}
      {(nested || removable) && (
        <div className="grid grid-cols-3 gap-2">
          {nested && (
            <button
              type="button"
              onClick={() => dispatch(equalizeCells(actionBase))}
              className={BUTTON_CLASS}
            >
              Make equal
            </button>
          )}
          {nested && (
            <button
              type="button"
              onClick={() => dispatch(unsplitCell(actionBase))}
              className={BUTTON_CLASS}
            >
              Unsplit
            </button>
          )}
          {removable && (
            <button
              type="button"
              onClick={() => dispatch(removeCell(actionBase))}
              className={REMOVE_CLASS}
            >
              Remove cell
            </button>
          )}
        </div>
      )}
    </section>
  );
}
