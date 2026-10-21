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
import { runBase } from '../../model/furnitureBase.js';
import InchInput from '../InchInput.jsx';
import HeightBands from '../HeightBands.jsx';
import { bandFieldsFor } from '../../model/heightBands.js';
import Field, { ReadOnlyValue } from './Field.jsx';

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
  const links = Object.fromEntries(STACK_EDGES.map((edge) => [edge, stackLink(run, edge)]));
  const stacked = Boolean(links.below || links.above);
  const filled = Boolean(links.below && links.above);
  const floorBase = !links.below && [CABINET_TYPE_IDS.BASE, CABINET_TYPE_IDS.TALL].includes(run.cabinetTypeId);
  const base = runBase(room, wall, run, settings);
  const profileId = run.overrides.furnitureBaseProfileId;
  const choices = (settings.sectionProfiles ?? []).filter((entry) => entry.kind === 'furniture_base' && !entry.archived);
  const unavailable = profileId && !choices.some((entry) => entry.id === profileId);
  const setBaseOverride = (key, value) => dispatch(setRunOverride({ ...actionBase, key, value }));

  const renderHeightField = ({ key, label, type }) => {
    if (type === 'baseKind') return floorBase ? (
      <Field label="Base override">
        <select
          aria-label="Run Base override"
          value={run.overrides.baseKind ?? ''}
          onChange={(event) => setBaseOverride('baseKind', event.target.value || undefined)}
          className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        >
          <option value="">Inherit</option>
          <option value="toe_kick">Toe kick</option>
          <option value="furniture_base">Furniture base</option>
        </select>
      </Field>
    ) : null;
    if (key === 'furnitureBaseProfileId') return floorBase ? (
      <Field label="Furniture base profile">
        <select
          aria-label="Run Furniture base profile override"
          value={profileId === null ? 'plain' : profileId ?? ''}
          onChange={(event) => setBaseOverride('furnitureBaseProfileId',
            event.target.value === 'plain' ? null : event.target.value || undefined)}
          className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        >
          <option value="">Inherit</option>
          <option value="plain">Plain</option>
          {choices.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          {unavailable && <option value={profileId} disabled>{settings.sectionProfiles?.find((entry) => entry.id === profileId)?.name ?? 'Missing profile'} (unavailable)</option>}
        </select>
      </Field>
    ) : null;
    if (key === 'furnitureBaseProud') return floorBase ? (
      <Field label="Base proud (blank = inherit)">
        <InchInput
          aria-label="Run Base proud override"
          value={run.overrides.furnitureBaseProud ?? null}
          allowBlank
          placeholder={formatInchesInput(profile.furnitureBaseProud)}
          onCommit={(value) => value !== null && value < 0 ? false : setBaseOverride('furnitureBaseProud', value)}
        />
      </Field>
    ) : null;
    if (run.heightMode !== 'auto') return null;
    return (
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
    );
  };

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

        <div className="mt-3">
          <HeightBands
            level="run"
            fields={bandFieldsFor('run', { cabinetTypeId: run.cabinetTypeId, furnitureBase: base.kind === 'furniture_base' })}
            renderField={renderHeightField}
            warnings={floorBase ? base.warnings.filter((warning) => !warning.cutoutId) : []}
          />
        </div>

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
                <Field label={edge === 'below' ? 'Stacks on' : 'Held under'}>
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
