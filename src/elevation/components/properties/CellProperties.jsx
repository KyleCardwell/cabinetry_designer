import { useDispatch } from 'react-redux';
import { findCell, runItems } from '../../model/index.js';
import {
  lockItem,
  setItemWidth,
  setTrackSize,
} from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import CellSplitSection from './CellSplitSection.jsx';
import FaceProperties from './FaceProperties.jsx';
import Field, { ReadOnlyValue } from './Field.jsx';

export default function CellProperties({
  wall, run, piece, item, layout, cells, settings,
}) {
  const dispatch = useDispatch();
  const context = findCell(run.grid, piece.id);
  if (!context) return null;

  const actionBase = { wallId: wall.id, runId: run.id };
  const axis = context.axis;
  const size = axis === 'row' ? piece.height : piece.width;
  const locked = context.track.size !== null;
  const column = layout.pieces.find((candidate) => candidate.id === piece.columnId);
  const columnItem = runItems(run).find((candidate) => candidate.id === piece.columnId);
  const columnLocked = columnItem?.width != null;

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Cell
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <Field label={axis === 'row' ? 'Height' : 'Width'}>
            <InchInput
              value={size}
              onCommit={(value) => dispatch(setTrackSize({
                ...actionBase,
                trackId: context.track.id,
                size: value,
              }))}
              aria-label={`Cell ${axis === 'row' ? 'height' : 'width'}`}
            />
          </Field>
          <Field label={axis === 'row' ? 'Width' : 'Height'}>
            <ReadOnlyValue
              value={axis === 'row' ? piece.width : piece.height}
              ariaLabel={`Cell ${axis === 'row' ? 'width' : 'height'}`}
            />
          </Field>
        </div>
        <button
          type="button"
          onClick={() => dispatch(setTrackSize({
            ...actionBase,
            trackId: context.track.id,
            size: locked ? null : size,
          }))}
          className="mt-2 w-full rounded bg-gray-700 px-3 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600"
        >
          {locked ? `Unlock ${axis === 'row' ? 'height' : 'width'}` : `Lock ${axis === 'row' ? 'height' : 'width'}`}
        </button>
      </section>

      {column && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Column
          </h3>
          <Field label="Column width">
            <InchInput
              value={column.width}
              onCommit={(width) => dispatch(setItemWidth({
                ...actionBase,
                itemId: piece.columnId,
                width,
              }))}
              aria-label="Column width"
            />
          </Field>
          <button
            type="button"
            onClick={() => {
              if (columnLocked) {
                dispatch(setItemWidth({ ...actionBase, itemId: piece.columnId, width: null }));
              } else {
                dispatch(lockItem({
                  ...actionBase,
                  itemId: piece.columnId,
                  computedWidth: column.width,
                }));
              }
            }}
            className="mt-2 w-full rounded bg-gray-700 px-3 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600"
          >
            {columnLocked ? 'Unlock width' : 'Lock width'}
          </button>
        </section>
      )}

      <CellSplitSection wall={wall} run={run} cellId={item.id} nested />

      <FaceProperties
        wall={wall}
        run={run}
        piece={piece}
        item={item}
        layout={layout}
        cells={cells}
        settings={settings}
      />
    </div>
  );
}
