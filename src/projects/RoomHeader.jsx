import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { ROOM_STATUS_LABELS } from '../elevation/model/designProjects.js';
import { cloudSync } from '../elevation/store/cloudSync.js';
import { ROOM_STATUS_COLORS } from './PhaseSection.jsx';
import useOnline from './useOnline.js';

export default function RoomHeader({ projectId, roomId }) {
  const { cloud, rooms } = useSelector((state) => state.elevation);
  const online = useOnline();
  const [saving, setSaving] = useState(false);
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

  return <div className="space-y-2">
    <Link to={`/projects/${projectId}`} className="text-sm text-blue-400 hover:underline">← Project</Link>
    <h1 className="text-lg font-semibold">{room?.name}</h1>
    <span className={`inline-block rounded px-2 py-1 text-xs ${ROOM_STATUS_COLORS[info.status]}`}>{ROOM_STATUS_LABELS[info.status]}</span>
    <div className={`flex flex-wrap items-center gap-2 text-xs ${saveColor}`}>
      <span role="status">{saveText}</span>
      {canSave && <button type="button" disabled={saving} className="rounded border border-gray-600 px-2 py-1" onClick={saveNow}>{saving ? 'Saving…' : 'Save now'}</button>}
    </div>
  </div>;
}
