import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { applyStaleRoomDraft, discardStaleRoomDraft } from '../elevation/store/cloudThunks.js';

export default function StaleDraftDialog({ staleDraft }) {
  const dispatch = useDispatch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const savedAt = new Date(staleDraft.savedAt);

  async function choose(thunk) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const reply = await dispatch(thunk());
      if (!reply.ok) setError(reply.message);
    } finally { setBusy(false); }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    onKeyDown={(event) => event.stopPropagation()}>
    <section role="dialog" aria-modal="true" aria-labelledby="stale-room-draft-title" className="w-full max-w-lg space-y-4 rounded border border-gray-700 bg-gray-800 p-6 text-gray-100">
      <h2 id="stale-room-draft-title" className="text-lg font-semibold">Unsaved changes from this browser</h2>
      <p>This browser has changes to this room from {savedAt.toLocaleDateString()} {savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} that were never saved. The room has been saved again since.</p>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <button autoFocus type="button" disabled={busy} className="rounded bg-blue-600 px-3 py-2 disabled:opacity-50" onClick={() => choose(applyStaleRoomDraft)}>Restore my changes</button>
          <p className="mt-1 text-xs text-gray-300">Replaces the saved room; the newer save is overwritten</p>
        </div>
        <button type="button" disabled={busy} className="rounded border border-gray-600 px-3 py-2 disabled:opacity-50" onClick={() => choose(discardStaleRoomDraft)}>Discard them</button>
      </div>
    </section>
  </div>;
}
