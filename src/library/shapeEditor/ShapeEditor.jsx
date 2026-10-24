import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { deleteProfilePoint, deleteProfileSegment, PROFILE_GRID_STEPS, setLoopClosed } from '../../elevation/model/profileEditing.js';
import { SHAPE_KINDS } from '../../elevation/model/constants.js';
import {
  fitShapeBox, flipShape, isShapeDraft, isShapeList, moveShapeOrigin, shapeStretchProblems,
  shapeView, shapeViewProfile, stretchProblemText, withShapeView,
} from '../../elevation/model/libraryShapes.js';
import { formatInches } from '../../elevation/model/units.js';
import { updateShape } from '../../elevation/store/elevationSlice.js';
import { useShopReadOnly } from '../WorkspaceSourceBar.jsx';
import PointsPanel from '../profileEditor/PointsPanel.jsx';
import ProfileCanvas from '../profileEditor/ProfileCanvas.jsx';
import SegmentPanel from '../profileEditor/SegmentPanel.jsx';
import useProfileDraft from '../profileEditor/useProfileDraft.js';
import BoxPanel from './BoxPanel.jsx';
import ViewTabs, { SHAPE_VIEWS } from './ViewTabs.jsx';

const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const HISTORY_BUTTON_CLASS = `${BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-50`;
const INPUT_CLASS = 'rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const shapeKey = (shape) => JSON.stringify([shape.name, shape.kind, shape.notes, shape.box, shape.views, shape.stretch]);
const normalizeShape = (shape) => ({ ...shape, name: shape.name.trim(),
  ...(Object.hasOwn(shape, 'notes') ? { notes: shape.notes.trim() } : {}) });

export default function ShapeEditor({ shapeId, backLabel = '← Shapes', onClose }) {
  const dispatch = useDispatch();
  const shapes = useSelector((state) => state.elevation.settings.shapes);
  const saved = shapes.find((shape) => shape.id === shapeId);
  const readOnly = useShopReadOnly();
  const { draft, apply: applyDraft, undo, redo, canUndo, canRedo, dirty } = useProfileDraft(saved, shapeKey);
  const normalized = draft && normalizeShape(draft);
  // Keep the drawing editable while the name field is empty or has surrounding spaces.
  const editable = normalized && { ...normalized, name: normalized.name || saved?.name };
  const [view, setView] = useState('front');
  const [removingView, setRemovingView] = useState(false);
  const drawnView = Boolean(draft?.views[view]);
  const profile = editable && shapeViewProfile(editable, view);
  const [message, setMessage] = useState(null);
  const [discarding, setDiscarding] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [selection, setSelection] = useState(null);
  const [grid, setGrid] = useState(1 / 16);
  const [fitSignal, setFitSignal] = useState(0);
  const [tool, setTool] = useState('select');
  const canvasRef = useRef(null);

  const applyShape = (next, failText = 'That change would make the shape invalid.') => {
    if (readOnly) return false;
    if (!isShapeDraft(next)) {
      setMessage(failText);
      return false;
    }
    applyDraft({ ...next, name: draft.name,
      ...(Object.hasOwn(draft, 'notes') ? { notes: draft.notes } : {}) });
    setMessage(null);
    setDiscarding(false);
    return true;
  };

  const apply = useCallback((next, failText = 'That change would make the shape invalid.') => {
    if (readOnly || !drawnView) return false;
    if (next === null) {
      setMessage(failText);
      return false;
    }
    // The adapter writes only the current view geometry; retain uncommitted header text.
    const current = normalizeShape(draft);
    const nextShape = withShapeView({ ...current, name: current.name || saved?.name }, view, next);
    if (!nextShape) {
      setMessage(failText);
      return false;
    }
    applyDraft({ ...draft, views: nextShape.views });
    setMessage(null);
    setDiscarding(false);
    return true;
  }, [applyDraft, draft, saved?.name, readOnly, drawnView, view]);

  const close = () => onClose({ saved: savedOnce });

  const switchTool = (nextTool) => {
    setTool(nextTool);
    if (['line', 'rect', 'circle', 'measure'].includes(nextTool)) setSelection(null);
  };

  useEffect(() => {
    setMessage(null);
    setDiscarding(false);
    setSavedOnce(false);
    setSelection(null);
    setTool('select');
    setView('front');
    setRemovingView(false);
  }, [shapeId]);

  useEffect(() => {
    setDiscarding(false);
    setRemovingView(false);
    setSelection((current) => {
      if (current?.kind === 'point' && !Object.hasOwn(draft?.views[view]?.points ?? {}, current.id)) return null;
      if (current?.kind === 'segment') {
        const loop = draft?.views[view]?.loops.find((entry) => entry.id === current.loopId);
        if (!loop?.segs[current.index]) return null;
      }
      return current;
    });
  }, [draft, view]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (readOnly) return;
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
        } else if (['v', 'l', 'r', 'c'].includes(key) && drawnView) {
          event.preventDefault();
          setTool({ v: 'select', l: 'line', r: 'rect', c: 'circle' }[key]);
          if (key !== 'v') setSelection(null);
        } else if (key === 'd') {
          event.preventDefault();
          setTool(tool === 'measure' ? 'select' : 'measure');
          setSelection(null);
        } else if (key === 'escape') {
          event.preventDefault();
          if (['line', 'rect', 'circle'].includes(tool) && canvasRef.current?.cancelLine()) return;
          if (tool === 'measure' && canvasRef.current?.measureEscape()) return;
          setTool('select');
          setSelection(null);
        } else if (key === 'enter' && tool === 'line') {
          event.preventDefault();
          canvasRef.current?.finishLine();
        } else if ((key === 'delete' || key === 'backspace') && selection?.kind === 'point') {
          event.preventDefault();
          if (apply(deleteProfilePoint(profile, selection.id), 'That point is used by a line or arc — join it out first.')) setSelection(null);
        } else if ((key === 'delete' || key === 'backspace') && selection?.kind === 'segment') {
          event.preventDefault();
          if (apply(deleteProfileSegment(profile, selection.loopId, selection.index), 'A shape needs at least one line.')) setSelection(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, tool, selection, profile, apply, readOnly, drawnView]);

  if (!saved || !draft) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-gray-100">Shape not found.</p>
        <button type="button" className={BUTTON_CLASS} onClick={close}>{backLabel}</button>
      </div>
    );
  }

  const [a, b, width, height] = SHAPE_VIEWS[view].boxKeys.map((key) => draft.box[key]);
  const ghost = {
    units: 'in',
    points: { b1: [a, b], b2: [a + width, b], b3: [a + width, b + height], b4: [a, b + height] },
    loops: [{ id: 'box', closed: true, segs: ['b1', 'b2', 'b3', 'b4'].map((id, index, ids) => ({
      type: 'line', from: id, to: ids[(index + 1) % ids.length],
    })) }],
  };
  const problems = shapeStretchProblems(normalized) ?? [];
  const nameConflict = !saved.archived && shapes.some((shape) => shape.id !== saved.id && !shape.archived
    && shape.name.toLowerCase() === normalized.name.toLowerCase());
  const saveDisabled = readOnly || !dirty || !isShapeList(shapes.map((shape) => shape.id === saved.id ? normalized : shape));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-gray-700 bg-gray-800/60 px-4 py-2">
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
        <label className="flex items-center gap-2 text-sm text-gray-300">
          Name
          <input aria-label="Shape name" className={INPUT_CLASS} value={draft.name} disabled={readOnly}
            onChange={(event) => { if (!readOnly) applyDraft({ ...draft, name: event.target.value }); }} />
        </label>
        <span className="text-xs text-gray-400">v{saved.version}</span>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          Kind
          <select aria-label="Shape kind" className={INPUT_CLASS} value={draft.kind} disabled={readOnly}
            onChange={(event) => { if (!readOnly) applyDraft({ ...draft, kind: event.target.value }); }}>
            {Object.entries(SHAPE_KINDS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
          </select>
        </label>
        {saved.archived && <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400">archived</span>}
        {dirty && <span className="text-xs text-amber-300">Unsaved</span>}
        <label className="flex items-center gap-2 text-sm text-gray-300">
          Notes
          <textarea aria-label="Shape notes" rows={1} maxLength={500} className={INPUT_CLASS} value={draft.notes ?? ''} disabled={readOnly}
            onChange={(event) => { if (!readOnly) applyDraft({ ...draft, notes: event.target.value }); }} />
        </label>
        <div className="flex-1" />
        <button type="button" className={HISTORY_BUTTON_CLASS} disabled={readOnly || !canUndo} onClick={() => { if (!readOnly) undo(); }}>Undo</button>
        <button type="button" className={HISTORY_BUTTON_CLASS} disabled={readOnly || !canRedo} onClick={() => { if (!readOnly) redo(); }}>Redo</button>
        <button
          type="button"
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
          disabled={saveDisabled}
          onClick={() => {
            if (saveDisabled) return;
            dispatch(updateShape({ shape: normalized }));
            if (shapeKey(draft) !== shapeKey(normalized)) applyDraft(normalized);
            setSavedOnce(true);
          }}
        >
          Save
        </button>
        {nameConflict && <span role="alert" className="text-xs text-amber-300">A live shape already has that name.</span>}
        {!normalized.name && <span role="alert" className="text-xs text-amber-300">Enter a shape name.</span>}
      </header>
      {message && <p role="status" className="px-4 py-1 text-sm text-red-300">{message}</p>}
      {problems.map((problem, index) => <p key={index} role="alert" className="px-4 py-1 text-sm text-amber-300">
        {stretchProblemText(problem, normalized.stretch[problem.axis][problem.index])}
      </p>)}
      <ViewTabs view={view} onChange={(next) => {
        setView(next);
        setRemovingView(false);
        setSelection(null);
        setTool('select');
        setMessage(null);
      }} />
      <div id="shape-view-panel" role="tabpanel" aria-labelledby={`shape-tab-${view}`} className="flex min-h-0 flex-1">
        <div className="relative min-h-0 flex-1 bg-gray-900">
          <div aria-label={`${SHAPE_VIEWS[view].label} drawing tools`} className="absolute left-2 right-2 top-2 z-10 flex flex-wrap gap-2">
            <button type="button" className={`${BUTTON_CLASS} ${tool === 'select' ? 'bg-blue-600 text-white' : 'bg-gray-800'}`} aria-pressed={tool === 'select'} onClick={() => switchTool('select')}>Select (V)</button>
            <button type="button" className={`${BUTTON_CLASS} ${tool === 'line' ? 'bg-blue-600 text-white' : 'bg-gray-800'}`} aria-pressed={tool === 'line'} disabled={readOnly || !drawnView} onClick={() => switchTool('line')}>Line (L)</button>
            <button type="button" className={`${BUTTON_CLASS} ${tool === 'rect' ? 'bg-blue-600 text-white' : 'bg-gray-800'}`} aria-pressed={tool === 'rect'} disabled={readOnly || !drawnView} onClick={() => switchTool('rect')}>Rectangle (R)</button>
            <button type="button" className={`${BUTTON_CLASS} ${tool === 'circle' ? 'bg-blue-600 text-white' : 'bg-gray-800'}`} aria-pressed={tool === 'circle'} disabled={readOnly || !drawnView} onClick={() => switchTool('circle')}>Circle (C)</button>
            <button type="button" className={`${BUTTON_CLASS} ${tool === 'measure' ? 'bg-blue-600 text-white' : 'bg-gray-800'}`} aria-pressed={tool === 'measure'} onClick={() => switchTool('measure')}>Measure (D)</button>
            <button type="button" className={`${BUTTON_CLASS} bg-gray-800`} onClick={() => setFitSignal((current) => current + 1)}>Fit</button>
            <label className="flex items-center gap-2 rounded bg-gray-800 px-2 text-sm text-gray-200">
              Grid
              <select className="rounded border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100" value={grid} onChange={(event) => setGrid(Number(event.target.value))}>
                {PROFILE_GRID_STEPS.map((step) => <option key={step} value={step}>{formatInches(step, step)}</option>)}
              </select>
            </label>
          </div>
          <ProfileCanvas ref={canvasRef} key={`${shapeId}:${view}:${drawnView}`} profile={profile} ghost={ghost} grid={grid} selection={selection} onSelect={setSelection} fitSignal={fitSignal} tool={tool} onApply={apply} onMessage={setMessage} />
        </div>
        <aside className="w-96 shrink-0 overflow-y-auto border-l border-gray-700 p-4 space-y-5">
          <BoxPanel box={draft.box} readOnly={readOnly}
            onChange={(box) => applyShape({ ...editable, box }, 'W, H and D must be greater than zero.')}
            onFit={() => applyShape(fitShapeBox(editable), 'The drawing must have a positive size on each drawn axis.')} />
          <div className="flex flex-wrap gap-2">
            {[['x', '⇆ Flip left–right'], ['z', '⇅ Flip up–down'], ['y', 'Flip front–back']].map(([axis, label]) => (
              <button key={axis} type="button" className={HISTORY_BUTTON_CLASS} disabled={readOnly}
                onClick={() => applyShape(flipShape(editable, axis))}>{label}</button>
            ))}
          </div>
          {view !== 'front' && (!drawnView ? (
            <section className="space-y-2 text-sm text-gray-300">
              <p>No {view} view yet: drawn as the {view === 'plan' ? 'W × D' : 'D × H'} size-box rectangle.</p>
              <button type="button" className={HISTORY_BUTTON_CLASS} disabled={readOnly}
                onClick={() => applyShape({ ...editable, views: { ...draft.views, [view]: shapeView(editable, view) } })}>
                Draw this view
              </button>
            </section>
          ) : (
            <button type="button" className={HISTORY_BUTTON_CLASS} disabled={readOnly} onClick={() => {
              if (readOnly) return;
              if (!removingView) { setRemovingView(true); return; }
              const views = { ...draft.views };
              delete views[view];
              if (applyShape({ ...editable, views })) {
                setRemovingView(false);
                setSelection(null);
                setTool('select');
              }
            }}>{removingView ? 'Confirm remove view' : 'Remove view'}</button>
          ))}
          {drawnView && <>
            {selection?.kind === 'segment' && <SegmentPanel profile={profile} loopId={selection.loopId} index={selection.index} onApply={apply} onSelect={setSelection} />}
            <PointsPanel
              profile={profile}
              selectedPointId={selection?.kind === 'point' ? selection.id : null}
              onSelectPoint={(id) => setSelection(id === null ? null : { kind: 'point', id })}
              onApply={apply}
              onOrigin={(id) => applyShape(moveShapeOrigin(editable, view, id))}
            />
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-gray-200">Loops</h2>
              {profile.geometry.loops.map((loop) => (
                <div key={loop.id} className="flex items-center justify-between gap-2 text-xs text-gray-400">
                  <span>{loop.id} · {loop.closed ? 'closed' : 'open'} · {loop.segs.length} segments</span>
                  <button
                    type="button"
                    className="rounded border border-gray-600 px-2 py-0.5 text-gray-200 hover:bg-gray-700"
                    aria-label={`${loop.closed ? 'Open' : 'Close'} loop ${loop.id}`}
                    onClick={() => apply(setLoopClosed(profile, loop.id, !loop.closed), 'A closed shape needs at least 3 points.')}
                  >
                    {loop.closed ? 'Open' : 'Close'}
                  </button>
                </div>
              ))}
            </section>
          </>}
          <p className="text-xs text-gray-500">{SHAPE_VIEWS[view].label} view · {SHAPE_VIEWS[view].axes}. Line tool: click points, click the first point to close, Enter to finish open. Select a segment to make it an arc.</p>
        </aside>
      </div>
    </div>
  );
}
