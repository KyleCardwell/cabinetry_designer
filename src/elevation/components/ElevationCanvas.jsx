import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Layer, Rect, Stage } from 'react-konva';
import { fitWallToViewport } from '../canvas/transform.js';
import {
  dragPointsToRunInput,
  screenPointToWallSnapped,
} from '../canvas/drag.js';
import { createRun } from '../model/runDefaults.js';
import { resolveProfile } from '../model/profile.js';
import { roomDiagnostics, tryPlaceRun } from '../model/room.js';
import {
  addRun,
  clearSelection,
  deleteRun,
  removeItem,
  setMessage,
  setSelection,
  setTool,
} from '../store/elevationSlice.js';
import DragPreview from './DragPreview.jsx';
import RunGroup from './RunGroup.jsx';
import WallFrame from './WallFrame.jsx';

export default function ElevationCanvas({ room, wall, settings, fitRequest = 0 }) {
  const dispatch = useDispatch();
  const { tool, selection } = useSelector((state) => state.elevation);
  const containerRef = useRef(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const selectionRef = useRef(selection);
  const wallRef = useRef(wall);
  const messageTimeoutRef = useRef(null);
  const clickSuppressionTimeoutRef = useRef(null);
  const suppressClickRef = useRef(false);
  const wallId = wall?.id ?? null;
  const diagnostics = useMemo(
    () => (room ? roomDiagnostics(room, settings) : {}),
    [room, settings],
  );
  const profile = useMemo(
    () => (room && wall ? resolveProfile(settings, room, wall) : null),
    [room, settings, wall],
  );

  selectionRef.current = selection;
  wallRef.current = wall;

  const updateDrag = useCallback((nextDrag) => {
    dragRef.current = nextDrag;
    setDrag(nextDrag);
  }, []);

  const cancelDrag = useCallback(() => updateDrag(null), [updateDrag]);

  const showMessage = useCallback((message) => {
    dispatch(setMessage(message));
    if (messageTimeoutRef.current !== null) {
      globalThis.clearTimeout(messageTimeoutRef.current);
    }
    messageTimeoutRef.current = globalThis.setTimeout(() => {
      dispatch(setMessage(null));
      messageTimeoutRef.current = null;
    }, 3000);
  }, [dispatch]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateSize = ({ width, height }) => {
      const next = {
        width: Math.max(0, Math.floor(width)),
        height: Math.max(0, Math.floor(height)),
      };
      setViewport((current) => (
        current.width === next.width && current.height === next.height ? current : next
      ));
    };

    const initial = container.getBoundingClientRect();
    updateSize(initial);

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) updateSize(entries[0].contentRect);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    cancelDrag();
    dispatch(clearSelection());
  }, [cancelDrag, dispatch, wallId]);

  useEffect(() => {
    if (tool !== 'draw') cancelDrag();
  }, [cancelDrag, tool]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (dragRef.current) cancelDrag();
        else dispatch(clearSelection());
        return;
      }

      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const tagName = event.target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') return;

      const currentSelection = selectionRef.current;
      const currentWall = wallRef.current;
      if (!currentWall || !currentSelection.runId) return;
      const selectedRun = currentWall.runs.find(
        (run) => run.id === currentSelection.runId,
      );
      if (!selectedRun) return;

      if (currentSelection.pieceId) {
        const selectedItem = selectedRun.items.find(
          (item) => item.id === currentSelection.pieceId,
        );
        if (!selectedItem) return;
        event.preventDefault();
        dispatch(removeItem({
          wallId: currentWall.id,
          runId: selectedRun.id,
          itemId: selectedItem.id,
        }));
        return;
      }

      event.preventDefault();
      dispatch(deleteRun({ wallId: currentWall.id, runId: selectedRun.id }));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cancelDrag, dispatch]);

  useEffect(() => () => {
    if (messageTimeoutRef.current !== null) {
      globalThis.clearTimeout(messageTimeoutRef.current);
    }
    if (clickSuppressionTimeoutRef.current !== null) {
      globalThis.clearTimeout(clickSuppressionTimeoutRef.current);
    }
    dispatch(setMessage(null));
  }, [dispatch]);

  const transform = useMemo(() => (
    wall && viewport.width > 0 && viewport.height > 0
      ? fitWallToViewport(wall, viewport)
      : null
  ), [fitRequest, viewport, wall]);

  const dragBounds = useMemo(() => (
    drag ? dragPointsToRunInput(drag.start, drag.current) : null
  ), [drag]);

  const wallPointFromEvent = (event) => {
    if (!wall || !transform) return null;
    const pointer = event.target.getStage()?.getPointerPosition();
    return pointer ? screenPointToWallSnapped(pointer, wall, transform) : null;
  };

  const handleMouseDown = (event) => {
    if (tool !== 'draw') return;
    const point = wallPointFromEvent(event);
    if (!point) return;
    dispatch(clearSelection());
    updateDrag({ start: point, current: point });
  };

  const handleMouseMove = (event) => {
    if (!dragRef.current) return;
    const point = wallPointFromEvent(event);
    if (!point) return;
    updateDrag({ ...dragRef.current, current: point });
  };

  const handleMouseUp = (event) => {
    const currentDrag = dragRef.current;
    if (!currentDrag || !wall) return;
    const end = wallPointFromEvent(event) ?? currentDrag.current;
    const bounds = dragPointsToRunInput(currentDrag.start, end);
    cancelDrag();
    if (clickSuppressionTimeoutRef.current !== null) {
      globalThis.clearTimeout(clickSuppressionTimeoutRef.current);
    }
    suppressClickRef.current = true;
    clickSuppressionTimeoutRef.current = globalThis.setTimeout(() => {
      suppressClickRef.current = false;
      clickSuppressionTimeoutRef.current = null;
    }, 0);

    if (bounds.width < settings.minRunWidth) return;

    const run = createRun(bounds, { settings, room, wall });
    const placement = tryPlaceRun(room, wall.id, run, settings);
    if (!placement.ok) {
      showMessage(placement.reason);
      return;
    }

    if (messageTimeoutRef.current !== null) {
      globalThis.clearTimeout(messageTimeoutRef.current);
      messageTimeoutRef.current = null;
    }
    dispatch(setMessage(null));
    dispatch(addRun({ wallId: wall.id, run }));
    dispatch(setTool('select'));
    dispatch(setSelection({ runId: run.id, pieceId: null }));
  };

  const selectRun = useCallback((runId) => {
    if (tool !== 'select' || suppressClickRef.current) return;
    dispatch(setSelection({ runId, pieceId: null }));
  }, [dispatch, tool]);

  const selectPiece = useCallback((runId, pieceId) => {
    if (tool !== 'select' || suppressClickRef.current) return;
    dispatch(setSelection({ runId, pieceId }));
  }, [dispatch, tool]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-gray-900"
      style={{ cursor: tool === 'draw' ? 'crosshair' : 'default' }}
    >
      {!wall && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
          Add a wall to begin.
        </div>
      )}
      {wall && transform && (
        <Stage
          width={viewport.width}
          height={viewport.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={() => {
            if (suppressClickRef.current) return;
            if (tool === 'select') dispatch(clearSelection());
          }}
        >
          <Layer listening={false}>
            <Rect width={viewport.width} height={viewport.height} fill="#111827" />
            <WallFrame
              wall={wall}
              transform={transform}
              crownTop={profile?.crownTop}
            />
          </Layer>
          <Layer>
            {wall.runs.map((run) => (
              <RunGroup
                key={run.id}
                run={run}
                room={room}
                wall={wall}
                settings={settings}
                diagnostic={diagnostics[run.id]}
                transform={transform}
                selectedRun={selection.runId === run.id}
                selectedPieceId={
                  selection.runId === run.id ? selection.pieceId : null
                }
                onSelectRun={selectRun}
                onSelectPiece={selectPiece}
              />
            ))}
          </Layer>
          {dragBounds && (
            <Layer listening={false}>
              <DragPreview bounds={dragBounds} transform={transform} />
            </Layer>
          )}
        </Stage>
      )}
    </div>
  );
}
