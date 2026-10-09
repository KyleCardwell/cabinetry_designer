import {
  PIN_LABELS, PROFILE_KINDS, PROFILE_SLOTS, profileMissingPins,
} from '../../elevation/model/sectionProfiles.js';
import { setProfileAttach, setProfileKind } from '../../elevation/model/profileEditing.js';

const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const SELECT_CLASS = 'rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-gray-100';
const POINT_FAILURE = 'That point no longer exists.';

const PIN_HELP = {
  door_edge: "The point on the door's outside edge, at the front face.",
  frame_edge: 'The point where this profile meets the panel opening, at the front face.',
  panel_edge: 'The point where the panel meets the frame opening.',
  apply_point: "The point of the molding that sits on the line it's applied along.",
  box_top: "The point level with the top of the cabinet box. For crown it's usually the same corner as Box face.",
  box_front: 'The point against the front face of the box.',
  floor: 'The point that sits on the floor.',
  edge_top: 'The point level with the top of the part.',
  edge_face: 'The point against the front edge of the part.',
};

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

export default function PinsPanel({ profile, selectedPointId, onApply }) {
  const kind = PROFILE_KINDS[profile.kind];
  const pointIds = Object.keys(profile.geometry.points);
  const missingPins = profileMissingPins(profile);
  const slotLabels = Object.keys(PROFILE_SLOTS)
    .filter((slot) => PROFILE_SLOTS[slot] === profile.kind)
    .map((slot) => SLOT_LABELS[slot]);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-gray-200">Kind and pin points</h2>
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
        {' Changing the kind clears pin points it doesn\'t use.'}
      </p>
      {kind.pins.map((name) => (
        <div key={name} className="space-y-1">
          <p className="text-xs font-medium text-gray-200">{PIN_LABELS[name]}</p>
          <p className="text-xs text-gray-500">{PIN_HELP[name]}</p>
          <div className="flex items-center gap-2">
            <select
              aria-label={`${PIN_LABELS[name]} point`}
              className={SELECT_CLASS}
              value={profile.attach[name] ?? ''}
              onChange={(event) => onApply(setProfileAttach(profile, name, event.target.value === '' ? null : event.target.value), POINT_FAILURE)}
            >
              <option value="">— not set —</option>
              {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
            {selectedPointId && selectedPointId !== profile.attach[name] && (
              <button
                type="button"
                className={BUTTON_CLASS}
                onClick={() => onApply(setProfileAttach(profile, name, selectedPointId), POINT_FAILURE)}
              >
                Use selected point ({selectedPointId})
              </button>
            )}
          </div>
          {missingPins.includes(name) && !selectedPointId && (
            <p className="text-xs text-amber-300">Click a point on the drawing, then press Use selected point.</p>
          )}
        </div>
      ))}
      {profile.kind === 'other' ? (
        <p className="text-xs text-gray-500">Other profiles have no pin points and can't be picked by doors or runs yet.</p>
      ) : missingPins.length === 0 ? (
        <p className="text-xs text-green-400">Ready — can be picked for {slotLabels.join(slotLabels.length === 2 ? ' and ' : ', ')}.</p>
      ) : (
        <p className="text-xs text-amber-300">Still needs: {missingPins.map((name) => PIN_LABELS[name]).join(', ')}.</p>
      )}
    </section>
  );
}
