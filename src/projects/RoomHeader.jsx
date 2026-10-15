import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { ROOM_STATUS_LABELS } from '../elevation/model/designProjects.js';
import { ROOM_STATUSES } from '../elevation/model/roomVersions.js';
import { cloudSync } from '../elevation/store/cloudSync.js';
import { setRoomStatus } from '../elevation/store/cloudThunks.js';
import { ROOM_STATUS_COLORS } from './PhaseSection.jsx';
import useOnline from './useOnline.js';

export default function RoomHeader({ projectId, roomId }) {
  const dispatch = useDispatch();
  const { cloud, rooms, source } = useSelector((state) => state.elevation);
  const online = useOnline();
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState(null);
  const room = rooms.find((entry) => entry.id === roomId);
  const info = cloud.room;
  let saveText = 'All changes saved';
  let saveColor = 'text-teal-400';
  let canSave = false;
  if (info.readOnly) {
    saveText = 'View only';
    saveColor = 'text-gray-400';
  } else if (!online) {
    saveText = 'Offline — changes kept in this browser';
    saveColor = 'text-amber-300';
  } else if (cloud.error || cloud.conflict || cloud.statusBlock) {
    saveText = 'Not saved';
    saveColor = 'text-red-300';
  } else if (cloud.pending > 0) {
    saveText = 'Unsaved changes';
    saveColor = 'text-amber-300';
    canSave = true;
  }

  async function saveNow() {
    setSaving(true);
    try { await cloudSync.flush(); }
    finally { setSaving(false); }
  }

  async function changeStatus(event) {
    setStatusError(null);
    setSavingStatus(true);
    try {
      const reply = await dispatch(setRoomStatus(event.target.value));
      if (!reply.ok) setStatusError(reply.message);
    } finally { setSavingStatus(false); }
  }

  return <div className="space-y-2">
    <Link to={`/projects/${projectId}`} className="text-sm text-blue-400 hover:underline">← Project</Link>
    <h1 className="text-lg font-semibold">{room?.name}</h1>
    <div>
      {source === 'cloud' && cloud.permissions.edit && !info.readOnly ? <>
        <select aria-label="Room status" value={info.status} disabled={savingStatus} onChange={changeStatus}
          className={`rounded px-2 py-1 text-xs ${ROOM_STATUS_COLORS[info.status]}`}>
          {ROOM_STATUSES.map((status) => <option key={status} value={status}>{ROOM_STATUS_LABELS[status]}</option>)}
        </select>
        {savingStatus && <span role="status" className="ml-2 text-xs">Saving…</span>}
      </> : <span className={`inline-block rounded px-2 py-1 text-xs ${ROOM_STATUS_COLORS[info.status]}`}>{ROOM_STATUS_LABELS[info.status]}</span>}
      {statusError && <p role="alert" className="mt-2 text-xs text-red-300">{statusError}</p>}
    </div>
    <div className={`flex flex-wrap items-center gap-2 text-xs ${saveColor}`}>
      <span role="status">{saveText}</span>
      {canSave && <button type="button" disabled={saving} className="rounded border border-gray-600 px-2 py-1" onClick={saveNow}>{saving ? 'Saving…' : 'Save now'}</button>}
    </div>
  </div>;
}
