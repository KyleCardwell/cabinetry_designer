import { useEffect, useRef, useState } from 'react';
import { formatProfileCoord } from '../../elevation/model/profileEditing.js';
import { fitView, loopScreenPath, segmentScreenPath, toModel, toScreen, zoomAt } from './profileView.js';

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

export default function ProfileCanvas({ profile, grid, selection, onSelect, fitSignal }) {
  const containerRef = useRef(null);
  const fittedRef = useRef(null);
  const gestureRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState(null);
  const [cursor, setCursor] = useState(null);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) return;
    if (fittedRef.current && fittedRef.current.fitSignal === fitSignal) return;
    fittedRef.current = { fitSignal };
    setView(fitView(profile, size.width, size.height));
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
    screenPosition(event);
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (gesture.button === 0 && gesture.selection !== null) return;
    if (Math.hypot(dx, dy) > 3) gesture.panning = true;
    if (gesture.panning) {
      setView({ ...gesture.view,
        cx: gesture.view.cx - dx / gesture.view.scale,
        cy: gesture.view.cy + dy / gesture.view.scale });
    }
  };

  const origin = view ? toScreen(view, size, [0, 0]) : [0, 0];
  const cursorModel = view && cursor ? toModel(view, size, cursor).map((value) => Math.round(value * 64) / 64) : null;

  return (
    <div ref={containerRef} className="relative h-full w-full select-none">
      <svg
        className="absolute inset-0 h-full w-full touch-none"
        aria-label={`${profile.name} profile editor`}
        onPointerDown={(event) => {
          if (!view || gestureRef.current || (event.button !== 0 && event.button !== 1)) return;
          event.preventDefault();
          screenPosition(event);
          const hit = hitSelection(event.target);
          gestureRef.current = { pointerId: event.pointerId, button: event.button,
            x: event.clientX, y: event.clientY, view, selection: hit, panning: event.button === 1 };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={movePointer}
        onPointerUp={(event) => {
          const gesture = gestureRef.current;
          if (!gesture || gesture.pointerId !== event.pointerId) return;
          movePointer(event);
          gestureRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          if (gesture.button === 0 && !gesture.panning) onSelect(gesture.selection);
        }}
        onPointerCancel={() => { gestureRef.current = null; setCursor(null); }}
        onLostPointerCapture={() => { gestureRef.current = null; }}
        onPointerLeave={() => setCursor(null)}
      >
        {view && (
          <>
            <g pointerEvents="none" fill="none">
              {grid * view.scale >= 8 && <path d={gridScreenPath(view, size, grid)} stroke="#1f2937" />}
              {view.scale >= 8 && <path d={gridScreenPath(view, size, 1)} stroke="#374151" />}
              <path d={`M 0 ${origin[1]} H ${size.width} M ${origin[0]} 0 V ${size.height}`} stroke="#6b7280" strokeWidth={1.5} />
              <g fill="#6b7280" fontSize={10}>
                <text x={6} y={origin[1] - 5}>face (y = 0)</text>
                <text x={origin[0] + 5} y={12}>x = 0</text>
              </g>
            </g>
            {profile.geometry.loops.map((loop) => (
              <g key={loop.id}>
                {loop.closed && <path d={loopScreenPath(profile, loop, view, size)} fill="currentColor" fillOpacity={0.08} fillRule="evenodd" stroke="none" className="text-gray-200" pointerEvents="none" />}
                {loop.segs.map((seg, index) => {
                  const selected = selection?.kind === 'segment' && selection.loopId === loop.id && selection.index === index;
                  const path = segmentScreenPath(profile, seg, view, size);
                  return (
                    <g key={index}>
                      <path d={path} stroke={selected ? '#60a5fa' : '#e5e7eb'} strokeWidth={selected ? 2.5 : 1.5} fill="none" pointerEvents="none" />
                      <path d={path} stroke="transparent" strokeWidth={12} fill="none" pointerEvents="stroke" data-loop-id={loop.id} data-segment-index={index} />
                    </g>
                  );
                })}
              </g>
            ))}
            {Object.entries(profile.geometry.points).map(([id, point]) => {
              const [x, y] = toScreen(view, size, point);
              return (
                <g key={id}>
                  <circle cx={x} cy={y} r={4} fill={selection?.kind === 'point' && selection.id === id ? '#3b82f6' : '#111827'} stroke="#e5e7eb" pointerEvents="none" />
                  <circle cx={x} cy={y} r={8} fill="transparent" data-point-id={id} />
                  <text x={x + 7} y={y - 7} fontSize={11} fill="#9ca3af" pointerEvents="none">{id}</text>
                </g>
              );
            })}
          </>
        )}
      </svg>
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-gray-800/80 px-2 py-1 font-mono text-xs text-gray-300">
        {cursorModel && `x ${formatProfileCoord(cursorModel[0])} · y ${formatProfileCoord(cursorModel[1])}`}
      </div>
    </div>
  );
}
