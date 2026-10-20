import { useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { defaultVersionLabel } from '../elevation/model/roomVersions.js';
import { issueRoomVersion, issueSnapshotOf, reloadRoomAfterConflict } from '../elevation/store/cloudThunks.js';

export default function IssueDialog({ onClose }) {
  const dispatch = useDispatch();
  const store = useStore();
  const userName = useSelector((state) => state.auth?.userName);
  const [label, setLabel] = useState(() => defaultVersionLabel(userName));
  const [note, setNote] = useState('');
  const [snapshot] = useState(() => issueSnapshotOf(store.getState()));
  const [issuing, setIssuing] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState(null);
  const busy = issuing || reloading;
  const missingDoors = snapshot?.missing.doorDesigns.length > 0;
  const missingPulls = snapshot?.missing.pulls?.length > 0;
  const missingSlides = snapshot?.missing.slides?.length > 0;
  const missingAccessories = snapshot?.missing.accessories?.length > 0;
  const missingProfiles = snapshot?.missing.profiles.length ?? 0;
  const canIssue = snapshot && !missingDoors && !missingPulls && !missingSlides && !missingAccessories && label.trim() && !busy;

  async function issue(event) {
    event.preventDefault();
    if (!canIssue) return;
    setError(null);
    setIssuing(true);
    try {
      const reply = await dispatch(issueRoomVersion({ label, note }));
      if (reply.ok) onClose();
      else setError(reply);
    } finally { setIssuing(false); }
  }

  async function useTheirs() {
    if (busy) return;
    setReloading(true);
    try {
      await dispatch(reloadRoomAfterConflict());
      onClose();
    } finally { setReloading(false); }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    onKeyDown={(event) => event.stopPropagation()}>
    <section role="dialog" aria-modal="true" aria-labelledby="issue-room-version-title" className="w-full max-w-lg space-y-4 rounded border border-gray-700 bg-gray-800 p-6 text-gray-100">
      <h2 id="issue-room-version-title" className="text-lg font-semibold">Issue a version</h2>
      <p>Freezes the room as it is now, with the shop settings and library it draws with. The drawing keeps changing; the version never does.</p>
      <form onSubmit={issue} className="space-y-4">
        <div>
          <label htmlFor="issue-room-version-label" className="mb-1 block text-sm">Label</label>
          <input autoFocus id="issue-room-version-label" value={label} disabled={busy} onChange={(event) => setLabel(event.target.value)}
            className="w-full rounded border border-gray-600 bg-gray-900 px-3 py-2" />
        </div>
        <div>
          <label htmlFor="issue-room-version-note" className="mb-1 block text-sm">Note</label>
          <textarea id="issue-room-version-note" value={note} disabled={busy} placeholder="What changed (optional)" onChange={(event) => setNote(event.target.value)}
            className="w-full rounded border border-gray-600 bg-gray-900 px-3 py-2" />
        </div>
        {missingDoors && <p className="text-sm text-amber-300">This room uses door designs that aren't in the Library. Move them with the notice under the toolbar, then issue.</p>}
        {missingPulls && <p className="text-sm text-amber-300">This room uses pulls that aren't in the Library. Move them with the notice under the toolbar, then issue.</p>}
        {missingSlides && <p className="text-sm text-amber-300">This room uses a slide that is no longer in the library. Pick a replacement, then issue.</p>}
        {missingAccessories && <p className="text-sm text-amber-300">This room uses an accessory that is no longer in the library. Pick a replacement, then issue.</p>}
        {missingProfiles > 0 && <p className="text-sm text-gray-300">{missingProfiles} profile(s) the room names aren't in the Library. The version will show them as missing.</p>}
        {error && <p role="alert" className="text-sm text-red-300">{error.message}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={!canIssue} className="rounded bg-blue-600 px-3 py-2 disabled:opacity-50">{issuing ? 'Issuing…' : 'Issue'}</button>
          <button type="button" disabled={busy} onClick={onClose} className="rounded border border-gray-600 px-3 py-2 disabled:opacity-50">Cancel</button>
          {error?.reason === 'conflict' && <button type="button" disabled={busy} onClick={useTheirs} className="rounded border border-gray-600 px-3 py-2 disabled:opacity-50">Use theirs</button>}
        </div>
      </form>
    </section>
  </div>;
}
