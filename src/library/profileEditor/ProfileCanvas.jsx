import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  addCircleLoop, addRectangleLoop, addProfileLoop, addProfilePoint, formatProfileCoord, moveProfilePoint, moveProfilePoints, nextPointId, profileDrawnIn, snapProfilePoint,
} from '../../elevation/model/profileEditing.js';
import { PROFILE_KINDS, stretchLineProblem } from '../../elevation/model/sectionProfiles.js';
import { cutoutProfile } from '../../elevation/model/baseCutouts.js';
import { useMeasure } from '../../elevation/canvas/measureState.js';
import MeasureReadout from '../../elevation/components/MeasureReadout.jsx';
import MeasureSvg from '../../elevation/components/MeasureSvg.jsx';
import { profileMeasureGeometry } from '../../elevation/model/measure.js';
import { fitView, loopScreenPath, segmentScreenPath, toModel, toScreen, zoomAt } from './profileView.js';
import CoordInput from './CoordInput.jsx';
import { pointSelection, selectedPointIds, togglePointSelection } from './profileSelection.js';

function gridScreenPath(view, size, step) {
  const [minX, maxY] = toModel(view, size, [0, 0]);
  const [maxX, minY] = toModel(view, size, [size.width, size.height]);
  const commands = [];
  for (let i = Math.ceil(minX / step); i <= Math.floor(maxX / step); i += 1) {
    const [x] = toScreen(view, size, [i * step, 0]);
    commands.push(`M ${x} 0 V ${size.height}`);
  }
  for (let i = Math.ceil(minY / step); i <= Math.floor(maxY / step); i += 1) {
    const [, y] = toScreen(view, size, [0, i * step]);
    commands.push(`M 0 ${y} H ${size.width}`);
  }
  return commands.join(' ');
}

function hitSelection(target) {
  const hit = target.closest?.('[data-point-id], [data-loop-id]');
  if (hit?.dataset.pointId !== undefined) return { kind: 'point', id: hit.dataset.pointId };
  if (hit) return { kind: 'segment', loopId: hit.dataset.loopId, index: Number(hit.dataset.segmentIndex) };
  return null;
}

const LINE_FAILURE = 'A closed shape needs at least 3 points, an open line at least 2.';
const sameXY = (a, b) => a[0] === b[0] && a[1] === b[1];
const MEASURE_HINT = 'Click a corner, midpoint, centre or edge · Shift: point on an edge · Esc: clear';
const modelPoint = (view, size, screen) => { const [x, y] = toModel(view, size, screen); return { x, y }; };

function baseTopHeight(profile) {
  if (!Number.isFinite(profile.topGap) || profile.topGap <= 0) return null;
  const half = cutoutProfile(profile);
  return half ? half.at(-1)[1] + profile.topGap : null;
}

export default forwardRef(function ProfileCanvas({ profile, ghost = null, bands = [], grid, selection, onSelect, fitSignal, tool, onApply, onMessage }, ref) {
  const containerRef = useRef(null);
  const fittedRef = useRef(null);
  const gestureRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [picks, setPicks] = useState([]);
  const [selectionBox, setSelectionBox] = useState(null);
  const measuring = tool === 'measure';
  const drawingShape = tool === 'rect' || tool === 'circle';
  const measure = useMeasure({
    active: measuring,
    geometry: measuring ? profileMeasureGeometry([profile.geometry, ghost], { origin: true }) : null,
    tolerance: view ? 10 / view.scale : 0,
    resetKey: profile.id,
  });

  const finishLine = (closed = false) => {
    if (picks.length < (closed ? 3 : 2)) return;
    let next = profile;
    const newIds = new Map();
    const ids = [];
    for (const pick of picks) {
      if (pick.id === null && !newIds.has(pick)) {
        const id = nextPointId(next);
        newIds.set(pick, id);
        next = addProfilePoint(next, pick.xy, id);
        if (next === null) break;
      }
      ids.push(pick.id ?? newIds.get(pick));
    }
    onApply(next && addProfileLoop(next, ids, closed), LINE_FAILURE);
    setPicks([]);
  };

  useImperativeHandle(ref, () => ({
    cancelLine() {
      if (!picks.length) return false;
      setPicks([]);
      onMessage(null);
      return true;
    },
    finishLine,
    measureEscape: () => measure.escape(),
  }));

  useEffect(() => {
    setPicks([]);
    setDragPreview(null);
    setSelectionBox(null);
    gestureRef.current = null;
  }, [tool]);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) return;
    if (fittedRef.current && fittedRef.current.fitSignal === fitSignal && fittedRef.current.topGap === profile.topGap) return;
    fittedRef.current = { fitSignal, topGap: profile.topGap };
    const baseTop = baseTopHeight(profile);
    const fitProfile = baseTop === null ? profile : { ...profile, geometry: { ...profile.geometry,
      points: { ...profile.geometry.points, [nextPointId(profile)]: [0, baseTop] },
    } };
    setView(fitView(fitProfile, size.width, size.height));
  }, [profile, size, fitSignal]);

  useEffect(() => {
    const container = containerRef.current;
    const onWheel = (event) => {
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const screen = [event.clientX - rect.left, event.clientY - rect.top];
      setCursor(screen);
      setView((current) => current && zoomAt(current, size, screen, event.deltaY < 0 ? 1.15 : 1 / 1.15));
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [size]);

  const screenPosition = (event) => {
    const rect = containerRef.current.getBoundingClientRect();
    const screen = [event.clientX - rect.left, event.clientY - rect.top];
    setCursor(screen[0] >= 0 && screen[0] <= size.width && screen[1] >= 0 && screen[1] <= size.height ? screen : null);
    return screen;
  };

  const movePointer = (event) => {
    const screen = screenPosition(event);
    const gesture = gestureRef.current;
    if (measuring && view && !gesture?.panning) measure.move(modelPoint(view, size, screen), event.shiftKey);
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (gesture.box) {
      if (Math.hypot(dx, dy) > 3) gesture.dragging = true;
      if (gesture.dragging) {
        const start = gesture.screen;
        setSelectionBox({ x: Math.min(start[0], screen[0]), y: Math.min(start[1], screen[1]),
          width: Math.abs(dx), height: Math.abs(dy) });
      }
      return;
    }
    if (gesture.button === 0 && gesture.tool === 'select' && gesture.selection?.kind === 'point') {
      if (Math.hypot(dx, dy) > 3) gesture.dragging = true;
      if (gesture.dragging) {
        const id = gesture.selection.id;
        const snap = snapProfilePoint(gesture.start, toModel(gesture.view, size, screen), {
          grid, reach: 8 / gesture.view.scale, exclude: gesture.group ?? id,
        });
        const start = gesture.start.geometry.points[id];
        gesture.lastPreview = (gesture.group
          ? moveProfilePoints(gesture.start, gesture.group, snap.xy.map((value, i) => value - start[i]))
          : moveProfilePoint(gesture.start, id, snap.xy)) ?? gesture.lastPreview;
        setDragPreview({ profile: gesture.lastPreview, snapId: snap.id });
      }
      return;
    }
    if (gesture.button === 0 && gesture.tool === 'select' && gesture.selection !== null) return;
    if (Math.hypot(dx, dy) > 3) gesture.panning = true;
    if (gesture.panning) {
      setView({ ...gesture.view,
        cx: gesture.view.cx - dx / gesture.view.scale,
        cy: gesture.view.cy + dy / gesture.view.scale });
    }
  };

  const origin = view ? toScreen(view, size, [0, 0]) : [0, 0];
  const cursorModel = view && cursor ? toModel(view, size, cursor).map((value) => Math.round(value * 64) / 64) : null;
  const drawnProfile = dragPreview?.profile ?? profile;
  const ghostProfile = ghost ? { ...profile, geometry: ghost, drawnPoints: { elevation: [] } } : null;
  const axes = PROFILE_KINDS[drawnProfile.kind]?.axes ?? 'free';
  const stretchY = view && drawnProfile.stretch ? toScreen(view, size, [0, drawnProfile.stretch.y])[1] : null;
  const baseTop = baseTopHeight(drawnProfile);
  const baseTopY = view && baseTop !== null ? toScreen(view, size, [0, baseTop])[1] : null;
  const originText = PROFILE_KINDS[drawnProfile.kind]?.origin ?? null;
  const hover = (tool === 'line' || drawingShape) && view && cursor
    ? snapProfilePoint(profile, toModel(view, size, cursor), { grid, reach: 8 / view.scale }) : null;
  const hoverScreen = hover && toScreen(view, size, hover.xy);
  const pickScreens = view ? picks.map((pick) => toScreen(view, size, pick.xy)) : [];
  const snapPoint = dragPreview?.snapId && drawnProfile.geometry.points[dragPreview.snapId];
  const snapScreen = snapPoint && view && toScreen(view, size, snapPoint);

  const finishCircle = (radius) => {
    const next = addCircleLoop(profile, picks[0].xy, radius);
    if (!onApply(next, 'A circle needs a radius greater than 1/256 inch.')) return false;
    setPicks([]);
    return true;
  };

  const pickShapePoint = (screen) => {
    const snap = snapProfilePoint(profile, toModel(view, size, screen), { grid, reach: 8 / view.scale });
    if (!picks.length) {
      setPicks([snap]);
      onMessage(null);
    } else if (tool === 'rect') {
      onApply(addRectangleLoop(profile, picks[0].xy, snap.xy), 'A rectangle needs a width and a height.');
      setPicks([]);
    } else {
      finishCircle(Math.hypot(snap.xy[0] - picks[0].xy[0], snap.xy[1] - picks[0].xy[1]));
    }
  };

  const pickPoint = (screen) => {
    if (picks.length >= 3) {
      const first = toScreen(view, size, picks[0].xy);
      if (Math.hypot(screen[0] - first[0], screen[1] - first[1]) <= 8) {
        finishLine(true);
        return;
      }
    }
    const snap = snapProfilePoint(profile, toModel(view, size, screen), { grid, reach: 8 / view.scale });
    if (picks.length && sameXY(picks.at(-1).xy, snap.xy)) return;
    const pick = snap.id === null ? picks.find((entry) => entry.id === null && sameXY(entry.xy, snap.xy)) : null;
    setPicks([...picks, pick ?? snap]);
    onMessage(null);
  };

  const cancelGesture = () => {
    gestureRef.current = null;
    setDragPreview(null);
    setSelectionBox(null);
  };

  const elevationSet = new Set(profileDrawnIn(drawnProfile, 'elevation'));
  const planSet = new Set(profileDrawnIn(drawnProfile, 'plan'));

  return (
    <div ref={containerRef} className="relative h-full w-full select-none">
      <svg
        className="absolute inset-0 h-full w-full touch-none"
        aria-label={`${profile.name} profile editor`}
        onPointerDown={(event) => {
          if (!view || gestureRef.current || (event.button !== 0 && event.button !== 1)) return;
          event.preventDefault();
          const screen = screenPosition(event);
          const hit = hitSelection(event.target);
          const group = hit?.kind === 'point' && selection?.kind === 'points' && selection.ids.includes(hit.id)
            ? selection.ids : null;
          gestureRef.current = { pointerId: event.pointerId, button: event.button,
            x: event.clientX, y: event.clientY, view, selection: hit, panning: event.button === 1,
            tool, start: profile, lastPreview: profile, dragging: false, group, initialSelection: selection,
            shift: event.shiftKey, box: event.button === 0 && tool === 'select' && event.shiftKey && hit === null,
            screen };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={movePointer}
        onPointerUp={(event) => {
          const gesture = gestureRef.current;
          if (!gesture || gesture.pointerId !== event.pointerId) return;
          movePointer(event);
          gestureRef.current = null;
          setDragPreview(null);
          setSelectionBox(null);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          if (gesture.button !== 0 || gesture.panning) return;
          if (gesture.tool === 'measure') {
            measure.click(modelPoint(gesture.view, size, screenPosition(event)), event.shiftKey);
          } else if (gesture.tool === 'line') {
            pickPoint(screenPosition(event));
          } else if (gesture.tool === 'rect' || gesture.tool === 'circle') {
            pickShapePoint(screenPosition(event));
          } else {
            if (gesture.box && gesture.dragging) {
              const end = toModel(gesture.view, size, screenPosition(event));
              const start = toModel(gesture.view, size, gesture.screen);
              const ids = Object.entries(gesture.start.geometry.points).filter(([, xy]) => xy.every((value, i) =>
                value >= Math.min(start[i], end[i]) && value <= Math.max(start[i], end[i]))).map(([id]) => id);
              onSelect(pointSelection([...selectedPointIds(gesture.initialSelection), ...ids]));
            } else if (!gesture.dragging && gesture.shift && gesture.selection?.kind === 'point') {
              onSelect(togglePointSelection(gesture.initialSelection, gesture.selection.id));
            } else {
              onSelect(gesture.group ? pointSelection(gesture.group) : gesture.selection);
            }
            if (gesture.dragging && JSON.stringify(gesture.lastPreview) !== JSON.stringify(gesture.start)) {
              onApply(gesture.lastPreview);
            }
          }
        }}
        onDoubleClick={(event) => {
          if (tool === 'line' && event.button === 0) {
            event.preventDefault();
            finishLine();
          }
        }}
        onPointerCancel={() => { cancelGesture(); setCursor(null); }}
        onLostPointerCapture={cancelGesture}
        onPointerLeave={() => { setCursor(null); if (measuring) measure.leave(); }}
        onContextMenu={(event) => {
          if (!measuring) return;
          event.preventDefault();
          measure.cancelFirst();
        }}
      >
        {view && (
          <>
            <g pointerEvents="none">
              {bands.map(({ dir, from, to, problem }, index) => {
                const vertical = dir === 'vertical';
                const start = toScreen(view, size, vertical ? [from, 0] : [0, to]);
                const length = (to - from) * view.scale;
                return <rect key={index} aria-label={`${vertical ? 'Vertical' : 'Horizontal'} stretch band`}
                  x={vertical ? start[0] : 0} y={vertical ? 0 : start[1]}
                  width={vertical ? length : size.width} height={vertical ? size.height : length}
                  fill={problem ? '#f87171' : '#fbbf24'} fillOpacity={0.18} />;
              })}
            </g>
            <g pointerEvents="none" fill="none">
              {grid * view.scale >= 8 && <path d={gridScreenPath(view, size, grid)} stroke="#1f2937" />}
              {view.scale >= 8 && <path d={gridScreenPath(view, size, 1)} stroke="#374151" />}
              <path d={`M 0 ${origin[1]} H ${size.width} M ${origin[0]} 0 V ${size.height}`} stroke="#6b7280" strokeWidth={1.5} />
              <g fill="#6b7280" fontSize={10}>
                <text x={6} y={origin[1] - 5}>{axes === 'door' ? 'face (y = 0)' : 'y = 0'}</text>
                <text x={origin[0] + 5} y={12}>x = 0</text>
              </g>
            </g>
            {ghostProfile && (
              <g pointerEvents="none" className="text-gray-400">
                {ghostProfile.geometry.loops.map((loop) => (
                  <path key={loop.id} d={loopScreenPath(ghostProfile, loop, view, size)} fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeOpacity={0.4} strokeWidth={1} />
                ))}
              </g>
            )}
            {drawnProfile.geometry.loops.map((loop) => (
              <g key={loop.id}>
                {loop.closed && <path d={loopScreenPath(drawnProfile, loop, view, size)} fill="currentColor" fillOpacity={0.08} fillRule="evenodd" stroke="none" className="text-gray-200" pointerEvents="none" />}
                {loop.segs.map((seg, index) => {
                  const selected = selection?.kind === 'segment' && selection.loopId === loop.id && selection.index === index;
                  const path = segmentScreenPath(drawnProfile, seg, view, size);
                  return (
                    <g key={index}>
                      <path d={path} stroke={selected ? '#60a5fa' : '#e5e7eb'} strokeWidth={selected ? 2.5 : 1.5} fill="none" pointerEvents="none" />
                      <path d={path} stroke="transparent" strokeWidth={12} fill="none" pointerEvents="stroke" data-loop-id={loop.id} data-segment-index={index} />
                    </g>
                  );
                })}
              </g>
            ))}
            {stretchY !== null && (
              <line x1={0} y1={stretchY} x2={size.width} y2={stretchY} stroke={stretchLineProblem(drawnProfile) ? '#f87171' : '#fbbf24'} strokeWidth={1.5} strokeDasharray="6 4" pointerEvents="none" aria-label="Stretch line" />
            )}
            {baseTopY !== null && (
              <line x1={0} y1={baseTopY} x2={size.width} y2={baseTopY} stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="6 4" pointerEvents="none" aria-label="Base top line" />
            )}
            {Object.entries(drawnProfile.geometry.points).map(([id, point]) => {
              const [x, y] = toScreen(view, size, point);
              return (
                <g key={id}>
                  {(elevationSet.has(id) || planSet.has(id)) && (
                    <circle cx={x} cy={y} r={7.5} fill="none" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray={elevationSet.has(id) ? undefined : '3 2'} pointerEvents="none" />
                  )}
                  <circle cx={x} cy={y} r={4} fill={selectedPointIds(selection).includes(id) ? '#3b82f6' : '#111827'} stroke="#e5e7eb" pointerEvents="none" />
                  <circle cx={x} cy={y} r={8} fill="transparent" data-point-id={id} />
                  <text x={x + 7} y={y - 7} fontSize={11} fill="#9ca3af" pointerEvents="none">{id}</text>
                </g>
              );
            })}
            {selectionBox && <rect aria-label="Point selection box" {...selectionBox} fill="#3b82f6" fillOpacity={0.1}
              stroke="#60a5fa" strokeDasharray="4 3" pointerEvents="none" />}
            <g pointerEvents="none" stroke="#4ade80" fill="none">
              {snapScreen && <circle cx={snapScreen[0]} cy={snapScreen[1]} r={9} />}
              {drawingShape && pickScreens.length > 0 && hoverScreen && (tool === 'rect'
                ? <rect x={Math.min(pickScreens[0][0], hoverScreen[0])} y={Math.min(pickScreens[0][1], hoverScreen[1])}
                  width={Math.abs(hoverScreen[0] - pickScreens[0][0])} height={Math.abs(hoverScreen[0][1] - pickScreens[0][1])} strokeDasharray="4 3" />
                : <circle cx={pickScreens[0][0]} cy={pickScreens[0][1]}
                  r={Math.hypot(hoverScreen[0] - pickScreens[0][0], hoverScreen[1] - pickScreens[0][1])} strokeDasharray="4 3" />)}
              {pickScreens.length > 1 && <polyline points={pickScreens.map((point) => point.join(',')).join(' ')} />}
              {pickScreens.map(([x, y], index) => <circle key={index} cx={x} cy={y} r={3} fill="#4ade80" />)}
              {hoverScreen && (
                <>
                  {pickScreens.length > 0 && <line x1={pickScreens.at(-1)[0]} y1={pickScreens.at(-1)[1]} x2={hoverScreen[0]} y2={hoverScreen[1]} strokeDasharray="4 3" />}
                  <path d={`M ${hoverScreen[0] - 5} ${hoverScreen[1]} h 10 M ${hoverScreen[0]} ${hoverScreen[1] - 5} v 10`} />
                </>
              )}
            </g>
            {measuring && (
              <MeasureSvg first={measure.first} hover={measure.hover} measures={measure.measures} preview={measure.preview}
                toScreen={({ x, y }) => { const [sx, sy] = toScreen(view, size, [x, y]); return { x: sx, y: sy }; }} />
            )}
          </>
        )}
      </svg>
      {measuring && (
        <MeasureReadout result={measure.preview ?? measure.measures.at(-1)?.result} axisLabels={{ x: 'X', y: 'Y' }}
          hover={measure.hover} hint={MEASURE_HINT} className="bottom-10 left-2" />
      )}
      {tool === 'circle' && picks.length > 0 && (
        <label className="absolute bottom-10 left-2 flex items-center gap-2 rounded bg-gray-800 px-2 py-1 text-xs text-gray-300">
          Radius
          <CoordInput aria-label="Circle radius" value={0} onCommit={finishCircle} className="max-w-28" />
        </label>
      )}
      <div className="pointer-events-none absolute right-2 top-2 rounded bg-gray-800/80 px-2 py-1 text-xs text-gray-300">
        <div>{axes === 'door' ? "Door profile · face on top · x → toward the door's middle · y ↓ into the door"
          : axes === 'run' ? 'Run molding · x → out from the box · y ↑ up' : 'Other · x → · y ↑'}</div>
        {originText && <div>0, 0 = {originText}</div>}
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-gray-800/80 px-2 py-1 font-mono text-xs text-gray-300">
        {cursorModel && `x ${formatProfileCoord(cursorModel[0])} · y ${formatProfileCoord(cursorModel[1])}`}
      </div>
      {(elevationSet.size > 0 || planSet.size > 0) && (
        <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-gray-800/80 px-2 py-1 text-xs text-gray-300">
          ○ drawn (solid: elevation, dashed: plan only)
        </div>
      )}
    </div>
  );
});
