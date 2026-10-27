import { useDispatch } from 'react-redux';
import PanelSection from '../panel/PanelSection.jsx';
import PanelTabs from '../panel/PanelTabs.jsx';
import {
  cellBlindSides,
  findCell,
  formatInches,
  MAX_SHELVES,
  runItems,
} from '../../model/index.js';
import {
  setCellBlind,
  setCellShelves,
  setItemWidth,
  setTrackGap,
  setTrackSize,
} from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import OverrideInput from '../OverrideInput.jsx';
import RunBaseCutoutsSection from './RunBaseCutoutsSection.jsx';
import CellDepthSection from './CellDepthSection.jsx';
import InsideEndsSection from './InsideEndsSection.jsx';
import StepEndsSection from './StepEndsSection.jsx';
import CellKindSection from './CellKindSection.jsx';
import CellSplitSection from './CellSplitSection.jsx';
import CellWrapSection from './CellWrapSection.jsx';
import ColumnStepFields from './ColumnStepFields.jsx';
import ColumnActionsSection from './ColumnActionsSection.jsx';
import FaceProperties from './FaceProperties.jsx';
import Field, { ReadOnlyValue } from './Field.jsx';
import GapField from './GapField.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const NO_INSET = { left: 0, right: 0 };

export default function CellProperties({
  room, wall, run, piece, item, layout, cells, settings, numbers, insets,
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

  // A cell stacked in a column is as wide as its column: its width field sets the column (UI10).
  const widthIsColumn = Boolean(column) && axis === 'row' && Math.abs(boxWidth - columnBoxWidth) < 1e-6;
  const columnWidthInput = (label) => column && (
    <div>
      <OverrideInput
        kind="number"
        label={label}
        value={columnLocked ? columnBoxWidth : null}
        inherited={columnBoxWidth}
        source="auto"
        onChange={(width) => dispatch(setItemWidth({
          ...actionBase,
          itemId: piece.columnId,
          width: width === null ? null : width + columnTrim,
        }))}
        aria-label="Column box width"
      />
      {columnBoxWidth !== column.width && (
        <p className="mt-1 text-xs text-gray-500">
          Frame section: {formatInches(column.width)}
        </p>
      )}
    </div>
  );

  const tabs = [
    { id: 'size', label: 'Size' },
    ...(isCabinet ? [{ id: 'style', label: 'Faces & style' }] : []),
    ...(isCabinet || item.kind === 'shelves' ? [{ id: 'inside', label: 'Inside' }] : []),
  ];

  return (
    <div className="space-y-5">
      <CellKindSection wall={wall} run={run} piece={piece} item={item} />
      <PanelTabs id="piece" tabs={tabs}>
        {(active) => (
          <div className="mt-4 space-y-5">
            {active === 'size' && (
              <>
                <PanelSection id="piece.size" title="Size">
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <OverrideInput
                        kind="number"
                        label={axis === 'row' ? 'Height' : 'Box width'}
                        value={locked ? size : null}
                        inherited={size}
                        source="auto"
                        onChange={(value) => dispatch(setTrackSize({
                          ...actionBase,
                          trackId: context.track.id,
                          size: value === null ? null : axis === 'row' ? value : value + trim,
                        }))}
                        aria-label={`Cell ${axis === 'row' ? 'height' : 'width'}`}
                      />
                      {axis === 'col' && boxWidth !== piece.width && (
                        <p className="mt-1 text-xs text-gray-500">
                          Frame section: {formatInches(piece.width)}
                        </p>
                      )}
                    </div>
                    {widthIsColumn ? columnWidthInput('Box width') : (
                    <Field label={axis === 'row' ? 'Box width' : 'Height'} tag="auto">
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
                    )}
                  </div>
                  {!widthIsColumn && column && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {columnWidthInput('Column box width')}
                    </div>
                  )}
                  <ColumnStepFields wall={wall} run={run} item={columnItem} nested />
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

                  {column && hasColumnAfter && (
                    <div className="mt-2">
                      {(
                        <div>
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
                    </div>
                  )}
                </PanelSection>

                <CellDepthSection wall={wall} run={run} piece={piece} item={item} settings={settings} />
                {isCabinet && <InsideEndsSection room={room} wall={wall} run={run} item={item} cells={cells} settings={settings} />}
                {isCabinet && <StepEndsSection room={room} wall={wall} run={run} item={item} cells={cells} settings={settings} />}

                {blindSides.length > 0 && (
                  <PanelSection id="piece.blind" title="Blind">
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
                  </PanelSection>
                )}

                <CellSplitSection
                  wall={wall}
                  run={run}
                  cellId={item.id}
                  nested={context.depth > 0}
                  removable={context.depth > 0}
                  canSplit={isCabinet}
                />
                {isCabinet && <CellWrapSection wall={wall} run={run} cellId={item.id} />}
                <ColumnActionsSection wall={wall} run={run} cellId={piece.columnId ?? item.id} />
                <RunBaseCutoutsSection room={room} wall={wall} run={run} piece={piece} settings={settings} numbers={numbers} />
              </>
            )}
            {active === 'style' && (
              <FaceProperties
                part="style"
                wall={wall}
                run={run}
                piece={piece}
                item={item}
                layout={layout}
                cells={cells}
                settings={settings}
              />
            )}
            {active === 'inside' && (
              <>
                {item.kind === 'shelves' && (
                  <PanelSection id="piece.shelves" title="Shelves">
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
                  </PanelSection>
                )}
                {isCabinet && (
                  <FaceProperties
                    part="inside"
                    wall={wall}
                    run={run}
                    piece={piece}
                    item={item}
                    layout={layout}
                    cells={cells}
                    settings={settings}
                  />
                )}
              </>
            )}
          </div>
        )}
      </PanelTabs>
    </div>
  );
}
