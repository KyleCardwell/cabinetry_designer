import { useDispatch } from 'react-redux';
import {
  CABINET_TYPE_IDS,
  boxTopOf,
  formatInchesInput,
  profileUnderSoffit,
  resolveProfile,
} from '../../model/index.js';
import {
  setRunHeightMode,
  setRunOverride,
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
              <InchInput
                value={run.z}
                onCommit={(value) => validateAndDispatch({ z: value })}
                aria-label="Run z"
              />
            </Field>
            <Field label="Height">
              <InchInput
                value={run.height}
                onCommit={(value) => validateAndDispatch({ height: value })}
                aria-label="Run height"
              />
            </Field>
          </div>
        )}

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
