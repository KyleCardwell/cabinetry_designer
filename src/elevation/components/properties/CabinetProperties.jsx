import { useDispatch } from 'react-redux';
import PanelSection from '../panel/PanelSection.jsx';
import PanelTabs from '../panel/PanelTabs.jsx';
import { formatInches, placedAt, runItems } from '../../model/index.js';
import {
  addItemAfter,
  setItemAbsorb,
  setItemWidth,
  setTrackGap,
} from '../../store/elevationSlice.js';
import OverrideInput from '../OverrideInput.jsx';
import RunBaseCutoutsSection from './RunBaseCutoutsSection.jsx';
import RunTopSegmentsSection from './RunTopSegmentsSection.jsx';
import CellDepthSection from './CellDepthSection.jsx';
import InsideEndsSection from './InsideEndsSection.jsx';
import StepEndsSection from './StepEndsSection.jsx';
import CellKindSection from './CellKindSection.jsx';
import CellSplitSection from './CellSplitSection.jsx';
import CellWrapSection from './CellWrapSection.jsx';
import ColumnStepFields from './ColumnStepFields.jsx';
import ColumnActionsSection from './ColumnActionsSection.jsx';
import FaceProperties from './FaceProperties.jsx';
import ColumnLineSection from './ColumnLineSection.jsx';
import PinSection from './PinSection.jsx';
import GapField from './GapField.jsx';
import { RUN_TYPES } from './constants.js';

const NO_INSET = { left: 0, right: 0 };

export default function CabinetProperties({
  room, wall, run, piece, item, layout, cells, settings, numbers, inset = NO_INSET,
}) {
  const dispatch = useDispatch();
  const actionBase = { wallId: wall.id, runId: run.id, itemId: item.id };
  const locked = item.width !== null;
  const typeLabel = RUN_TYPES.find(([value]) => value === run.cabinetTypeId)?.[1] ?? 'Unknown';
  const trim = inset.left + inset.right;
  const boxWidth = piece.width - trim;
  const items = runItems(run);
  const itemIndex = items.findIndex((candidate) => candidate.id === item.id);
  const next = items[itemIndex + 1];
  const gapFallback = next && item.kind === 'cabinet' && next.kind === 'cabinet' ? run._seamGap ?? 0 : 0;
  const pinnedIndexes = items.flatMap((candidate, index) => (placedAt(candidate) ? [index] : []));
  const previousPin = [...pinnedIndexes].reverse().find((index) => index < itemIndex);
  const nextPin = pinnedIndexes.find((index) => index > itemIndex);
  const interiorAutos = previousPin !== undefined && nextPin !== undefined
    ? items.slice(previousPin + 1, nextPin).filter(
      (candidate) => candidate.kind === 'cabinet' && candidate.width === null,
    )
    : [];
  const canAbsorb = item.width === null && interiorAutos.length > 1;

  const tabs = [
    { id: 'size', label: 'Size' },
    { id: 'style', label: 'Faces & style' },
    { id: 'inside', label: 'Inside' },
  ];

  return (
    <div className="space-y-5">
      <CellKindSection wall={wall} run={run} piece={piece} item={item} />
      <PanelTabs id="piece" tabs={tabs}>
        {(active) => (
          <div className="mt-4 space-y-5">
            {active === 'size' && (
              <>
                <PanelSection id="piece.cabinet" title="Cabinet" badge={Number(locked) + Number(item.gap != null)}>
                  <OverrideInput
                    kind="number"
                    label="Box width"
                    value={locked ? boxWidth : null}
                    inherited={boxWidth}
                    source="auto"
                    onChange={(width) => dispatch(setItemWidth({ ...actionBase, width: width === null ? null : width + trim }))}
                    aria-label="Cabinet box width"
                  />
                  {boxWidth !== piece.width && (
                    <p className="mt-1 text-xs text-gray-500">
                      Frame section: {formatInches(piece.width)}
                    </p>
                  )}
                  {next && (
                    <div className="mt-2">
                      <GapField
                        label="Gap right (blank = run)"
                        value={item.gap}
                        fallback={gapFallback}
                        onCommit={(gap) => dispatch(setTrackGap({
                          wallId: wall.id, runId: run.id, trackId: `${item.id}:col`, gap,
                        }))}
                        ariaLabel="Gap right"
                      />
                    </div>
                  )}
                </PanelSection>

                <ColumnLineSection wall={wall} run={run} item={item} piece={piece} />
                <PinSection room={room} wall={wall} run={run} item={item} piece={piece} settings={settings} />

                <ColumnStepFields wall={wall} run={run} item={item} />

                <PanelSection id="piece.remainder" title="Remainder">
                  <label className={`flex items-center justify-between rounded border border-gray-700 bg-gray-900/45 px-3 py-2 text-sm ${canAbsorb ? 'text-gray-300' : 'text-gray-500'}`}>
                    Absorb odd amount
                    <input
                      type="checkbox"
                      checked={Boolean(item.absorb)}
                      disabled={!canAbsorb}
                      onChange={(event) => dispatch(setItemAbsorb({
                        ...actionBase,
                        value: event.target.checked,
                      }))}
                      className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </label>
                  {!canAbsorb && (
                    <p className="mt-2 text-xs leading-relaxed text-gray-500">
                      This only affects an auto cabinet inside a segment between two placed columns (on lines or following returns) that contains more than one auto cabinet.
                    </p>
                  )}
                  {Number.isFinite(piece.absorbed) && (
                    <p className="mt-2 text-xs text-cyan-300">
                      Absorbed {formatInches(piece.absorbed)}
                    </p>
                  )}
                </PanelSection>

                <CellDepthSection wall={wall} run={run} piece={piece} item={item} settings={settings} />
                <InsideEndsSection room={room} wall={wall} run={run} item={item} cells={cells} settings={settings} />
                <StepEndsSection room={room} wall={wall} run={run} item={item} cells={cells} settings={settings} />
                <CellSplitSection wall={wall} run={run} cellId={item.id} nested={false} />
                <CellWrapSection wall={wall} run={run} cellId={item.id} />

                <RunBaseCutoutsSection room={room} wall={wall} run={run} piece={piece} settings={settings} numbers={numbers} />
                <RunTopSegmentsSection room={room} wall={wall} run={run} piece={piece} settings={settings} numbers={numbers} />

                <section className="grid grid-cols-2 gap-2 rounded border border-gray-700 bg-gray-900/45 p-3 text-xs">
                  <div>
                    <p className="text-gray-500">Run type</p>
                    <p className="mt-1 text-gray-200">{typeLabel}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Run height</p>
                    <p className="mt-1 text-gray-200">{formatInches(run.height)}</p>
                  </div>
                </section>

                <section className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => dispatch(addItemAfter({ ...actionBase, kind: 'cabinet' }))}
                    className="rounded bg-gray-700 px-2.5 py-2 text-xs text-gray-100 hover:bg-gray-600"
                  >
                    Add cabinet right
                  </button>
                  <button
                    type="button"
                    onClick={() => dispatch(addItemAfter({ ...actionBase, kind: 'filler' }))}
                    className="rounded bg-gray-700 px-2.5 py-2 text-xs text-gray-100 hover:bg-gray-600"
                  >
                    Add filler right
                  </button>
                </section>
                <ColumnActionsSection wall={wall} run={run} cellId={item.id} />
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
          </div>
        )}
      </PanelTabs>
    </div>
  );
}
