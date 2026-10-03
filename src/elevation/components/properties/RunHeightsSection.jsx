import { useDispatch } from 'react-redux';
import {
  CABINET_TYPE_IDS,
  STACK_EDGES,
  boxTopOf,
  describeStack,
  formatInchesInput,
  profileUnderSoffit,
  resolveProfile,
  runShortLabel,
  stackLink,
  wallSideOf,
} from '../../model/index.js';
import {
  freeRunStack,
  joinRunStack,
  setRunHeightMode,
  setRunOverride,
  setRunStackOffset,
  setRunType,
} from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field, { ReadOnlyValue } from './Field.jsx';

const RUN_OVERRIDE_FIELDS = {
  [CABINET_TYPE_IDS.BASE]: [
    ['toeKickHeight', 'Toe kick'],
    ['baseBoxHeight', 'Box height'],
    ['countertopThickness', 'Countertop'],
  ],
  [CABINET_TYPE_IDS.TALL]: [
    ['toeKickHeight', 'Toe kick'],
    ['boxTop', 'Box top'],
  ],
  [CABINET_TYPE_IDS.UPPER]: [
    ['upperClearance', 'Clearance above counter'],
    ['boxTop', 'Box top'],
  ],
};

export default function RunHeightsSection({
  room,
  wall,
  run,
  settings,
  actionBase,
  validateAndDispatch,
}) {
  const dispatch = useDispatch();
  const profile = resolveProfile(settings, room, wall);
  const inheritedValues = {
    ...profile,
    boxTop: boxTopOf(profileUnderSoffit(profile, wall, run)),
  };
  const overrideFields = RUN_OVERRIDE_FIELDS[run.cabinetTypeId] ?? [];
  const links = Object.fromEntries(STACK_EDGES.map((edge) => [edge, stackLink(run, edge)]));
  const stacked = Boolean(links.below || links.above);
  const filled = Boolean(links.below && links.above);

  return (
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Heights
        </h3>
        <div className="mb-3 grid grid-cols-2 overflow-hidden rounded border border-gray-700">
          {['auto', 'manual'].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => dispatch(setRunHeightMode({ ...actionBase, mode }))}
              className={`px-3 py-2 text-xs font-medium capitalize transition-colors ${
                run.heightMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-900/45 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {run.heightMode === 'auto' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Resolved Z">
                <ReadOnlyValue value={run.z} ariaLabel="Resolved run z" />
              </Field>
              <Field label="Resolved height">
                <ReadOnlyValue value={run.height} ariaLabel="Resolved run height" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {overrideFields.map(([key, label]) => (
                <Field key={key} label={`${label} (blank = inherit)`}>
                  <InchInput
                    value={run.overrides[key] ?? null}
                    allowBlank
                    placeholder={formatInchesInput(inheritedValues[key])}
                    onCommit={(value) => dispatch(setRunOverride({
                      ...actionBase,
                      key,
                      value,
                    }))}
                    aria-label={`Run ${label} override`}
                  />
                </Field>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Z">
              {stacked ? (
                <ReadOnlyValue value={run.z} ariaLabel="Run z" />
              ) : (
                <InchInput
                  value={run.z}
                  onCommit={(value) => validateAndDispatch({ z: value })}
                  aria-label="Run z"
                />
              )}
            </Field>
            <Field label="Height">
              {filled ? (
                <ReadOnlyValue value={run.height} ariaLabel="Run height" />
              ) : (
                <InchInput
                  value={run.height}
                  onCommit={(value) => validateAndDispatch({ height: value })}
                  aria-label="Run height"
                />
              )}
            </Field>
          </div>
        )}

        <div className="mt-3 space-y-3 border-t border-gray-700 pt-3">
          {STACK_EDGES.map((edge) => {
            const link = links[edge];
            const candidates = wall.runs.filter((candidate) => candidate.id !== run.id
              && wallSideOf(candidate) === wallSideOf(run)
              && (candidate.id === link?.runId
                || Math.min(candidate.x + candidate.width, run.x + run.width)
                  - Math.max(candidate.x, run.x) > 1e-6));
            return (
              <div key={edge} className="space-y-2">
                <Field label={edge === 'below' ? 'Sits on' : 'Held under'}>
                  <select
                    value={link?.runId ?? ''}
                    onChange={(event) => dispatch(event.target.value
                      ? joinRunStack({ ...actionBase, edge, leaderRunId: event.target.value })
                      : freeRunStack({ ...actionBase, edge }))}
                    aria-label={`Run ${edge} stack`}
                    className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Nothing</option>
                    {candidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>{runShortLabel(candidate)}</option>
                    ))}
                  </select>
                </Field>
                {link && (
                  <>
                    <Field label="Gap">
                      <InchInput
                        value={link.offset ?? 0}
                        allowBlank
                        placeholder="0"
                        onCommit={(value) => dispatch(setRunStackOffset({
                          ...actionBase,
                          edge,
                          offset: value ?? 0,
                        }))}
                        aria-label={`Run ${edge} stack gap`}
                      />
                    </Field>
                    <p className="text-xs text-cyan-300">{describeStack(wall, run, edge)}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => dispatch(setRunType({
            ...actionBase,
            typeId: run.cabinetTypeId,
            resetToDefaults: true,
          }))}
          className="mt-3 w-full rounded bg-gray-700 px-3 py-2 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-600"
        >
          Reset heights to defaults
        </button>
      </section>
  );
}
