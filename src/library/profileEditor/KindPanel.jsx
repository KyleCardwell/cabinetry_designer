import { PROFILE_KINDS, PROFILE_SLOTS } from '../../elevation/model/sectionProfiles.js';
import { setProfileKind } from '../../elevation/model/profileEditing.js';

const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

const SLOT_LABELS = {
  door_outside: 'door outside edge',
  door_inside: 'door inside profile',
  door_panel: 'door panel',
  door_applied: 'applied molding on 5-piece doors',
  slab_applied: 'applied molding on slab doors',
  crown: 'crown',
  top_mold: 'top mold',
  furniture_base: 'furniture base',
  toe_kick: 'toe kick',
  nosing: 'nosing',
};

export default function KindPanel({ profile, onApply }) {
  const kind = PROFILE_KINDS[profile.kind];
  const slotLabels = Object.keys(PROFILE_SLOTS)
    .filter((slot) => PROFILE_SLOTS[slot] === profile.kind)
    .map((slot) => SLOT_LABELS[slot]);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-gray-200">Kind</h2>
      <select
        aria-label="Kind"
        className={INPUT_CLASS}
        value={profile.kind}
        onChange={(event) => onApply(setProfileKind(profile, event.target.value), "That kind couldn't be set.")}
      >
        {Object.entries(PROFILE_KINDS).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <p className="text-xs text-gray-500">
        {kind.axes === 'door' && 'Door profile: the front face is the top line (y = 0); x runs in toward the middle of the door; y goes down into the door.'}
        {kind.axes === 'run' && 'Run molding: x runs out from the box toward the room; y runs up.'}
        {kind.axes === 'free' && 'Other: not used by doors or runs yet; draw it any way you like.'}
      </p>
      {kind.origin && (
        <>
          <p className="text-xs text-gray-200">0, 0 is {kind.origin}.</p>
          <p className="text-xs text-gray-500">Draw the shape from there, or select a point and press Origin to move the shape so that point sits at 0, 0.</p>
        </>
      )}
      {kind.axes === 'door' && (
        <p className="text-xs text-gray-500">An open line is a cut: the door&apos;s new edge, from the face in. A closed shape is a piece applied to the door. A molding that needs a notch in the door can have both.</p>
      )}
      {kind.axes === 'run' && (
        <p className="text-xs text-gray-500">A closed shape is an applied piece. An open line is an edge cut into the part, like a top&apos;s nosing.</p>
      )}
      {profile.kind === 'other' ? (
        <p className="text-xs text-gray-500">Other profiles can&apos;t be picked by doors or runs yet.</p>
      ) : (
        <p className="text-xs text-green-400">Can be picked for {slotLabels.join(slotLabels.length === 2 ? ' and ' : ', ')}.</p>
      )}
    </section>
  );
}
