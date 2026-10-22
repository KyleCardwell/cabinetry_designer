import { useDispatch } from 'react-redux';
import { resolveTopSegments } from '../../model/topSegments.js';
import { formatInches } from '../../model/units.js';
import { setColumnStep } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import PanelSection from '../panel/PanelSection.jsx';
import Field from './Field.jsx';

export default function ColumnStepFields({ wall, run, item, nested = false }) {
  const dispatch = useDispatch();
  if (item?.kind !== 'cabinet') return null;
  const segment = resolveTopSegments(run).segments.find(({ columnIds }) => columnIds.includes(item.id));
  const segmentNumber = segment ? run.topSegments.findIndex(({ id }) => id === segment.id) + 1 : null;

  return (
    <PanelSection id="piece.steps" title="Column steps">
      <div className="grid grid-cols-2 gap-2">
        {['top', 'bottom'].map((edge) => {
          const fromSegment = edge === 'top' && segment?.mode === 'box';
          const title = edge === 'top'
            ? nested ? 'Column top drop' : 'Top drop'
            : nested ? 'Column bottom up' : 'Bottom up';
          return (
            <Field key={edge} label={title}>
              <InchInput
                value={fromSegment ? segment.drop : item[edge]?.value ?? null}
                readOnly={fromSegment}
                allowBlank
                placeholder="0"
                onCommit={(value) => {
                  if (value !== null && (!Number.isFinite(value) || value < 0)) return false;
                  dispatch(setColumnStep({ wallId: wall.id, runId: run.id, itemId: item.id, edge, value }));
                  return true;
                }}
                aria-label={title}
              />
              {fromSegment && (
                <p className="mt-1 text-xs text-gray-500">{`From top segment ${segmentNumber}`}</p>
              )}
              {fromSegment && item.top?.source === 'manual' && (
                <p className="mt-1 text-xs text-amber-400">{`⚠ Manual ${formatInches(item.top.value)} ignored`}</p>
              )}
              {edge === 'top' && segment?.mode === 'overlap' && (
                <p className="mt-1 text-xs text-gray-500">{`Top overlap ${formatInches(segment.drop)} (segment ${segmentNumber})`}</p>
              )}
            </Field>
          );
        })}
      </div>
    </PanelSection>
  );
}
