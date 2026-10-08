import {
  profileDrawnIn, profileVertexIds, setProfileDrawnPoint, setProfileDrawnPoints,
  setProfilePlanSameAsElevation,
} from '../../elevation/model/profileEditing.js';

const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const CHANGE_FAILURE = 'That change would make the shape invalid.';

export default function DrawnPanel({ profile, selectedPointId, onSelectPoint, onApply }) {
  const planSameAsElevation = profile.drawnPoints.plan === undefined;
  const elevation = profileDrawnIn(profile, 'elevation');
  const plan = profileDrawnIn(profile, 'plan');

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-gray-200">Drawn points</h2>
      <p className="text-xs text-gray-500">Each drawn point becomes a line in that view. Elevation is seen from the front; plan from above.</p>
      <label className="flex items-center gap-2 text-xs text-gray-200">
        <input
          type="checkbox"
          checked={planSameAsElevation}
          onChange={(event) => onApply(setProfilePlanSameAsElevation(profile, event.target.checked), CHANGE_FAILURE)}
        />
        Plan uses the same points as elevation
      </label>
      {['elevation', 'plan'].filter((view) => view === 'elevation' || !planSameAsElevation).map((view) => (
        <div key={view} className="flex items-center gap-2">
          <span className="text-xs text-gray-200">{view === 'elevation' ? 'Elevation:' : 'Plan:'}</span>
          <button
            type="button"
            className={BUTTON_CLASS}
            onClick={() => onApply(setProfileDrawnPoints(profile, view, profileVertexIds(profile)), CHANGE_FAILURE)}
          >
            All shape points
          </button>
          <button
            type="button"
            className={BUTTON_CLASS}
            onClick={() => onApply(setProfileDrawnPoints(profile, view, []), CHANGE_FAILURE)}
          >
            None
          </button>
        </div>
      ))}
      <table className="w-full table-fixed text-left text-xs text-gray-400">
        <thead>
          <tr>
            <th className="pb-2 font-normal">Point</th>
            <th className="pb-2 font-normal">Elevation</th>
            <th className="pb-2 font-normal">Plan</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(profile.geometry.points).map((id) => (
            <tr key={id} className={selectedPointId === id ? 'bg-blue-900/40' : ''}>
              <td className="py-1">
                <button type="button" className="font-mono text-xs text-gray-400 hover:text-white" onClick={() => onSelectPoint(id)}>{id}</button>
              </td>
              <td className="py-1">
                <input
                  type="checkbox"
                  aria-label={`${id} drawn in elevation`}
                  checked={elevation.includes(id)}
                  onChange={(event) => onApply(setProfileDrawnPoint(profile, 'elevation', id, event.target.checked), CHANGE_FAILURE)}
                />
              </td>
              <td className="py-1">
                <input
                  type="checkbox"
                  aria-label={`${id} drawn in plan`}
                  checked={plan.includes(id)}
                  disabled={planSameAsElevation}
                  title={planSameAsElevation ? 'Plan follows elevation' : undefined}
                  onChange={(event) => onApply(setProfileDrawnPoint(profile, 'plan', id, event.target.checked), CHANGE_FAILURE)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500">{elevation.length} drawn in elevation · {plan.length} in plan</p>
    </section>
  );
}
