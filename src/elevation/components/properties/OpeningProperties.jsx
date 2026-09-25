import { Fragment, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  formatInches,
  openingGeometry,
  runBlocksOpening,
  validateOpeningPlacement,
} from '../../model/index.js';
import {
  deleteOpening,
  resizeOpening,
  setOpeningMeasureMode,
  updateOpening,
} from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field, { ReadOnlyValue } from './Field.jsx';
import StretchInput from './StretchInput.jsx';
import { RUN_TYPES } from './constants.js';

const OPENING_PLACEMENT_MESSAGES = {
  'opening-too-small': 'Opening is too small.',
  'opening-out-of-bounds': 'Opening casing must stay inside the wall.',
  'opening-too-tall': 'Opening casing must stay below the wall top.',
  'opening-conflict': 'Opening casing overlaps another opening.',
};

export default function OpeningProperties({ wall, opening, settings, placementMessage }) {
  const dispatch = useDispatch();
  const actionBase = { wallId: wall.id, openingId: opening.id };
  const geometry = openingGeometry(opening, wall.length, settings);
  const validation = validateOpeningPlacement(wall, opening, settings);
  const placementReason = !validation.ok
    ? validation.reason
    : OPENING_PLACEMENT_MESSAGES[placementMessage] ? placementMessage : null;
  const blockingRuns = wall.runs.filter(
    (run) => runBlocksOpening(run, opening, wall, settings),
  );
  const update = (changes) => dispatch(updateOpening({ ...actionBase, changes }));
  // Grow away from the wall end the offset is measured from, so the typed offset holds.
  const preferredOpeningGrow = opening.offsetFrom === 'right' ? 'left' : 'right';
  const [openingGrow, setOpeningGrow] = useState(preferredOpeningGrow);
  useEffect(() => {
    setOpeningGrow(preferredOpeningGrow);
  }, [preferredOpeningGrow, opening.id]);
  const hasWarnings = Boolean(placementReason) || blockingRuns.length > 0;

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Opening
          </h3>
          <button
            type="button"
            onClick={() => dispatch(deleteOpening(actionBase))}
            className="rounded bg-red-900/70 px-2.5 py-1.5 text-xs text-red-100 hover:bg-red-800"
          >
            Delete
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Label">
            <input
              type="text"
              value={opening.label}
              onChange={(event) => update({ label: event.target.value })}
              aria-label="Opening label"
              className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </Field>
          <Field label="Kind">
            <select
              value={opening.kind}
              onChange={(event) => {
                const kind = event.target.value;
                update({
                  kind,
                  sillZ: kind === 'door' ? 0 : settings.defaultWindowSillZ,
                });
              }}
              aria-label="Opening kind"
              className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="door">Door</option>
              <option value="window">Window</option>
            </select>
          </Field>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Measured to
        </h3>
        <div className="grid grid-cols-2 overflow-hidden rounded border border-gray-700">
          {[
            ['jamb', 'Jamb'],
            ['casing', 'Outside casing'],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => dispatch(setOpeningMeasureMode({ ...actionBase, mode }))}
              className={`px-2 py-2 text-xs font-medium transition-colors ${
                opening.measureMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-900/45 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-gray-500">
          Sizes and the corner distance below are to the {opening.measureMode === 'jamb'
            ? 'jamb'
            : 'outside of the casing'}.
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Size
        </h3>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="col-span-2">
            <StretchInput
              label="Width"
              value={opening.width}
              grow={openingGrow}
              onGrowChange={setOpeningGrow}
              onCommit={(width) => {
                dispatch(resizeOpening({ ...actionBase, width, grow: openingGrow }));
                setOpeningGrow(preferredOpeningGrow);
                return true;
              }}
              ariaLabel="Opening width"
            />
          </div>
          <Field label="Height">
            <InchInput
              value={opening.height}
              onCommit={(height) => update({ height })}
              aria-label="Opening height"
            />
          </Field>
          {opening.kind === 'window' && (
            <Field label="Sill height">
              <InchInput
                value={opening.sillZ}
                onCommit={(sillZ) => update({ sillZ })}
                aria-label="Opening sill height"
              />
            </Field>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Position
        </h3>
        <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-2">
          <span />
          <span className="text-center text-xs text-gray-500">Edge</span>
          <span className="text-center text-xs text-gray-500">Center</span>
          {['left', 'right'].map((side) => (
            <Fragment key={side}>
              <span className="text-xs capitalize text-gray-400">{side} end</span>
              {['edge', 'center'].map((anchor) => {
                const active = opening.offsetFrom === side
                  && (opening.offsetAnchor ?? 'edge') === anchor;
                return (
                  <div
                    key={anchor}
                    className={active ? 'rounded ring-1 ring-cyan-400' : ''}
                  >
                    <InchInput
                      value={geometry.offsets[side][opening.measureMode][anchor]}
                      onCommit={(offset) => update({
                        offset,
                        offsetFrom: side,
                        offsetAnchor: anchor,
                      })}
                      aria-label={`Opening ${side} ${anchor} position`}
                    />
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
        {(() => {
          const otherMode = opening.measureMode === 'jamb' ? 'casing' : 'jamb';
          const other = geometry.offsets;
          return (
            <p className="mt-3 text-xs leading-relaxed text-gray-500">
              {otherMode[0].toUpperCase() + otherMode.slice(1)}: left edge{' '}
              {formatInches(other.left[otherMode].edge)}, center{' '}
              {formatInches(other.left[otherMode].center)} · right edge{' '}
              {formatInches(other.right[otherMode].edge)}, center{' '}
              {formatInches(other.right[otherMode].center)}
            </p>
          );
        })()}
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Casing
        </h3>
        <label className="flex items-center justify-between rounded border border-gray-700 bg-gray-900/45 px-3 py-2 text-sm text-gray-300">
          Include casing
          <input
            type="checkbox"
            checked={Boolean(opening.casing)}
            onChange={(event) => update({
              casing: event.target.checked
                ? { width: settings.casingWidth, thickness: settings.casingThickness }
                : null,
            })}
            className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
          />
        </label>
        {opening.casing && (
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <Field label="Width">
              <InchInput
                value={opening.casing.width}
                onCommit={(width) => update({ casing: { ...opening.casing, width } })}
                aria-label="Opening casing width"
              />
            </Field>
            <Field label="Thickness">
              <InchInput
                value={opening.casing.thickness}
                onCommit={(thickness) => update({ casing: { ...opening.casing, thickness } })}
                aria-label="Opening casing thickness"
              />
            </Field>
          </div>
        )}
        <p className="mt-2 text-xs text-gray-500">
          {opening.kind === 'door'
            ? 'Doors are cased on three sides.'
            : 'Windows are cased on all four sides.'}
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Head height
        </h3>
        <ReadOnlyValue value={geometry.head} ariaLabel="Opening head height" />
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Warnings &amp; errors
        </h3>
        {!hasWarnings ? (
          <p className="mt-2 text-xs text-gray-500">No warnings or errors.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-xs">
            {placementReason && (
              <li className="rounded border border-red-900/80 bg-red-950/45 px-2.5 py-2 text-red-300">
                {OPENING_PLACEMENT_MESSAGES[placementReason] ?? placementReason}
              </li>
            )}
            {blockingRuns.map((run) => {
              const type = RUN_TYPES.find(([typeId]) => typeId === run.cabinetTypeId)?.[1]
                ?? 'Cabinet';
              return (
                <li
                  key={run.id}
                  className="rounded border border-amber-900/80 bg-amber-950/35 px-2.5 py-2 text-amber-300"
                >
                  Blocked by {type} run
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
