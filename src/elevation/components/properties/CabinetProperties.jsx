import { useDispatch } from 'react-redux';
import { formatInches, resolvePinTarget, runItems } from '../../model/index.js';
import {
  addItemAfter,
  lockItem,
  removeItem,
  setItemAbsorb,
  setItemPin,
  setItemWidth,
} from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import CellKindSection from './CellKindSection.jsx';
import CellSplitSection from './CellSplitSection.jsx';
import CellWrapSection from './CellWrapSection.jsx';
import FaceProperties from './FaceProperties.jsx';
import Field, { ReadOnlyValue } from './Field.jsx';
import { RUN_TYPES } from './constants.js';

export default function CabinetProperties({
  wall, run, piece, item, layout, cells, settings,
}) {
  const dispatch = useDispatch();
  const actionBase = { wallId: wall.id, runId: run.id, itemId: item.id };
  const locked = item.width !== null;
  const typeLabel = RUN_TYPES.find(([value]) => value === run.cabinetTypeId)?.[1] ?? 'Unknown';
  const actualCenter = piece.x + piece.width / 2;
  const items = runItems(run);
  const pinCount = items.filter((candidate) => candidate.pin).length;
  const warnsSecondPin = !item.pin && pinCount === 1;
  const itemIndex = items.findIndex((candidate) => candidate.id === item.id);
  const pinnedIndexes = items.flatMap((candidate, index) => (candidate.pin ? [index] : []));
  const previousPin = [...pinnedIndexes].reverse().find((index) => index < itemIndex);
  const nextPin = pinnedIndexes.find((index) => index > itemIndex);
  const interiorAutos = previousPin !== undefined && nextPin !== undefined
    ? items.slice(previousPin + 1, nextPin).filter(
      (candidate) => candidate.kind === 'cabinet' && candidate.width === null,
    )
    : [];
  const canAbsorb = item.width === null && interiorAutos.length > 1;
  const resolvedTarget = item.pin
    ? resolvePinTarget(item.pin, wall, wall.length, settings)
    : null;
  const defaultPin = {
    anchor: 'center',
    from: 'left',
    openingId: null,
    openingAnchor: 'center',
    value: actualCenter,
  };
  const updatePin = (changes) => dispatch(setItemPin({
    ...actionBase,
    pin: { ...(item.pin ?? defaultPin), ...changes },
  }));
  const datumValue = item.pin?.from === 'opening'
    ? `opening:${item.pin.openingId}`
    : item.pin?.from ?? 'left';

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Cabinet
        </h3>
        <Field label="Width">
          <InchInput
            value={piece.width}
            onCommit={(width) => dispatch(setItemWidth({ ...actionBase, width }))}
            aria-label="Cabinet width"
          />
        </Field>
        <button
          type="button"
          onClick={() => {
            if (locked) dispatch(setItemWidth({ ...actionBase, width: null }));
            else dispatch(lockItem({ ...actionBase, computedWidth: piece.width }));
          }}
          className="mt-2 w-full rounded bg-gray-700 px-3 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600"
        >
          {locked ? 'Unlock width' : 'Lock width'}
        </button>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Pin
        </h3>
        {warnsSecondPin && (
          <p className="mb-2 rounded border border-cyan-900/70 bg-cyan-950/30 p-2 text-xs text-cyan-200">
            A second pin locks both pinned cabinets to their current widths.
          </p>
        )}
        <label className="flex items-center justify-between rounded border border-gray-700 bg-gray-900/45 px-3 py-2 text-sm text-gray-300">
          Pin cabinet
          <input
            type="checkbox"
            checked={Boolean(item.pin)}
            onChange={(event) => dispatch(setItemPin({
              ...actionBase,
              pin: event.target.checked ? defaultPin : null,
            }))}
            className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
          />
        </label>
        {item.pin && (
          <div className="mt-3 space-y-2.5">
            <Field label="Datum">
              <select
                value={datumValue}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value.startsWith('opening:')) {
                    updatePin({
                      from: 'opening',
                      openingId: value.slice('opening:'.length),
                      openingAnchor: 'center',
                      value: 0,
                    });
                  } else {
                    updatePin({
                      from: value,
                      openingId: null,
                      value: value === 'right' ? wall.length - actualCenter : actualCenter,
                    });
                  }
                }}
                aria-label="Pin datum"
                className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="left">Left end of wall</option>
                <option value="right">Right end of wall</option>
                {item.pin.openingId
                  && !wall.openings.some((opening) => opening.id === item.pin.openingId)
                  && (
                    <option value={`opening:${item.pin.openingId}`}>
                      Missing opening
                    </option>
                  )}
                {wall.openings.map((opening) => (
                  <option key={opening.id} value={`opening:${opening.id}`}>
                    {opening.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cabinet anchor">
              <select
                value={item.pin.anchor}
                onChange={(event) => updatePin({ anchor: event.target.value })}
                aria-label="Pinned cabinet anchor"
                className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="left">Left edge</option>
                <option value="center">Center</option>
                <option value="right">Right edge</option>
              </select>
            </Field>
            {item.pin.from === 'opening' && (
              <Field label="Opening part">
                <select
                  value={item.pin.openingAnchor}
                  onChange={(event) => updatePin({ openingAnchor: event.target.value })}
                  aria-label="Pinned opening reference"
                  className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="center">Center</option>
                  <option value="casing-left">Casing left edge</option>
                  <option value="casing-right">Casing right edge</option>
                  <option value="jamb-left">Jamb left edge</option>
                  <option value="jamb-right">Jamb right edge</option>
                </select>
              </Field>
            )}
            <Field label="Distance">
              <InchInput
                value={item.pin.value}
                onCommit={(value) => updatePin({ value })}
                aria-label="Pin distance"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Resolved target">
                {resolvedTarget === null ? (
                  <div className="rounded border border-gray-700 bg-gray-900/60 px-2.5 py-1.5 text-sm text-amber-300">
                    Unresolved
                  </div>
                ) : (
                  <ReadOnlyValue value={resolvedTarget} ariaLabel="Resolved pin target" />
                )}
              </Field>
              <Field label="Actual center">
                <ReadOnlyValue value={actualCenter} ariaLabel="Actual cabinet center" />
              </Field>
            </div>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Remainder
        </h3>
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
            This only affects an auto cabinet inside a segment between two pins that contains more than one auto cabinet.
          </p>
        )}
        {Number.isFinite(piece.absorbed) && (
          <p className="mt-2 text-xs text-cyan-300">
            Absorbed {formatInches(piece.absorbed)}
          </p>
        )}
      </section>

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

      <CellKindSection wall={wall} run={run} piece={piece} item={item} />
      <CellSplitSection wall={wall} run={run} cellId={item.id} nested={false} />
      <CellWrapSection wall={wall} run={run} cellId={item.id} />

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
        <button
          type="button"
          onClick={() => dispatch(removeItem(actionBase))}
          className="rounded bg-red-900/70 px-2.5 py-2 text-xs text-red-100 hover:bg-red-800"
        >
          Remove
        </button>
      </section>

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
