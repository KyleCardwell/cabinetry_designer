import { useDispatch } from 'react-redux';
import {
  cellBlindSides,
  findCell,
  formatInchesInput,
  MAX_SHELVES,
  panelOrientation,
  runItems,
} from '../../model/index.js';
import {
  lockItem,
  setCellBlind,
  setCellDepth,
  setCellKind,
  setCellShelves,
  setItemWidth,
  setTrackSize,
} from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import CellSplitSection from './CellSplitSection.jsx';
import CellWrapSection from './CellWrapSection.jsx';
import FaceProperties from './FaceProperties.jsx';
import Field, { ReadOnlyValue } from './Field.jsx';

const KIND_OPTIONS = [
  ['cabinet', 'Cabinet'],
  ['panel', 'Panel'],
  ['void', 'Open (nothing)'],
  ['shelves', 'Floating shelves'],
];
const ORIENTATION_LABELS = { side: 'Side panel', top: 'Top / bottom panel', back: 'Back panel' };
const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const HEADING_CLASS = 'mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400';

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
  const cellBase = { ...actionBase, cellId: item.id };
  const isCabinet = item.kind === 'cabinet';
  const blindSides = isCabinet
    ? cellBlindSides(run.grid, item.id).filter((side) => run.ends[side].type === 'blind')
    : [];
  const orientation = panelOrientation(piece);

  return (
    <div className="space-y-5">
      <section>
        <h3 className={HEADING_CLASS}>Cell</h3>
        <Field label="Kind">
          <select
            value={item.kind}
            onChange={(event) => dispatch(setCellKind({ ...cellBase, kind: event.target.value }))}
            aria-label="Cell kind"
            className={SELECT_CLASS}
          >
            {KIND_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        {orientation && (
          <p className="mt-1.5 text-xs text-gray-500">{ORIENTATION_LABELS[orientation]}</p>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2">
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

      {item.kind !== 'void' && (
        <section>
          <h3 className={HEADING_CLASS}>Depth</h3>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Depth">
              <InchInput
                value={item.depth ?? null}
                allowBlank
                placeholder={formatInchesInput(run.depth)}
                onCommit={(depth) => dispatch(setCellDepth({ ...cellBase, depth }))}
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
        </section>
      )}

      {item.kind === 'shelves' && (
        <section>
          <h3 className={HEADING_CLASS}>Shelves</h3>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Count">
              <input
                type="number"
                min={1}
                max={MAX_SHELVES}
                value={item.shelves?.count ?? 1}
                onChange={(event) => dispatch(setCellShelves({
                  ...cellBase,
                  count: Number(event.target.value),
                }))}
                aria-label="Shelf count"
                className={SELECT_CLASS}
              />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={Boolean(item.shelves?.back)}
                onChange={(event) => dispatch(setCellShelves({
                  ...cellBase,
                  back: event.target.checked,
                }))}
              />
              Back panel
            </label>
          </div>
        </section>
      )}

      {blindSides.length > 0 && (
        <section>
          <h3 className={HEADING_CLASS}>Blind</h3>
          <div className="grid grid-cols-2 gap-2">
            {blindSides.map((side) => (
              <Field key={side} label={`Blind box (${side})`}>
                <InchInput
                  value={item.blind?.[side] ?? null}
                  allowBlank
                  placeholder="not blind"
                  onCommit={(width) => dispatch(setCellBlind({ ...cellBase, side, width }))}
                  aria-label={`Cell ${side} blind box width`}
                />
              </Field>
            ))}
          </div>
        </section>
      )}

      <CellSplitSection wall={wall} run={run} cellId={item.id} nested canSplit={isCabinet} />
      {isCabinet && <CellWrapSection wall={wall} run={run} cellId={item.id} />}

      {isCabinet && (
        <FaceProperties
          wall={wall}
          run={run}
          piece={piece}
          item={item}
          layout={layout}
          cells={cells}
          settings={settings}
        />
      )}
    </div>
  );
}
