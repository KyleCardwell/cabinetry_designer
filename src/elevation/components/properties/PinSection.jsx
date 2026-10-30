import { useDispatch } from 'react-redux';
import { PINNABLE_KINDS } from '../../model/constants.js';
import { pinTargetsForRun, returnExtents, wallViewForRun } from '../../model/index.js';
import { setItemPin } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import PanelSection from '../panel/PanelSection.jsx';
import Field, { ReadOnlyValue } from './Field.jsx';
import { RUN_TYPES } from './constants.js';

const returnKey = ({ wallId, runId }) => JSON.stringify([wallId, runId]);
const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

/**
 * A root column following a return (desk return dying into the run, DR3b). LL4: wall-end and opening
 * pins became layout lines (`ColumnLineSection`); this section is only for returns.
 */
export default function PinSection({ room, wall, run, item, piece, settings, nested = false }) {
  const dispatch = useDispatch();
  if (!PINNABLE_KINDS.has(item?.kind) || !piece || item.attach) return null;
  const actionBase = { wallId: wall.id, runId: run.id, itemId: item.id };
  const returns = room ? returnExtents(room, wallViewForRun(wall, run), settings) : [];
  const isReturn = item.pin?.from === 'return';
  if (!isReturn && !returns.length) return null;
  const resolvedTarget = isReturn
    ? pinTargetsForRun(run, wall, wall.length, settings)[item.id] ?? null
    : null;
  const returnPin = (target) => ({
    from: 'return', wallId: target.wallId, runId: target.runId,
    edge: 'both', anchor: 'left', value: 0, valueRight: 0,
    openingId: null, openingAnchor: 'center',
  });
  const updatePin = (changes) => {
    const pin = { ...item.pin, ...changes };
    if (pin.edge !== 'both') delete pin.valueRight;
    dispatch(setItemPin({ ...actionBase, pin }));
  };

  return (
    <PanelSection id="piece.pin" title={nested ? 'Column return' : 'Return'}>
      <label className="flex items-center justify-between rounded border border-gray-700 bg-gray-900/45 px-3 py-2 text-sm text-gray-300">
        Follow return
        <input
          type="checkbox"
          checked={isReturn}
          onChange={(event) => dispatch(setItemPin({
            ...actionBase,
            pin: event.target.checked && returns.length ? returnPin(returns[0]) : null,
          }))}
          aria-label="Follow return"
          className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
        />
      </label>
      {isReturn && (
        <div className="mt-3 space-y-2.5">
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
          <Field label={item.pin.edge === 'both' ? 'Left offset' : 'Offset'}>
            <InchInput
              value={item.pin.value}
              onCommit={(value) => updatePin({ value })}
              aria-label={item.pin.edge === 'both' ? 'Pin left offset' : 'Pin offset'}
            />
          </Field>
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
          <div className="grid grid-cols-2 gap-2">
            <Field label="Column left edge" tag="auto">
              {resolvedTarget === null ? (
                <div className="rounded border border-gray-700 bg-gray-900/60 px-2.5 py-1.5 text-sm text-amber-300">
                  Unresolved
                </div>
              ) : (
                <ReadOnlyValue value={piece.x} ariaLabel="Resolved column left edge" />
              )}
            </Field>
            <Field label="Column width" tag="auto">
              <ReadOnlyValue value={piece.width} ariaLabel="Resolved column width" />
            </Field>
          </div>
        </div>
      )}
    </PanelSection>
  );
}
