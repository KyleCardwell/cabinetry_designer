import { useDispatch } from 'react-redux';
import { panelOrientation, panelTypes } from '../../model/index.js';
import {
  addPanel,
  setCellKind,
  setPanelDoors,
  setPanelType,
} from '../../store/elevationSlice.js';
import Field from './Field.jsx';

const KIND_OPTIONS = [
  ['cabinet', 'Cabinet'],
  ['panel', 'Panel'],
  ['void', 'Open (nothing)'],
  ['shelves', 'Floating shelves'],
];
const PANEL_TYPE_LABELS = {
  side: 'Side',
  top: 'Top / bottom',
  back: 'Back',
};
const PANEL_SIDES = [
  ['left', 'Left'],
  ['right', 'Right'],
  ['above', 'Above'],
  ['below', 'Below'],
];
const BUTTON_CLASS = 'rounded bg-gray-700 px-2.5 py-2 text-xs text-gray-100 hover:bg-gray-600';
const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

export default function CellKindSection({ wall, run, piece, item }) {
  const dispatch = useDispatch();
  const actionBase = { wallId: wall.id, runId: run.id, cellId: item.id };
  const orientation = panelOrientation(piece);
  const offeredTypes = panelTypes(run.grid, item.id);
  const typeOptions = orientation && !offeredTypes.includes(orientation)
    ? [...offeredTypes, orientation]
    : offeredTypes;

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Kind</h3>
      <Field label="Kind">
        <select
          value={item.kind}
          onChange={(event) => dispatch(setCellKind({
            ...actionBase,
            kind: event.target.value,
          }))}
          aria-label="Cell kind"
          className={SELECT_CLASS}
        >
          {KIND_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </Field>
      {item.kind === 'panel' && (
        <Field label="Panel type">
          <select
            value={orientation}
            onChange={(event) => dispatch(setPanelType({
              ...actionBase,
              type: event.target.value,
            }))}
            aria-label="Panel type"
            className={SELECT_CLASS}
          >
            {typeOptions.map((type) => (
              <option key={type} value={type}>{PANEL_TYPE_LABELS[type]}</option>
            ))}
          </select>
        </Field>
      )}
      {item.kind === 'panel' && (orientation === 'side' || orientation === 'top') && (
        <Field label="Doors">
          <select
            value={item.doors ?? 'flush'}
            onChange={(event) => dispatch(setPanelDoors({
              ...actionBase,
              doors: event.target.value,
            }))}
            aria-label="Panel doors"
            className={SELECT_CLASS}
          >
            <option value="flush">Flush — panel to door face</option>
            <option value="cover">Cover — doors lap over</option>
          </select>
        </Field>
      )}
      <div>
        <p className="mb-1 text-xs text-gray-400">Add panel</p>
        <div className="grid grid-cols-4 gap-2">
          {PANEL_SIDES.map(([side, label]) => (
            <button
              key={side}
              type="button"
              onClick={() => dispatch(addPanel({ ...actionBase, side }))}
              className={BUTTON_CLASS}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
