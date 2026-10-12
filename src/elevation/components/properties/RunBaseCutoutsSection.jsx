import { useDispatch } from 'react-redux';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { runBase, runBaseProfile } from '../../model/furnitureBase.js';
import { runScene } from '../../model/runScene.js';
import { formatInches, formatInchesInput } from '../../model/units.js';
import { removeBaseCutout, updateBaseCutout } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const WARNING_MESSAGES = {
  'base-cutout-orphaned': 'A selected cabinet is missing or is no longer on the bottom row.',
  'base-cutout-no-base': 'This run has no furniture base.',
  'base-cutout-profile-bad': 'The profile must be an open line from the floor to its highest point; square notch used.',
  'base-cutout-too-narrow': 'The cutout is too narrow for its profile or feet.',
  'base-cutout-too-tall': 'The cutout must be shorter than the base.',
  'base-cutout-overlap': 'The cutout overlaps another cutout or extends past the base ends.',
};

export default function RunBaseCutoutsSection({ room, wall, run, settings }) {
  const dispatch = useDispatch();
  const cutouts = run.baseCutouts ?? [];
  if (!cutouts.length && runBaseProfile(room, wall, run, settings).kind !== 'furniture_base') return null;
  const scene = runScene(room, wall, run, settings);
  const base = runBase(room, wall, run, settings, scene);
  const cabinets = scene.cells.pieces.filter((piece) => piece.kind === 'cabinet'
    && Math.abs(piece.z - run.z) <= 1e-6).sort((a, b) => a.x - b.x);
  const profiles = (settings.sectionProfiles ?? []).filter((entry) => entry.kind === 'base_cutout' && !entry.archived);
  const actionBase = { wallId: wall.id, runId: run.id };

  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Base cutouts</h3>
      {!cutouts.length && <p className="text-xs text-gray-500">Select a bottom-row cabinet to add a base cutout.</p>}
      <div className="space-y-3">
        {cutouts.map((cutout, index) => {
          const from = cabinets.find((piece) => piece.id === cutout.from);
          const to = cabinets.find((piece) => piece.id === cutout.to);
          const autoWidth = from && to
            ? Math.max(from.x + from.width, to.x + to.width) - Math.min(from.x, to.x)
              - 2 * (settings.baseCutoutFoot ?? DEFAULT_SETTINGS.baseCutoutFoot)
            : null;
          const update = (changes) => dispatch(updateBaseCutout({ ...actionBase, cutoutId: cutout.id, changes }));
          const unavailable = cutout.profileId && !profiles.some((entry) => entry.id === cutout.profileId);
          return (
            <div key={cutout.id} aria-label={`Base cutout ${index + 1}`} className="rounded border border-gray-700 bg-gray-900/45 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-gray-300">Cutout {index + 1}</span>
                <button
                  type="button"
                  aria-label={`Remove base cutout ${index + 1}`}
                  onClick={() => dispatch(removeBaseCutout({ ...actionBase, cutoutId: cutout.id }))}
                  className="px-2 text-sm text-red-300 hover:text-red-200"
                >✕</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {['from', 'to'].map((key) => (
                  <Field key={key} label={key === 'from' ? 'From' : 'To'}>
                    <select
                      aria-label={`Cutout ${index + 1} ${key === 'from' ? 'From' : 'To'}`}
                      value={cutout[key]}
                      onChange={(event) => update({ [key]: event.target.value })}
                      className={SELECT_CLASS}
                    >
                      {!cabinets.some((piece) => piece.id === cutout[key]) && <option value={cutout[key]} disabled>Missing cabinet</option>}
                      {cabinets.map((piece, position) => <option key={piece.id} value={piece.id}>{position + 1} — {formatInches(piece.width)}</option>)}
                    </select>
                  </Field>
                ))}
                <Field label="Width">
                  <InchInput
                    aria-label={`Cutout ${index + 1} Width`}
                    value={cutout.width ?? null}
                    allowBlank
                    placeholder={autoWidth === null ? 'Auto' : formatInchesInput(autoWidth)}
                    onCommit={(value) => value !== null && value <= 0 ? false : update({ width: value ?? undefined })}
                  />
                </Field>
                <Field label="Profile">
                  <select
                    aria-label={`Cutout ${index + 1} Profile`}
                    value={cutout.profileId === null ? 'square' : cutout.profileId ?? ''}
                    onChange={(event) => update({ profileId: event.target.value === 'square' ? null : event.target.value || undefined })}
                    className={SELECT_CLASS}
                  >
                    <option value="">Inherit</option>
                    <option value="square">Square</option>
                    {profiles.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                    {unavailable && <option value={cutout.profileId} disabled>{settings.sectionProfiles?.find((entry) => entry.id === cutout.profileId)?.name ?? 'Missing profile'} (unavailable)</option>}
                  </select>
                </Field>
              </div>
              {base.warnings.filter((warning) => warning.cutoutId === cutout.id).map(({ code }, warningIndex) => (
                <p key={`${code}-${warningIndex}`} className="mt-2 text-xs text-amber-400">{WARNING_MESSAGES[code] ?? code}</p>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
