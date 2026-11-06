import { useDispatch } from 'react-redux';
import { removeRunLeg, updateRunLeg } from '../../store/elevationSlice.js';
import LegFields from './LegFields.jsx';

export { LEG_SELECT_CLASS, liveLegShapes, LegShapeSelect, LegHeightFields, LegSitsOnSelect } from './LegFields.jsx';

export default function LegRow({ room, wall, run, leg, index, settings, numbers, warnings, placement }) {
  const dispatch = useDispatch();
  const label = `Leg ${index + 1}`;
  const actionBase = { roomId: room.id, wallId: wall.id, runId: run.id, legId: leg.id };
  const update = (changes) => dispatch(updateRunLeg({ ...actionBase, changes }));
  const number = numbers.byKey.get(leg.id);

  return (
    <div aria-label={label} className="rounded border border-gray-700 bg-gray-900/45 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-gray-300">{label}{number != null && ` #${number}`}</span>
        <button type="button" aria-label={`Remove ${label.toLowerCase()}`}
          onClick={() => dispatch(removeRunLeg(actionBase))}
          className="px-2 text-sm text-red-300 hover:text-red-200">Remove</button>
      </div>
      <LegFields room={room} wall={wall} run={run} leg={leg} settings={settings} label={label}
        onChange={update} placement={placement} warnings={warnings}>
        <p className="mt-1 text-xs text-gray-500">Along: to the leg&apos;s outside face from the run end. In/out: to its front or back face. + = proud of the run, − = into it.</p>
      </LegFields>
    </div>
  );
}
