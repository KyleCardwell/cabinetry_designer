import PanelSection from '../panel/PanelSection.jsx';
import { useDispatch } from 'react-redux';
import { cellDepth } from '../../model/index.js';
import { runFaceThickness } from '../../model/corners.js';
import { setCellDepth } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import { autoInchProps } from '../autoInchProps.js';
import Field from './Field.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

export default function CellDepthSection({ wall, run, piece, item, settings }) {
  const dispatch = useDispatch();
  if (item.kind === 'void') return null;

  const cellBase = { wallId: wall.id, runId: run.id, cellId: item.id };

  return (
    <PanelSection id="piece.depth" title="Depth">
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Depth">
            <InchInput
              value={item.depth ?? null}
              {...autoInchProps({
                auto: cellDepth(piece, item, run.depth, settings, runFaceThickness(run, settings)),
                onCommit: (depth) => dispatch(setCellDepth({ ...cellBase, depth })) })}
              aria-label="Cell depth"
            />
          </Field>
          <Field label="Line up">
            <select
              value={item.align ?? 'face'}
              onChange={(event) => dispatch(setCellDepth({ ...cellBase, align: event.target.value }))}
              aria-label="Cell align"
              className={SELECT_CLASS}
            >
              <option value="face">Faces</option>
              <option value="back">Backs</option>
            </select>
          </Field>
        </div>
      </div>
    </PanelSection>
  );
}
