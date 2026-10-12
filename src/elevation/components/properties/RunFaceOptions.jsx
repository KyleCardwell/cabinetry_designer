import { useDispatch } from 'react-redux';
import {
  CABINET_TYPE_IDS,
  RUN_TOP_OPTIONS,
  TOP_LABELS,
  defaultRunTop,
  formatInchesInput,
  isCountertop,
  isInsetStyle,
  resolveProfile,
  resolveStyle,
  runTop,
} from '../../model/index.js';
import { topOverhangs } from '../../model/topOverhang.js';
import { setRunFaceOptions, setRunOverride, setRunStyle, setRunTopOverhang } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';
import StyleFields from './StyleFields.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

const UPPER_BOTTOM_LABELS = {
  overhang: 'Overhang (doors below box)',
  counter: 'Flush (on counter / nothing below)',
};

export default function RunFaceOptions({ room, wall, run, settings }) {
  const dispatch = useDispatch();
  const at = { wallId: wall.id, runId: run.id };
  const profile = resolveProfile(settings, room, wall);
  const defaultTop = defaultRunTop(wall, run, profile);
  const topKind = runTop(wall, run, profile).kind;
  const woodTop = topKind === 'wood';
  const overhangDefaults = isCountertop(topKind)
    ? topOverhangs(room, wall, { ...run, topOverhang: undefined }, settings) : null;
  const pickedId = run.overrides?.nosingProfileId;
  const choices = (settings.sectionProfiles ?? []).filter((entry) => entry.kind === 'nosing' && !entry.archived);
  const unavailable = pickedId && !choices.some((entry) => entry.id === pickedId);

  return (
    <section className="space-y-3 border-t border-gray-700 pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cabinet style</h3>
      <StyleFields
        label="Run"
        value={run.style}
        inherited={resolveStyle(settings, room)}
        onChange={(style) => dispatch(setRunStyle({ ...at, style }))}
      />

      <label className="block text-xs text-gray-400">
        Top
        <select
          value={run.top ?? ''}
          onChange={(event) => dispatch(setRunFaceOptions({ ...at, top: event.target.value || null }))}
          aria-label="Run top"
          className={`mt-1 ${SELECT_CLASS}`}
        >
          <option value="">{`Default · ${TOP_LABELS[defaultTop]}`}</option>
          {RUN_TOP_OPTIONS.map((value) => (
            <option key={value} value={value}>{TOP_LABELS[value]}</option>
          ))}
        </select>
      </label>

      {woodTop && (
        <label className="block text-xs text-gray-400">
          Nosing profile
          <select
            value={pickedId === null ? 'plain' : pickedId ?? ''}
            onChange={(event) => {
              const value = event.target.value === 'plain' ? null : event.target.value || undefined;
              dispatch(setRunOverride({ ...at, key: 'nosingProfileId', value }));
            }}
            aria-label="Run Nosing profile"
            className={`mt-1 ${SELECT_CLASS}`}
          >
            <option value="">Inherit</option>
            <option value="plain">None</option>
            {choices.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            {unavailable && <option value={pickedId} disabled>{settings.sectionProfiles?.find((entry) => entry.id === pickedId)?.name ?? 'Missing profile'} (unavailable)</option>}
          </select>
        </label>
      )}

      {overhangDefaults && (
        <div className="space-y-1">
          <h4 className="text-xs text-gray-400">Overhang</h4>
          <div className="grid grid-cols-4 gap-2">
            {['front', 'back', 'left', 'right'].map((side) => (
              <Field key={side} label={side[0].toUpperCase() + side.slice(1)}>
                <InchInput
                  value={run.topOverhang?.[side] ?? null}
                  allowBlank
                  placeholder={formatInchesInput(overhangDefaults[side])}
                  onCommit={(value) => {
                    if (value !== null && (!Number.isFinite(value) || value < 0)) return false;
                    dispatch(setRunTopOverhang({ ...at, side, value }));
                    return true;
                  }}
                  aria-label={`Run ${side} overhang`}
                />
              </Field>
            ))}
          </div>
        </div>
      )}

      {run.cabinetTypeId === CABINET_TYPE_IDS.BASE && isInsetStyle(resolveStyle(settings, room, run)) && (
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={run.hanging === true}
            onChange={(event) => dispatch(setRunFaceOptions({ ...at, hanging: event.target.checked }))}
            aria-label="Hanging base"
          />
          Hanging (bottom rail hangs below the box)
        </label>
      )}

      {run.cabinetTypeId === CABINET_TYPE_IDS.UPPER && (
        !(run.bottom?.length) ? (
          <label className="block text-xs text-gray-400">
            Bottom
            <select
              value={run.upperBottom === 'flush' ? 'counter' : (run.upperBottom ?? 'overhang')}
              onChange={(event) => dispatch(setRunFaceOptions({ ...at, upperBottom: event.target.value }))}
              aria-label="Upper bottom"
              className={`mt-1 ${SELECT_CLASS}`}
            >
              {Object.entries(UPPER_BOTTOM_LABELS).map(([value, text]) => (
                <option key={value} value={value}>{text}</option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-xs text-gray-500">Bottom: set by Below the run</p>
        )
      )}
    </section>
  );
}
