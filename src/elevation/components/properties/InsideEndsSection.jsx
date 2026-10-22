import { useDispatch } from 'react-redux';
import { FRAME_RETURN_WIDTH, insideEndSides, isInsetStyle, resolveStyle } from '../../model/index.js';
import { setInsideEnd } from '../../store/elevationSlice.js';
import PanelSection from '../panel/PanelSection.jsx';
import OverrideInput from '../OverrideInput.jsx';
import { controlBorder } from '../overrideHelpers.js';
import Field from './Field.jsx';

export default function InsideEndsSection({ room, wall, run, item, cells, settings, side: onlySide }) {
  const dispatch = useDispatch();
  if (item?.kind !== 'cabinet') return null;
  // Generated panels occupy the opening; exclude them when checking the owner's neighbours.
  const sides = insideEndSides(run, {
    ...cells, pieces: cells.pieces.filter((piece) => !piece.inside),
  }, settings).filter((entry) => entry.leafId === item.id
    && (!onlySide || entry.side === onlySide));
  if (!sides.length) return null;
  const framed = Boolean(run._frame) || isInsetStyle(resolveStyle(settings, room, run));
  const commit = (side, value) => dispatch(setInsideEnd({
    wallId: wall.id, runId: run.id, cellId: item.id, side, value,
  }));

  return (
    <PanelSection id="piece.insideEnds" title="Inside ends">
      <div className="space-y-2">
        {sides.map(({ side }) => {
          const stored = item.insideEnds?.[side];
          const value = stored === 'none' ? 'none' : framed && stored?.type === 'return' ? 'return' : '';
          const label = side === 'left' ? 'Left' : 'Right';
          return (
            <div key={side} className="grid grid-cols-2 gap-2">
              <Field label={label}>
                <select
                  aria-label={`${label} inside end`}
                  value={value}
                  onChange={(event) => commit(side, event.target.value === 'return'
                    ? { type: 'return' } : event.target.value || null)}
                  className={`w-full rounded border ${controlBorder(value !== '')} bg-gray-900 px-2.5 py-1.5 text-sm ${value === '' ? 'text-gray-500' : 'text-gray-100'} focus:border-blue-500 focus:outline-none`}
                >
                  <option value="">End panel</option>
                  {framed && <option value="return">Frame return</option>}
                  <option value="none">None</option>
                </select>
              </Field>
              {value === 'return' && (
                <OverrideInput
                  kind="number"
                  label="Return width"
                  aria-label={`${label} inside end return width`}
                  value={stored.width ?? null}
                  inherited={FRAME_RETURN_WIDTH}
                  source="default"
                  onChange={(width) => {
                    if (width !== null && !(Number.isFinite(width) && width > 0)) return false;
                    commit(side, { type: 'return', ...(width === null ? {} : { width }) });
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
