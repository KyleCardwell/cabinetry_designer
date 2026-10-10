import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { teamDoorStyle } from '../../elevation/model/doorStyles.js';
import { deleteProfilePoint, mirrorProfile, PROFILE_GRID_STEPS, rotateProfile, setLoopClosed } from '../../elevation/model/profileEditing.js';
import { profileDoorGhost } from '../../elevation/model/profileGhost.js';
import { PROFILE_KINDS, isSectionProfile, profileKindLabel, stretchLineProblem } from '../../elevation/model/sectionProfiles.js';
import { formatInches } from '../../elevation/model/units.js';
import { updateSectionProfile } from '../../elevation/store/elevationSlice.js';
import ProfileDetailsDialog from '../ProfileDetailsDialog.jsx';
import KindPanel from './KindPanel.jsx';
import DrawnPanel from './DrawnPanel.jsx';
import PointsPanel from './PointsPanel.jsx';
import ProfileCanvas from './ProfileCanvas.jsx';
import SegmentPanel from './SegmentPanel.jsx';
import useProfileDraft from './useProfileDraft.js';

const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const HISTORY_BUTTON_CLASS = `${BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-50`;
const TURN_FAILURE = 'That turn would make the shape invalid.';

export default function ProfileEditor({ profileId, backLabel, onClose }) {
  const dispatch = useDispatch();
  const saved = useSelector((state) => state.elevation.settings.sectionProfiles.find((profile) => profile.id === profileId));
  const teamStyle = useSelector((state) => teamDoorStyle(state.elevation.settings));
  const { draft, apply: applyDraft, undo, redo, canUndo, canRedo, dirty } = useProfileDraft(saved);
  const [message, setMessage] = useState(null);
  const [discarding, setDiscarding] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selection, setSelection] = useState(null);
  const [grid, setGrid] = useState(1 / 16);
  const [fitSignal, setFitSignal] = useState(0);
  const [tool, setTool] = useState('select');
  const [showGhost, setShowGhost] = useState(true);
  const canvasRef = useRef(null);

  const apply = useCallback((next, failText = 'That change would make the shape invalid.') => {
    if (next === null) {
      setMessage(failText);
      return false;
    }
    applyDraft(next);
    setMessage(null);
    setDiscarding(false);
    return true;
  }, [applyDraft]);

  const close = () => onClose({ saved: savedOnce });

  const switchTool = (nextTool) => {
    setTool(nextTool);
    if (nextTool === 'line') setSelection(null);
  };

  useEffect(() => {
    setMessage(null);
    setDiscarding(false);
    setSavedOnce(false);
    setSelection(null);
    setTool('select');
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
      if (detailsOpen) return;
      if (event.target.closest?.('input, select, textarea, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.ctrlKey && key === 'y') {
        event.preventDefault();
        redo();
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (key === 'f') {
          event.preventDefault();
          setFitSignal((current) => current + 1);
        } else if (key === 'v' || key === 'l') {
          event.preventDefault();
          setTool(key === 'v' ? 'select' : 'line');
          if (key === 'l') setSelection(null);
        } else if (key === 'escape') {
          event.preventDefault();
          if (tool === 'line' && canvasRef.current?.cancelLine()) return;
          setTool('select');
          setSelection(null);
        } else if (key === 'enter' && tool === 'line') {
          event.preventDefault();
          canvasRef.current?.finishLine();
        } else if ((key === 'delete' || key === 'backspace') && selection?.kind === 'point') {
          event.preventDefault();
          if (apply(deleteProfilePoint(draft, selection.id), 'That point is used by a line or arc — join it out first.')) setSelection(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, tool, selection, draft, apply, detailsOpen]);

  if (!saved || !draft) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-gray-100">Profile not found.</p>
        <button type="button" className={BUTTON_CLASS} onClick={close}>{backLabel}</button>
      </div>
    );
  }

  const ghost = showGhost ? profileDoorGhost(draft.kind, teamStyle) : null;
  const doorKind = PROFILE_KINDS[draft.kind]?.axes === 'door';
  const profileToSave = { ...saved, kind: draft.kind, geometry: draft.geometry, drawnPoints: draft.drawnPoints };
  if (draft.stretch) profileToSave.stretch = draft.stretch;
  else delete profileToSave.stretch;
  const saveDisabled = !dirty || !isSectionProfile(profileToSave);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-gray-700 bg-gray-800/60 px-4 py-2">
        {dirty ? (
          <button
            type="button"
            className={`${BUTTON_CLASS}${discarding ? ' text-red-300' : ''}`}
            onClick={() => {
              if (discarding) close();
              else setDiscarding(true);
            }}
          >
            {discarding ? 'Discard changes?' : backLabel}
          </button>
        ) : <button type="button" className={BUTTON_CLASS} onClick={close}>{backLabel}</button>}
        <span className="font-medium text-gray-100">{saved.name}</span>
        <span className="text-xs text-gray-400">v{saved.version}</span>
        <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300">{profileKindLabel(draft.kind)}</span>
        {saved.archived && <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400">archived</span>}
        {dirty && <span className="text-xs text-amber-300">Unsaved</span>}
        <button type="button" className={BUTTON_CLASS} onClick={() => setDetailsOpen(true)}>Details</button>
        <div className="flex-1" />
        <button type="button" className={HISTORY_BUTTON_CLASS} disabled={!canUndo} onClick={undo}>Undo</button>
        <button type="button" className={HISTORY_BUTTON_CLASS} disabled={!canRedo} onClick={redo}>Redo</button>
        <button
          type="button"
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
          disabled={saveDisabled}
          onClick={() => {
            if (saveDisabled) return;
            dispatch(updateSectionProfile({ profileId: saved.id, profile: profileToSave }));
            setSavedOnce(true);
          }}
        >
          Save
        </button>
        {saveDisabled && stretchLineProblem(profileToSave) && <span className="text-xs text-amber-300">Move the stretch line to save</span>}
      </header>
      {message && <p role="status" className="px-4 py-1 text-sm text-red-300">{message}</p>}
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 flex-1 bg-gray-900">
          <div className="absolute left-2 top-2 z-10 flex gap-2">
            <button type="button" className={`${BUTTON_CLASS} ${tool === 'select' ? 'bg-blue-600 text-white' : 'bg-gray-800'}`} aria-pressed={tool === 'select'} onClick={() => switchTool('select')}>Select (V)</button>
            <button type="button" className={`${BUTTON_CLASS} ${tool === 'line' ? 'bg-blue-600 text-white' : 'bg-gray-800'}`} aria-pressed={tool === 'line'} onClick={() => switchTool('line')}>Line (L)</button>
            <button type="button" className={`${BUTTON_CLASS} bg-gray-800`} onClick={() => setFitSignal((current) => current + 1)}>Fit</button>
            <button type="button" className={`${BUTTON_CLASS} bg-gray-800`} title="Rotate 90° counter-clockwise about 0, 0" aria-label="Rotate counter-clockwise" onClick={() => apply(rotateProfile(draft, 1), TURN_FAILURE)}>⟲</button>
            <button type="button" className={`${BUTTON_CLASS} bg-gray-800`} title="Rotate 90° clockwise about 0, 0" aria-label="Rotate clockwise" onClick={() => apply(rotateProfile(draft, -1), TURN_FAILURE)}>⟳</button>
            <button type="button" className={`${BUTTON_CLASS} bg-gray-800`} title="Flip left–right across x = 0" aria-label="Flip left-right" onClick={() => apply(mirrorProfile(draft, 'x'), TURN_FAILURE)}>⇆</button>
            <button type="button" className={`${BUTTON_CLASS} bg-gray-800`} title="Flip up–down across y = 0" aria-label="Flip up-down" onClick={() => apply(mirrorProfile(draft, 'y'), TURN_FAILURE)}>⇅</button>
            {doorKind && (
              <button type="button" className={`${BUTTON_CLASS} ${showGhost ? 'bg-blue-600 text-white' : 'bg-gray-800'}`} aria-pressed={showGhost} title="Show the team default door (stile, groove and panel) behind the shape" onClick={() => setShowGhost((current) => !current)}>Door</button>
            )}
            <label className="flex items-center gap-2 rounded bg-gray-800 px-2 text-sm text-gray-200">
              Grid
              <select className="rounded border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100" value={grid} onChange={(event) => setGrid(Number(event.target.value))}>
                {PROFILE_GRID_STEPS.map((step) => <option key={step} value={step}>{formatInches(step, step)}</option>)}
              </select>
            </label>
          </div>
          <ProfileCanvas ref={canvasRef} key={profileId} profile={draft} ghost={ghost} grid={grid} selection={selection} onSelect={setSelection} fitSignal={fitSignal} tool={tool} onApply={apply} onMessage={setMessage} />
        </div>
        <aside className="w-96 shrink-0 overflow-y-auto border-l border-gray-700 p-4 space-y-5">
          {selection?.kind === 'segment' && <SegmentPanel profile={draft} loopId={selection.loopId} index={selection.index} onApply={apply} onSelect={setSelection} />}
          <PointsPanel
            profile={draft}
            selectedPointId={selection?.kind === 'point' ? selection.id : null}
            onSelectPoint={(id) => setSelection(id === null ? null : { kind: 'point', id })}
            onApply={apply}
          />
          <KindPanel profile={draft} onApply={apply} />
          <DrawnPanel
            profile={draft}
            selectedPointId={selection?.kind === 'point' ? selection.id : null}
            onSelectPoint={(id) => setSelection(id === null ? null : { kind: 'point', id })}
            onApply={apply}
          />
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-gray-200">Loops</h2>
            {draft.geometry.loops.map((loop) => (
              <div key={loop.id} className="flex items-center justify-between gap-2 text-xs text-gray-400">
                <span>{loop.id} · {loop.closed ? 'closed' : 'open'} · {loop.segs.length} segments</span>
                <button
                  type="button"
                  className="rounded border border-gray-600 px-2 py-0.5 text-gray-200 hover:bg-gray-700"
                  aria-label={`${loop.closed ? 'Open' : 'Close'} loop ${loop.id}`}
                  onClick={() => apply(setLoopClosed(draft, loop.id, !loop.closed), 'A closed shape needs at least 3 points.')}
                >
                  {loop.closed ? 'Open' : 'Close'}
                </button>
              </div>
            ))}
          </section>
          <p className="text-xs text-gray-500">Pick the kind first: it sets which way the shape is drawn and what 0, 0 means. Open lines are cuts; closed shapes are applied pieces. To turn or flip the shape about a point, press Origin on that point first. Drawn points become lines in each view. Line tool: click points, click the first point to close, Enter to finish open. Select a segment to make it an arc.</p>
        </aside>
      </div>
      {detailsOpen && <ProfileDetailsDialog key={saved.id} profile={saved} showKind={false} onClose={() => setDetailsOpen(false)} />}
    </div>
  );
}
