import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { wrapCell } from '../../store/elevationSlice.js';

const BUTTON_CLASS = 'rounded bg-gray-700 px-2.5 py-2 text-xs text-gray-100 hover:bg-gray-600';

export default function CellWrapSection({ wall, run, cellId }) {
  const dispatch = useDispatch();
  const [bottom, setBottom] = useState(false);
  const wrap = (through) => dispatch(wrapCell({
    wallId: wall.id,
    runId: run.id,
    cellId,
    through,
    bottom,
  }));

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Wrap in panels
        </h3>
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={bottom}
            onChange={(event) => setBottom(event.target.checked)}
          />
          Bottom panel
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => wrap('sides')} className={BUTTON_CLASS}>
          Sides through
        </button>
        <button type="button" onClick={() => wrap('top')} className={BUTTON_CLASS}>
          Top through
        </button>
      </div>
    </section>
  );
}
