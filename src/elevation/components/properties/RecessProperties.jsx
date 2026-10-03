import { Fragment, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  RECESS_PLACEMENT_MESSAGES,
  recessGeometry,
  validateRecessPlacement,
} from '../../model/index.js';
import { deleteRecess, resizeRecess, updateRecess } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';
import StretchInput from './StretchInput.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const HEADING_CLASS = 'mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400';

/** A recess or projection (SPEC-38): kind, size, how high, how deep, and where, measured like a window. */
export default function RecessProperties({ wall, recess, placementMessage }) {
  const dispatch = useDispatch();
  const actionBase = { wallId: wall.id, recessId: recess.id };
  const geometry = recessGeometry(recess, wall.length, wall.height);
  const projection = recess.kind === 'projection';
  const toCeiling = recess.height === null;
  const update = (changes) => dispatch(updateRecess({ ...actionBase, changes }));
  // Grow away from the wall end the offset is measured from, so the typed offset holds.
  const preferredGrow = recess.offsetFrom === 'right' ? 'left' : 'right';
  const [grow, setGrow] = useState(preferredGrow);
  useEffect(() => {
    setGrow(preferredGrow);
  }, [preferredGrow, recess.id]);
  const validation = validateRecessPlacement(wall, recess);
  const reason = !validation.ok
    ? validation.reason
    : RECESS_PLACEMENT_MESSAGES[placementMessage] ? placementMessage : null;

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            {projection ? 'Projection' : 'Recess'}
          </h3>
          <button
            type="button"
            onClick={() => dispatch(deleteRecess(actionBase))}
            className="rounded bg-red-900/70 px-2.5 py-1.5 text-xs text-red-100 hover:bg-red-800"
          >
            Delete
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Label">
            <input
              type="text"
              value={recess.label}
              onChange={(event) => update({ label: event.target.value })}
              aria-label="Recess label"
              className={SELECT_CLASS}
            />
          </Field>
          <Field label="Kind">
            <select
              value={recess.kind}
              onChange={(event) => update({ kind: event.target.value })}
              aria-label="Recess kind"
              className={SELECT_CLASS}
            >
              <option value="recess">Recess</option>
              <option value="projection">Projection</option>
            </select>
          </Field>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-gray-500">
          {projection
            ? 'Built out from the wall. Cabinets drawn on it sit on its face; beside it, its sides stop them.'
            : 'Cut back into the wall. Cabinets drawn inside it sit on its back and stop at its sides.'}
        </p>
      </section>

      <section>
        <h3 className={HEADING_CLASS}>Size</h3>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="col-span-2">
            <StretchInput
              label="Width"
              value={recess.width}
              grow={grow}
              onGrowChange={setGrow}
              onCommit={(width) => {
                dispatch(resizeRecess({ ...actionBase, width, grow }));
                setGrow(preferredGrow);
                return true;
              }}
              ariaLabel="Recess width"
            />
          </div>
          <Field label={projection ? 'Sticks out' : 'Depth'}>
            <InchInput
              value={recess.depth}
              onCommit={(depth) => depth > 0 && update({ depth })}
              aria-label="Recess depth"
            />
          </Field>
          <Field label="Bottom (0 = floor)">
            <InchInput
              value={recess.bottom}
              onCommit={(bottom) => bottom !== null && bottom >= 0 && update({ bottom })}
              aria-label="Recess bottom"
            />
          </Field>
          <label className="col-span-2 flex items-center justify-between rounded border border-gray-700 bg-gray-900/45 px-3 py-2 text-sm text-gray-300">
            Up to the ceiling
            <input
              type="checkbox"
              checked={toCeiling}
              onChange={(event) => update({
                height: event.target.checked ? null : Math.max(1, geometry.top - recess.bottom),
              })}
              className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
            />
          </label>
          {!toCeiling && (
            <>
              <Field label="Height">
                <InchInput
                  value={recess.height}
                  onCommit={(height) => height > 0 && update({ height })}
                  aria-label="Recess height"
                />
              </Field>
              <Field label="Under its top">
                <select
                  value={recess.molding}
                  onChange={(event) => update({ molding: event.target.value })}
                  aria-label="Recess top molding"
                  className={SELECT_CLASS}
                >
                  <option value="crown">Crown</option>
                  <option value="topMold">Top mold</option>
                  <option value="none">None</option>
                </select>
              </Field>
            </>
          )}
        </div>
      </section>

      <section>
        <h3 className={HEADING_CLASS}>Position</h3>
        <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-2">
          <span />
          <span className="text-center text-xs text-gray-500">Edge</span>
          <span className="text-center text-xs text-gray-500">Center</span>
          {['left', 'right'].map((side) => (
            <Fragment key={side}>
              <span className="text-xs capitalize text-gray-400">{side} end</span>
              {['edge', 'center'].map((anchor) => {
                const active = recess.offsetFrom === side && (recess.offsetAnchor ?? 'edge') === anchor;
                return (
                  <div key={anchor} className={active ? 'rounded ring-1 ring-cyan-400' : ''}>
                    <InchInput
                      value={geometry.offsets[side][anchor]}
                      onCommit={(offset) => offset !== null && update({
                        offset,
                        offsetFrom: side,
                        offsetAnchor: anchor,
                      })}
                      aria-label={`Recess ${side} ${anchor} position`}
                    />
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </section>

      {reason && (
        <section>
          <p className="rounded border border-red-900/80 bg-red-950/45 px-2.5 py-2 text-xs text-red-300">
            {RECESS_PLACEMENT_MESSAGES[reason] ?? reason}
          </p>
        </section>
      )}
    </div>
  );
}
