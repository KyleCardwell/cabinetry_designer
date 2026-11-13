import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { withDesignApi } from '../elevation/store/cloudThunks.js';
import { copyName } from '../elevation/model/designProjects.js';
import { selectDesignPermissions } from '../store/permissions.js';

export default function CopyRoomDialog({ room, phaseId, phases, onClose, onCopied }) {
  const dispatch = useDispatch();
  const teamId = useSelector((state) => state.auth.teamId);
  const { view, edit } = useSelector(selectDesignPermissions);
  const [name, setName] = useState(copyName(room.name));
  const [toPhaseId, setToPhaseId] = useState(phaseId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  if (!teamId || !view || !edit) return null;

  const livePhases = phases.filter((phase) => !phase.archived_at);
  const canCopy = Boolean(name.trim()) && livePhases.some((phase) => phase.phase_id === toPhaseId);
  async function copy(event) {
    event.preventDefault();
    if (!canCopy || saving) return;
    setSaving(true);
    setError(null);
    const reply = await dispatch(withDesignApi((api) => api.copyRoom(room.room_id, toPhaseId, name.trim())));
    setSaving(false);
    if (reply.ok) onCopied();
    else setError(reply.message);
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onKeyDown={(event) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
  }}>
    <section role="dialog" aria-modal="true" aria-labelledby="copy-room-title" className="w-full max-w-md rounded border border-gray-700 bg-gray-800 p-6 space-y-4">
      <h2 id="copy-room-title" className="text-lg font-semibold">Copy room</h2>
      {error && <div role="alert" className="rounded border border-red-700 bg-red-950 p-3 text-red-200">{error}</div>}
      <form onSubmit={copy} className="space-y-4">
        <label className="block space-y-1 text-sm"><span>Name</span>
          <input autoFocus required aria-label="Name" value={name} disabled={saving} onChange={(event) => setName(event.target.value)} className="w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-gray-100" />
        </label>
        <label className="block space-y-1 text-sm"><span>To phase</span>
          <select aria-label="To phase" value={toPhaseId} disabled={saving} onChange={(event) => setToPhaseId(event.target.value)} className="w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-gray-100">
            {livePhases.map((phase) => <option key={phase.phase_id} value={phase.phase_id}>{phase.name}</option>)}
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded border border-gray-600 px-4 py-2 hover:bg-gray-700" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={!canCopy || saving} className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-500 disabled:opacity-50">Copy</button>
        </div>
      </form>
    </section>
  </div>;
}
