import { useDispatch } from 'react-redux';
import {
  cellBlindSides,
  cellDepth,
  findCell,
  formatInches,
  formatInchesInput,
  MAX_SHELVES,
  runItems,
} from '../../model/index.js';
import { runFaceThickness } from '../../model/corners.js';
import {
  lockItem,
  setCellBlind,
  setCellDepth,
  setCellShelves,
  setItemWidth,
  setTrackGap,
  setTrackSize,
} from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import CellKindSection from './CellKindSection.jsx';
import CellSplitSection from './CellSplitSection.jsx';
import CellWrapSection from './CellWrapSection.jsx';
import FaceProperties from './FaceProperties.jsx';
import Field, { ReadOnlyValue } from './Field.jsx';
import GapField from './GapField.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const HEADING_CLASS = 'mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400';
const NO_INSET = { left: 0, right: 0 };

export default function CellProperties({
  wall, run, piece, item, layout, cells, settings, insets,
}) {
  const dispatch = useDispatch();
  const context = findCell(run.grid, piece.id);
  if (!context) return null;

  const actionBase = { wallId: wall.id, runId: run.id };
  const axis = context.axis;
  const inset = insets?.get(piece.id) ?? NO_INSET;
  const trim = inset.left + inset.right;
  const boxWidth = piece.width - trim;
  const size = axis === 'row' ? piece.height : boxWidth;
  const locked = context.track.size !== null;
  const column = layout.pieces.find((candidate) => candidate.id === piece.columnId);
  const columnInset = insets?.get(piece.columnId) ?? NO_INSET;
  const columnTrim = columnInset.left + columnInset.right;
  const columnBoxWidth = column ? column.width - columnTrim : 0;
  const columnItem = runItems(run).find((candidate) => candidate.id === piece.columnId);
  const columnLocked = columnItem?.width != null;
  const cellBase = { ...actionBase, cellId: item.id };
  const isCabinet = item.kind === 'cabinet';
  const blindSides = isCabinet
    ? cellBlindSides(run.grid, item.id).filter((side) => run.ends[side].type === 'blind')
    : [];
  const trackKey = axis === 'row' ? 'rows' : 'cols';
  const span = axis === 'row' ? context.cell.rowSpan : context.cell.colSpan;
  const hasTrackAfter = context.cell[axis] + span < context.parent[trackKey].length;
  const columnIndex = runItems(run).findIndex((candidate) => candidate.id === piece.columnId);
  const hasColumnAfter = columnIndex >= 0 && columnIndex < runItems(run).length - 1;

  return (
    <div className="space-y-5">
      <CellKindSection wall={wall} run={run} piece={piece} item={item} />

      <section>
        <h3 className={HEADING_CLASS}>Size</h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field label={axis === 'row' ? 'Height' : 'Box width'}>
            <InchInput
              value={size}
              onCommit={(value) => dispatch(setTrackSize({
                ...actionBase,
                trackId: context.track.id,
                size: axis === 'row' ? value : value + trim,
              }))}
              aria-label={`Cell ${axis === 'row' ? 'height' : 'width'}`}
            />
            {axis === 'col' && boxWidth !== piece.width && (
              <p className="mt-1 text-xs text-gray-500">
                Frame section: {formatInches(piece.width)}
              </p>
            )}
          </Field>
          <Field label={axis === 'row' ? 'Box width' : 'Height'}>
            <ReadOnlyValue
              value={axis === 'row' ? boxWidth : piece.height}
              ariaLabel={`Cell ${axis === 'row' ? 'width' : 'height'}`}
            />
            {axis === 'row' && boxWidth !== piece.width && (
              <p className="mt-1 text-xs text-gray-500">
                Frame section: {formatInches(piece.width)}
              </p>
            )}
          </Field>
        </div>
        <button
          type="button"
          onClick={() => dispatch(setTrackSize({
            ...actionBase,
            trackId: context.track.id,
            size: locked ? null : (axis === 'row' ? size : size + trim),
          }))}
          className="mt-2 w-full rounded bg-gray-700 px-3 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600"
        >
          {locked ? `Unlock ${axis === 'row' ? 'height' : 'width'}` : `Lock ${axis === 'row' ? 'height' : 'width'}`}
        </button>
        {hasTrackAfter && (
          <div className="mt-2">
            <GapField
              label={axis === 'row' ? 'Gap below (blank = none)' : 'Gap right (blank = run)'}
              value={context.track.gap}
              fallback={axis === 'row' ? 0 : run._seamGap ?? 0}
              onCommit={(gap) => dispatch(setTrackGap({ ...actionBase, trackId: context.track.id, gap }))}
              ariaLabel={axis === 'row' ? 'Cell gap below' : 'Cell gap right'}
            />
          </div>
        )}
      </section>

      {column && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Column
          </h3>
          <Field label="Box width">
            <InchInput
              value={columnBoxWidth}
              onCommit={(width) => dispatch(setItemWidth({
                ...actionBase,
                itemId: piece.columnId,
                width: width + columnTrim,
              }))}
              aria-label="Column box width"
            />
            {columnBoxWidth !== column.width && (
              <p className="mt-1 text-xs text-gray-500">
                Frame section: {formatInches(column.width)}
              </p>
            )}
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
          {hasColumnAfter && (
            <div className="mt-2">
              <GapField
                label="Column gap right (blank = run)"
                value={columnItem?.gap}
                fallback={run._seamGap ?? 0}
                onCommit={(gap) => dispatch(setTrackGap({
                  ...actionBase, trackId: `${piece.columnId}:col`, gap,
                }))}
                ariaLabel="Column gap right"
              />
            </div>
          )}
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
                placeholder={formatInchesInput(cellDepth(piece, item, run.depth, settings, runFaceThickness(run, settings)))}
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

      <CellSplitSection
        wall={wall}
        run={run}
        cellId={item.id}
        nested={context.depth > 0}
        removable
        canSplit={isCabinet}
      />
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
