import { useDispatch } from 'react-redux';
import { boxConstruction } from '../../model/boxConstruction.js';
import { setCabinetBox } from '../../store/elevationSlice.js';
import Field from './Field.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const FULL_PART_OPTIONS = [
  ['between', 'Between sides'], ['overlay', 'Overlay sides'], ['spreaders', 'Spreaders'], ['none', 'None'],
];
const SIDE_OPTIONS = [[true, 'Built'], [false, 'Left off']];
const PARTS = [
  ['back', 'Back', [['dado', '1/4" dado'], ['inset', '3/4" inset'], ['applied', '1/4" applied'], ['none', 'None']]],
  ['top', 'Top', FULL_PART_OPTIONS],
  ['bottom', 'Bottom', FULL_PART_OPTIONS],
  ['left', 'Left side', SIDE_OPTIONS],
  ['right', 'Right side', SIDE_OPTIONS],
];
const SOURCE_LABELS = {
  standard: 'standard',
  'rule:sink': 'sink',
  'rule:cooktop': 'cooktop',
  'rule:medicine': 'medicine',
  'rule:hanging': 'hanging base',
  'rule:island': 'island',
  'rule:no-bottom': 'no bottom',
};

export default function BoxConstructionFields({ room, wall, run, item }) {
  const dispatch = useDispatch();
  const manual = item.box ?? {};
  const resolved = boxConstruction(item, run, wall);
  const set = (key, value) => dispatch(setCabinetBox({
    roomId: room.id, wallId: wall.id, runId: run.id, itemIds: [item.id], key, value,
  }));

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Box</h3>
      {PARTS.map(([key, label, options]) => {
        const automatic = boxConstruction({ ...item, box: { ...manual, [key]: undefined } }, run, wall);
        const autoLabel = options.find(([value]) => value === automatic[key])[1];
        return (
          <Field key={key} label={label}>
            <select
              aria-label={label}
              className={SELECT_CLASS}
              value={manual[key] == null ? '' : String(manual[key])}
              onChange={(event) => set(key, event.target.value === '' ? null
                : options.find(([value]) => String(value) === event.target.value)[0])}
            >
              <option value="">{`Auto (${autoLabel} · ${SOURCE_LABELS[automatic.sources[key]]})`}</option>
              {options.map(([value, optionLabel]) => (
                <option key={String(value)} value={String(value)}>{optionLabel}</option>
              ))}
            </select>
          </Field>
        );
      })}
      {['top', 'bottom'].map((part) => {
        const key = part === 'top' ? 'finTop' : 'finBottom';
        const label = `Finished ${part}`;
        return (
          <Field key={key} label={label}>
            <input
              type="checkbox"
              aria-label={label}
              checked={manual[key] ?? resolved[key]}
              onChange={(event) => set(key, event.target.checked)}
            />
            {(resolved[part] === 'spreaders' || resolved[part] === 'none') && (
              <span className="ml-2 text-xs text-gray-500">{`only on a full ${part}`}</span>
            )}
          </Field>
        );
      })}
    </section>
  );
}
