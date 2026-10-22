import { useDispatch } from 'react-redux';
import { FRAME_RETURN_WIDTH, stepEndSides } from '../../model/index.js';
import { setStepEnd } from '../../store/elevationSlice.js';
import PanelSection from '../panel/PanelSection.jsx';
import OverrideInput from '../OverrideInput.jsx';
import { controlBorder } from '../overrideHelpers.js';
import Field from './Field.jsx';

export default function StepEndsSection({ room, wall, run, item, cells, settings, side: onlySide }) {
  const dispatch = useDispatch();
  if (item?.kind !== 'cabinet') return null;
  const sides = [...new Set(stepEndSides(run, cells, settings, room)
    .filter((entry) => entry.leafId === item.id && (!onlySide || entry.side === onlySide))
    .map((entry) => entry.side))];
  if (!sides.length) return null;
  const commit = (side, value) => dispatch(setStepEnd({
    wallId: wall.id, runId: run.id, cellId: item.id, side, value,
  }));

  return (
    <PanelSection id="piece.stepEnds" title="Step ends">
      <div className="space-y-2">
        {sides.map((side) => {
          const stored = item.stepEnds?.[side];
          const value = stored === 'none' ? 'none' : stored?.type === 'panel' ? 'panel' : '';
          const label = side === 'left' ? 'Left' : 'Right';
          return (
            <div key={side} className="grid grid-cols-2 gap-2">
              <Field label={label}>
                <select
                  aria-label={`${label} step end`}
                  value={value}
                  onChange={(event) => commit(side, event.target.value === 'panel'
                    ? { type: 'panel' } : event.target.value || null)}
                  className={`w-full rounded border ${controlBorder(stored !== undefined)} bg-gray-900 px-2.5 py-1.5 text-sm ${stored === undefined ? 'text-gray-500' : 'text-gray-100'} focus:border-blue-500 focus:outline-none`}
                >
                  <option value="">Return</option>
                  <option value="panel">Panel</option>
                  <option value="none">None</option>
                </select>
              </Field>
              {value === '' && (
                <OverrideInput
                  kind="number"
                  label="Return width"
                  aria-label={`${label} step end return width`}
                  value={stored?.width ?? null}
                  inherited={FRAME_RETURN_WIDTH}
                  source="default"
                  onChange={(width) => {
                    if (width !== null && !(Number.isFinite(width) && width > 0)) return false;
                    commit(side, width === null ? null : { type: 'return', width });
                    return true;
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </PanelSection>
  );
}
