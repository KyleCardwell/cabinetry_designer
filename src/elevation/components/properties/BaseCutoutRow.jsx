import { useDispatch } from 'react-redux';
import { baseCutoutSpan } from '../../model/baseCutouts.js';
import { formatInches } from '../../model/units.js';
import { removeBaseCutout, updateBaseCutout } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import { autoInchProps } from '../autoInchProps.js';
import Field from './Field.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const WARNING_MESSAGES = {
  'base-cutout-orphaned': 'A selected cabinet is missing or is no longer on the bottom row.',
  'base-cutout-no-base': 'This run has no furniture base.',
  'base-cutout-profile-bad': 'The profile must be an open line from the floor to its highest point; square notch used.',
  'base-cutout-too-narrow': 'The cutout is too narrow for its profile or feet.',
  'base-cutout-too-short': 'Base is shorter than this cutout was drawn for — drawn at its drawn size.',
  'base-cutout-too-tall': 'The cutout must be shorter than the base.',
  'base-cutout-overlap': 'The cutout overlaps another cutout or extends past the base ends.',
};

export default function BaseCutoutRow({ wall, run, cutout, index, cabinets, settings, numbers, warnings }) {
  const dispatch = useDispatch();
  const span = baseCutoutSpan(cutout, cabinets, settings);
  const derived = span ? { left: span.x0 - span.s0, width: span.width, right: span.s1 - span.x1 } : null;
  const profiles = (settings.sectionProfiles ?? []).filter((entry) => entry.kind === 'base_cutout' && !entry.archived);
  const actionBase = { wallId: wall.id, runId: run.id };
  const update = (changes) => dispatch(updateBaseCutout({ ...actionBase, cutoutId: cutout.id, changes }));
  const unavailable = cutout.profileId && !profiles.some((entry) => entry.id === cutout.profileId);
  const commitDimension = (key, value) => {
    if (value !== null && (!Number.isFinite(value) || (key === 'width' ? value <= 0 : value < 0))) return false;
    const changes = { [key]: value ?? undefined };
    if (value !== null) {
      if (key === 'width' && cutout.left !== undefined && cutout.right !== undefined) {
        changes.left = undefined;
        changes.right = undefined;
      } else if (key !== 'width' && cutout.width !== undefined
        && cutout[key === 'left' ? 'right' : 'left'] !== undefined) {
        changes.width = undefined;
      }
    }
    update(changes);
  };

  return (
    <div aria-label={`Base cutout ${index + 1}`} className="rounded border border-gray-700 bg-gray-900/45 p-3">
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
              {cabinets.map((piece, position) => <option key={piece.id} value={piece.id}>{numbers?.byKey.get(piece.id) == null ? position + 1 : `#${numbers.byKey.get(piece.id)}`} — {formatInches(piece.width)}</option>)}
            </select>
          </Field>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {['left', 'width', 'right'].map((key) => {
          const label = key[0].toUpperCase() + key.slice(1);
          return (
            <Field key={key} label={label}>
              <InchInput
                aria-label={`Cutout ${index + 1} ${label}`}
                value={cutout[key] ?? null}
                {...autoInchProps({ ...(derived === null ? { text: 'Auto' } : { auto: derived[key] }), onCommit: (value) => commitDimension(key, value) })}
              />
            </Field>
          );
        })}
      </div>
      <div className="mt-2">
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
      {warnings.filter((warning) => warning.cutoutId === cutout.id).map(({ code }, warningIndex) => (
        <p key={`${code}-${warningIndex}`} className="mt-2 text-xs text-amber-400">{WARNING_MESSAGES[code] ?? code}</p>
      ))}
    </div>
  );
}
