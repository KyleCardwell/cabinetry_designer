import { useDispatch, useSelector } from 'react-redux';
import {
  extendDirections, panelOrientation, panelTypes, wallSideOf,
} from '../../model/index.js';
import { panelLevels } from '../../model/doorStyleResolve.js';
import { isSheetCell } from '../../model/panelThickness.js';
import {
  addPanel,
  setCellKind,
  setCellExtend,
  setPanelDoors,
  setPanelType,
  setPartStyle,
} from '../../store/elevationSlice.js';
import ExtendFields from './ExtendFields.jsx';
import Field from './Field.jsx';
import PartStyleFields from './PartStyleFields.jsx';

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
  const room = useSelector((state) => state.elevation.rooms.find(
    (candidate) => candidate.id === state.elevation.activeRoomId,
  ));
  const settings = useSelector((state) => state.elevation.settings);
  const actionBase = { wallId: wall.id, runId: run.id, cellId: item.id };
  const where = { ...actionBase, part: 'panelCell' };
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
      {item.kind === 'panel' && extendDirections(piece).length > 0 && (
        <ExtendFields
          directions={extendDirections(piece)}
          extend={item.extend}
          runs={wall.runs.filter((other) => other.id !== run.id && wallSideOf(other) === wallSideOf(run))}
          label="Panel"
          onChange={(direction, target) => dispatch(setCellExtend({
            ...actionBase, direction, target,
          }))}
        />
      )}
      {item.kind === 'panel' && (
        <PartStyleFields
          room={room}
          settings={settings}
          partType="panel"
          part={item}
          levels={panelLevels(room, wall, run, item, { sheet: isSheetCell(item) })}
          width={orientation === 'side' ? piece.depth : piece.width}
          height={orientation === 'top' ? piece.depth : piece.height}
          label="Panel"
          onChange={(patch) => dispatch(setPartStyle({ ...where, ...patch }))}
        />
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
