import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { updateSectionProfile } from '../../elevation/store/elevationSlice.js';
import ProfileThumbnail from '../ProfileThumbnail.jsx';
import PointsPanel from './PointsPanel.jsx';
import useProfileDraft from './useProfileDraft.js';

const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const HISTORY_BUTTON_CLASS = `${BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-50`;

export default function ProfileEditorPage() {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const saved = useSelector((state) => state.elevation.settings.sectionProfiles.find((profile) => profile.id === profileId));
  const { draft, apply: applyDraft, undo, redo, canUndo, canRedo, dirty } = useProfileDraft(saved);
  const [message, setMessage] = useState(null);
  const [discarding, setDiscarding] = useState(false);
  const [selection, setSelection] = useState(null);

  useEffect(() => {
    setMessage(null);
    setDiscarding(false);
    setSelection(null);
  }, [profileId]);

  useEffect(() => {
    setDiscarding(false);
    setSelection((current) => {
      if (current?.kind === 'point' && !Object.hasOwn(draft?.geometry.points ?? {}, current.id)) return null;
      if (current?.kind === 'segment') {
        const loop = draft?.geometry.loops.find((entry) => entry.id === current.loopId);
        if (!loop?.segs[current.index]) return null;
      }
      return current;
    });
  }, [draft]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target.closest?.('input, select, textarea')) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.ctrlKey && key === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  const apply = (next, failText = 'That change would make the shape invalid.') => {
    if (next === null) {
      setMessage(failText);
      return false;
    }
    applyDraft(next);
    setMessage(null);
    setDiscarding(false);
    return true;
  };

  if (!saved || !draft) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-gray-100">Profile not found.</p>
        <Link to="/library/profiles" className={BUTTON_CLASS}>Back to profiles</Link>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-gray-700 bg-gray-800/60 px-4 py-2">
        {dirty ? (
          <button
            type="button"
            className={`${BUTTON_CLASS}${discarding ? ' text-red-300' : ''}`}
            onClick={() => {
              if (discarding) navigate('/library/profiles');
              else setDiscarding(true);
            }}
          >
            {discarding ? 'Discard changes?' : '← Profiles'}
          </button>
        ) : <Link to="/library/profiles" className={BUTTON_CLASS}>← Profiles</Link>}
        <span className="font-medium text-gray-100">{saved.name}</span>
        <span className="text-xs text-gray-400">v{saved.version}</span>
        {saved.archived && <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400">archived</span>}
        {dirty && <span className="text-xs text-amber-300">Unsaved</span>}
        <div className="flex-1" />
        <button type="button" className={HISTORY_BUTTON_CLASS} disabled={!canUndo} onClick={undo}>Undo</button>
        <button type="button" className={HISTORY_BUTTON_CLASS} disabled={!canRedo} onClick={redo}>Redo</button>
        <button
          type="button"
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
          disabled={!dirty}
          onClick={() => dispatch(updateSectionProfile({
            profileId: saved.id,
            profile: { ...saved, geometry: draft.geometry, attach: draft.attach, drawnPoints: draft.drawnPoints },
          }))}
        >
          Save
        </button>
      </header>
      {message && <p role="status" className="px-4 py-1 text-sm text-red-300">{message}</p>}
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 flex-1 bg-gray-900">
          <ProfileThumbnail profile={draft} className="h-full w-full p-8 text-gray-200" />
        </div>
        <aside className="w-96 shrink-0 overflow-y-auto border-l border-gray-700 p-4 space-y-5">
          <PointsPanel
            profile={draft}
            selectedPointId={selection?.kind === 'point' ? selection.id : null}
            onSelectPoint={(id) => setSelection({ kind: 'point', id })}
            onApply={apply}
          />
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-gray-200">Loops</h2>
            {draft.geometry.loops.map((loop) => (
              <p key={loop.id} className="text-xs text-gray-400">{loop.id} · {loop.closed ? 'closed' : 'open'} · {loop.segs.length} segments</p>
            ))}
          </section>
          <p className="text-xs text-gray-500">x runs in from the edge; y = 0 is the front face, negative into the door. Attach and drawn points come next round.</p>
        </aside>
      </div>
    </div>
  );
}
