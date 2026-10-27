import { useDispatch } from 'react-redux';
import { resolvePinTarget, runItems } from '../../model/index.js';
import { setItemPin } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import PanelSection from '../panel/PanelSection.jsx';
import Field, { ReadOnlyValue } from './Field.jsx';

export default function PinSection({ wall, run, item, piece, settings, nested = false }) {
  const dispatch = useDispatch();
  if (item?.kind !== 'cabinet' || !piece) return null;
  const actionBase = { wallId: wall.id, runId: run.id, itemId: item.id };
  const actualCenter = piece.x + piece.width / 2;
  const pinCount = runItems(run).filter((candidate) => candidate.pin).length;
  const warnsSecondPin = !item.pin && pinCount === 1;
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
            <Field label="Resolved target" tag="auto">
              {resolvedTarget === null ? (
                <div className="rounded border border-gray-700 bg-gray-900/60 px-2.5 py-1.5 text-sm text-amber-300">
                  Unresolved
                </div>
              ) : (
                <ReadOnlyValue value={resolvedTarget} ariaLabel="Resolved pin target" />
              )}
            </Field>
            <Field label="Actual center" tag="auto">
              <ReadOnlyValue value={actualCenter} ariaLabel="Actual cabinet center" />
            </Field>
          </div>
        </div>
      )}
    </PanelSection>
  );
}
