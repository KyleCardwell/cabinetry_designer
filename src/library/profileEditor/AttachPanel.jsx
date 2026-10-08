import { useState } from 'react';
import {
  ATTACH_POINTS, PROFILE_SLOTS, profileFitsSlot, profileTagLabel,
} from '../../elevation/model/sectionProfiles.js';
import { setProfileAttach, profileSlotGaps } from '../../elevation/model/profileEditing.js';

const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const SELECT_CLASS = INPUT_CLASS.replace('w-full ', '').replace('px-2.5 py-1.5 text-sm', 'px-2 py-1 font-mono text-xs');
const POINT_FAILURE = 'That point no longer exists.';

const ATTACH_INFO = {
  door_edge: { label: 'Door edge', help: "The door's outside edge. For outside-edge profiles." },
  frame_edge: { label: 'Frame edge', help: 'Where the stile meets the panel opening. For inside (sticking) profiles and applied molding.' },
  panel_edge: { label: 'Panel edge', help: 'Where the panel sits in the opening. For panel profiles and applied molding.' },
  apply_point: { label: 'Apply point', help: 'Where an applied molding sits on a slab face.' },
  box_top: { label: 'Box top', help: 'The top of the cabinet box. For crown and top mold.' },
  box_front: { label: 'Box front', help: 'The front face of the box. For crown, top mold, base and toe kick.' },
  floor: { label: 'Floor', help: 'The floor line. For furniture base and toe kick.' },
  edge_top: { label: 'Edge top', help: 'The top surface of the part. For nosing.' },
  edge_face: { label: 'Edge face', help: 'The front edge of the part. For nosing.' },
};

const SLOT_LABELS = {
  door_outside: 'Door outside edge',
  door_inside: 'Door inside (sticking)',
  door_panel: 'Door panel',
  door_applied: 'Applied molding (5-piece)',
  slab_applied: 'Applied molding (slab)',
  crown: 'Crown',
  top_mold: 'Top mold',
  furniture_base: 'Furniture base',
  toe_kick: 'Toe kick',
  nosing: 'Nosing',
};

export default function AttachPanel({ profile, selectedPointId, onApply }) {
  const [newName, setNewName] = useState('');
  const pointIds = Object.keys(profile.geometry.points);
  const entries = Object.entries(profile.attach);
  const unsetNames = ATTACH_POINTS.filter((name) => !Object.hasOwn(profile.attach, name));
  const nameToAdd = unsetNames.includes(newName) ? newName : unsetNames[0];
  const fitsSlots = Object.keys(PROFILE_SLOTS).filter((slot) => profileFitsSlot(profile, slot));

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-gray-200">Attach points</h2>
      <p className="text-xs text-gray-500">Where this profile attaches. A slot accepts any profile that has its attach points.</p>
      {entries.map(([name, pointId]) => (
        <div key={name} className="flex items-center gap-2" title={ATTACH_INFO[name].help}>
          <span className="text-xs text-gray-200">
            {ATTACH_INFO[name].label}{' '}
            <span className="font-mono text-[10px] text-gray-500">{name}</span>
          </span>
          <select
            aria-label={`${ATTACH_INFO[name].label} point`}
            className={SELECT_CLASS}
            value={pointId}
            onChange={(event) => onApply(setProfileAttach(profile, name, event.target.value), POINT_FAILURE)}
          >
            {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          {selectedPointId && selectedPointId !== pointId && (
            <button
              type="button"
              className="text-xs text-gray-400 hover:text-white"
              title="Use the selected point"
              onClick={() => onApply(setProfileAttach(profile, name, selectedPointId), POINT_FAILURE)}
            >
              = {selectedPointId}
            </button>
          )}
          <button
            type="button"
            className="text-xs text-gray-400 hover:text-white"
            onClick={() => onApply(setProfileAttach(profile, name, null), POINT_FAILURE)}
          >
            Clear
          </button>
        </div>
      ))}
      {entries.length === 0 && <p className="text-xs text-gray-500">No attach points yet.</p>}
      {unsetNames.length > 0 && (
        <div className="flex items-center gap-2">
          <select aria-label="Attach point to add" className={SELECT_CLASS} value={nameToAdd} onChange={(event) => setNewName(event.target.value)}>
            {unsetNames.map((name) => <option key={name} value={name}>{ATTACH_INFO[name].label} ({name})</option>)}
          </select>
          <button
            type="button"
            className={BUTTON_CLASS}
            onClick={() => {
              if (onApply(setProfileAttach(profile, nameToAdd, selectedPointId || pointIds[0]), POINT_FAILURE)) setNewName('');
            }}
          >
            Add
          </button>
        </div>
      )}
      <p className="flex flex-wrap items-center gap-1 text-xs text-gray-400">
        Fits slots:
        {fitsSlots.length > 0 ? fitsSlots.map((slot) => (
          <span key={slot} className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300">{SLOT_LABELS[slot]}</span>
        )) : <span>No slot yet — add attach points.</span>}
      </p>
      {profileSlotGaps(profile).map(({ tag, missing }) => (
        <p key={tag} className="text-xs text-amber-300">
          Tagged {profileTagLabel(tag)}, but it still needs {missing.join(', ')} to fit that slot.
        </p>
      ))}
    </section>
  );
}
