import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PROFILE_GRID_STEPS } from '../../elevation/model/profileEditing.js';
import { formatInches } from '../../elevation/model/units.js';
import { updateSectionProfile } from '../../elevation/store/elevationSlice.js';
import PointsPanel from './PointsPanel.jsx';
import ProfileCanvas from './ProfileCanvas.jsx';
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
  const [grid, setGrid] = useState(1 / 16);
  const [fitSignal, setFitSignal] = useState(0);

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
      } else if (key === 'f' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setFitSignal((current) => current + 1);
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

  const selectedLoop = selection?.kind === 'segment'
    ? draft.geometry.loops.find((loop) => loop.id === selection.loopId) : null;
  const selectedSegment = selectedLoop?.segs[selection.index];

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
          <div className="absolute left-2 top-2 z-10 flex gap-2">
            <button type="button" className={`${BUTTON_CLASS} bg-gray-800`} onClick={() => setFitSignal((current) => current + 1)}>Fit</button>
            <label className="flex items-center gap-2 rounded bg-gray-800 px-2 text-sm text-gray-200">
              Grid
              <select className="rounded border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100" value={grid} onChange={(event) => setGrid(Number(event.target.value))}>
                {PROFILE_GRID_STEPS.map((step) => <option key={step} value={step}>{formatInches(step, step)}</option>)}
              </select>
            </label>
          </div>
          <ProfileCanvas key={profileId} profile={draft} grid={grid} selection={selection} onSelect={setSelection} fitSignal={fitSignal} />
        </div>
        <aside className="w-96 shrink-0 overflow-y-auto border-l border-gray-700 p-4 space-y-5">
          {selectedSegment && <p className="text-xs text-gray-300">Segment {selection.index + 1} of {selectedLoop.segs.length} · {selectedLoop.id} · {selectedSegment.from} → {selectedSegment.to}</p>}
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
