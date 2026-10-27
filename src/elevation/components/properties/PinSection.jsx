import { useDispatch } from 'react-redux';
import { pinTargetsForRun, returnExtents, runItems, wallViewForRun } from '../../model/index.js';
import { setItemPin } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import PanelSection from '../panel/PanelSection.jsx';
import Field, { ReadOnlyValue } from './Field.jsx';
import { RUN_TYPES } from './constants.js';

const returnKey = ({ wallId, runId }) => JSON.stringify([wallId, runId]);
const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

export default function PinSection({ room, wall, run, item, piece, settings, nested = false }) {
  const dispatch = useDispatch();
  if (item?.kind !== 'cabinet' || !piece) return null;
  const actionBase = { wallId: wall.id, runId: run.id, itemId: item.id };
  const actualCenter = piece.x + piece.width / 2;
  const pinCount = runItems(run).filter((candidate) => candidate.pin).length;
  const warnsSecondPin = !item.pin && pinCount === 1;
  const returns = room ? returnExtents(room, wallViewForRun(wall, run), settings) : [];
  const isReturn = item.pin?.from === 'return';
  const resolvedTarget = item.pin
    ? pinTargetsForRun(run, wall, wall.length, settings)[item.id] ?? null
    : null;
  const defaultPin = {
    anchor: 'center',
    from: 'left',
    openingId: null,
    openingAnchor: 'center',
    value: actualCenter,
  };
  const updatePin = (changes) => {
    const pin = { ...(item.pin ?? defaultPin), ...changes };
    if (pin.from !== 'return') {
      for (const key of ['wallId', 'runId', 'edge', 'valueRight']) delete pin[key];
    } else if (pin.edge !== 'both') delete pin.valueRight;
    dispatch(setItemPin({ ...actionBase, pin }));
  };
  const datumValue = item.pin?.from === 'opening'
    ? `opening:${item.pin.openingId}`
    : isReturn && !returns.length ? 'missing-return' : item.pin?.from ?? 'left';

  return (
    <PanelSection id="piece.pin" title={nested ? 'Column pin' : 'Pin'}>
      {warnsSecondPin && (
        <p className="mb-2 rounded border border-cyan-900/70 bg-cyan-950/30 p-2 text-xs text-cyan-200">
          A second pin locks both pinned cabinets to their current widths.
        </p>
      )}
      <label className="flex items-center justify-between rounded border border-gray-700 bg-gray-900/45 px-3 py-2 text-sm text-gray-300">
        {nested ? 'Pin column' : 'Pin cabinet'}
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
          <Field label="From">
            <select
              value={datumValue}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'return') {
                  updatePin({
                    from: 'return', wallId: returns[0].wallId, runId: returns[0].runId,
                    edge: 'both', anchor: 'left', value: 0, valueRight: 0,
                    openingId: null, openingAnchor: 'center',
                  });
                } else if (value.startsWith('opening:')) {
                  updatePin({
                    from: 'opening',
                    ...(isReturn ? { anchor: 'center' } : {}),
                    openingId: value.slice('opening:'.length),
                    openingAnchor: 'center',
                    value: 0,
                  });
                } else {
                  updatePin({
                    from: value,
                    ...(isReturn ? { anchor: 'center' } : {}),
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
              {returns.length > 0 && <option value="return">Return</option>}
              {isReturn && !returns.length && <option value="missing-return" disabled>Missing return</option>}
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
          {isReturn ? (
            <>
              <Field label="Return">
                <select
                  value={returnKey(item.pin)}
                  onChange={(event) => {
                    const [wallId, runId] = JSON.parse(event.target.value);
                    updatePin({ wallId, runId });
                  }}
                  aria-label="Pinned return"
                  className={SELECT_CLASS}
                >
                  {!returns.some((target) => returnKey(target) === returnKey(item.pin)) && (
                    <option value={returnKey(item.pin)}>Missing return</option>
                  )}
                  {returns.map((target) => {
                    const landedWall = room.walls.find(({ id }) => id === target.wallId);
                    const landedRun = landedWall.runs.find(({ id }) => id === target.runId);
                    const type = RUN_TYPES.find(([id]) => id === landedRun.cabinetTypeId)?.[1] ?? 'Unknown';
                    return (
                      <option key={returnKey(target)} value={returnKey(target)}>
                        {landedWall.label} – {type.toLowerCase()} run
                      </option>
                    );
                  })}
                </select>
              </Field>
              <Field label="Edge">
                <select
                  value={item.pin.edge}
                  onChange={(event) => {
                    const edge = event.target.value;
                    updatePin({
                      edge,
                      anchor: edge === 'both' ? 'left' : edge,
                      ...(edge === 'both' ? { valueRight: 0 } : {}),
                    });
                  }}
                  aria-label="Pinned return edge"
                  className={SELECT_CLASS}
                >
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                  <option value="center">Centre</option>
                  <option value="both">Both</option>
                </select>
              </Field>
            </>
          ) : (
            <Field label="Cabinet anchor">
              <select
                value={item.pin.anchor}
                onChange={(event) => updatePin({ anchor: event.target.value })}
                aria-label="Pinned cabinet anchor"
                className={SELECT_CLASS}
              >
                <option value="left">Left edge</option>
                <option value="center">Center</option>
                <option value="right">Right edge</option>
              </select>
            </Field>
          )}
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
          <Field label={isReturn ? item.pin.edge === 'both' ? 'Left offset' : 'Offset' : 'Distance'}>
            <InchInput
              value={item.pin.value}
              onCommit={(value) => updatePin({ value })}
              aria-label={isReturn ? item.pin.edge === 'both' ? 'Pin left offset' : 'Pin offset' : 'Pin distance'}
            />
          </Field>
          {isReturn && (
            <>
              {item.pin.edge === 'both' && (
                <Field label="Right offset">
                  <InchInput
                    value={item.pin.valueRight}
                    onCommit={(valueRight) => updatePin({ valueRight })}
                    aria-label="Pin right offset"
                  />
                </Field>
              )}
              <p className="text-xs text-gray-400">+ = wider than the desk, 0 = flush</p>
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label={isReturn ? 'Column left edge' : 'Resolved target'} tag="auto">
              {resolvedTarget === null ? (
                <div className="rounded border border-gray-700 bg-gray-900/60 px-2.5 py-1.5 text-sm text-amber-300">
                  Unresolved
                </div>
              ) : (
                <ReadOnlyValue
                  value={isReturn ? piece.x : resolvedTarget}
                  ariaLabel={isReturn ? 'Resolved column left edge' : 'Resolved pin target'}
                />
              )}
            </Field>
            <Field label={isReturn ? 'Column width' : 'Actual center'} tag="auto">
              <ReadOnlyValue
                value={isReturn ? piece.width : actualCenter}
                ariaLabel={isReturn ? 'Resolved column width' : 'Actual cabinet center'}
              />
            </Field>
          </div>
        </div>
      )}
    </PanelSection>
  );
}
