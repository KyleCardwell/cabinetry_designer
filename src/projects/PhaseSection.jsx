import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { newRoomDocument, nextName, ROOM_STATUS_LABELS } from '../elevation/model/designProjects.js';
import ProjectSettingsPanel from './ProjectSettingsPanel.jsx';
import { openRoomChips } from './roomText.js';

export const ROOM_STATUS_COLORS = { drafting: 'bg-gray-700 text-gray-200', approved: 'bg-teal-950 text-teal-300', released: 'bg-blue-950 text-blue-300' };

export function InlineName({ name, label, editable, busy, onRename, children }) {
  const [draft, setDraft] = useState(null);
  const finished = useRef(false);
  function commit() {
    if (finished.current) return;
    finished.current = true;
    setDraft(null);
    const value = draft.trim();
    if (value && value !== name) onRename(value);
  }
  return <div className="flex items-center gap-3">
    {draft === null ? <>
      {children}
      {editable && <button type="button" disabled={busy} className="text-sm text-gray-400 hover:underline" onClick={() => { finished.current = false; setDraft(name); }}>Rename</button>}
    </> : <input autoFocus aria-label={label} value={draft} className="rounded border border-gray-600 bg-gray-900 px-2 py-1 text-gray-100" onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => {
      if (event.key === 'Enter') { event.preventDefault(); commit(); }
      if (event.key === 'Escape') { event.preventDefault(); finished.current = true; setDraft(null); }
    }} />}
  </div>;
}

export default function PhaseSection({ phase, projectId, edit, busy, includeArchived, openRooms = {}, onWrite, onCopy, settingsOpen, settingsReady, settingsBusy, onSettings }) {
  const archived = Boolean(phase.archived_at);
  const rooms = [...phase.rooms].sort((a, b) => a.sort - b.sort);
  return <section aria-label={phase.name} className={`rounded border border-gray-700 p-4 space-y-4 ${archived ? 'text-gray-500' : ''}`}>
    <div className="flex items-center justify-between gap-4">
      <InlineName name={phase.name} label="Phase name" editable={edit && !archived} busy={busy} onRename={(name) => onWrite((api) => api.updatePhase(phase.phase_id, { name }))}>
        <h2 className="font-semibold">{phase.name}</h2>
      </InlineName>
      <button type="button" disabled={settingsBusy} aria-expanded={Boolean(settingsOpen)} onClick={onSettings}>Settings</button>
      {edit && <button type="button" disabled={busy} onClick={() => onWrite((api) => api.updatePhase(phase.phase_id, { archived: !archived }))}>{archived ? 'Restore' : 'Archive'}</button>}
    </div>
    {settingsOpen && (settingsReady ? <ProjectSettingsPanel key={phase.phase_id} level="phase" /> : <p role="status">Loading phase settings…</p>)}
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-gray-400"><tr>{['Name', 'Status', 'Last issued', 'Updated', ''].map((heading) => <th key={heading} scope="col" className="px-2 py-2">{heading}</th>)}</tr></thead>
        <tbody>{rooms.filter((room) => includeArchived || !room.archived_at).map((room) => {
          const roomArchived = Boolean(room.archived_at);
          const greyed = archived || roomArchived;
          return <tr key={room.room_id} className={`border-t border-gray-700 ${greyed ? 'text-gray-500' : ''}`}>
            <td className="px-2 py-3"><InlineName name={room.name} label="Room name" editable={edit && !greyed} busy={busy} onRename={(name) => onWrite((api) => api.updateRoomInfo(room.room_id, { name }))}>
              <Link to={`/projects/${projectId}/rooms/${room.room_id}`} className="hover:underline">{room.name}</Link>
              {openRoomChips(openRooms[room.room_id] ?? []).map((chip) => <span key={chip.label} className={`rounded px-2 py-1 text-xs ${chip.editing ? 'bg-amber-950 text-amber-300' : 'bg-gray-700 text-gray-300'}`}>{chip.label}</span>)}
            </InlineName></td>
            <td className="px-2 py-3"><span className={`rounded px-2 py-1 text-xs ${greyed ? 'bg-gray-800 text-gray-500' : ROOM_STATUS_COLORS[room.status]}`}>{ROOM_STATUS_LABELS[room.status]}</span></td>
            <td className="px-2 py-3">{room.last_version?.label || '—'}</td>
            <td className="px-2 py-3">{room.updated_at ? new Date(room.updated_at).toLocaleDateString() : '—'}{room.updated_by_name && ` · ${room.updated_by_name}`}</td>
            <td className="px-2 py-3"><div className="flex justify-end gap-3">
              {edit && !greyed && <button type="button" disabled={busy} onClick={() => onCopy(room)}>Copy</button>}
              {edit && (!archived || roomArchived) && <button type="button" disabled={busy} onClick={() => onWrite((api) => api.updateRoomInfo(room.room_id, { archived: !roomArchived }))}>{roomArchived ? 'Restore' : 'Archive'}</button>}
            </div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {edit && !archived && <button type="button" disabled={busy} className="rounded border border-gray-600 px-3 py-1 hover:bg-gray-700" onClick={() => {
      const name = nextName('Room', rooms.map((room) => room.name));
      const { document, schemaVersion } = newRoomDocument(name);
      return onWrite((api) => api.createRoom(phase.phase_id, name, document, schemaVersion));
    }}>+ Room</button>}
  </section>;
}
