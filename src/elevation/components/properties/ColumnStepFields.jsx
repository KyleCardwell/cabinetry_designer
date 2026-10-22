import { useDispatch } from 'react-redux';
import { setColumnStep } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import PanelSection from '../panel/PanelSection.jsx';
import Field from './Field.jsx';

export default function ColumnStepFields({ wall, run, item, nested = false }) {
  const dispatch = useDispatch();
  if (item?.kind !== 'cabinet') return null;

  return (
    <PanelSection id="piece.steps" title="Column steps">
      <div className="grid grid-cols-2 gap-2">
        {['top', 'bottom'].map((edge) => {
          const title = edge === 'top'
            ? nested ? 'Column top drop' : 'Top drop'
            : nested ? 'Column bottom up' : 'Bottom up';
          return (
            <Field key={edge} label={title}>
              <InchInput
                value={item[edge]?.value ?? null}
                allowBlank
                placeholder="0"
                onCommit={(value) => {
                  if (value !== null && (!Number.isFinite(value) || value < 0)) return false;
                  dispatch(setColumnStep({ wallId: wall.id, runId: run.id, itemId: item.id, edge, value }));
                  return true;
                }}
                aria-label={title}
              />
            </Field>
          );
        })}
      </div>
    </PanelSection>
  );
}
