/* eslint-disable react-hooks/exhaustive-deps -- Preserve the original dependency lists.
 * Passed setters and refs retain their stable identities.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const PIXELS_PER_INCH = 4;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 30;

function clampZoom(zoom) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

export default function usePlanView({ containerRef, stageRef, walls, activeRoomId, fitRequest }) {
  const fittedRoomRef = useRef(null);
  const handledFitRequestRef = useRef(fitRequest);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const scale = zoom * PIXELS_PER_INCH;

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

    updateSize(container.getBoundingClientRect());
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) updateSize(entries[0].contentRect);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const zoomToFit = useCallback(() => {
    if (viewport.width <= 0 || viewport.height <= 0) return;
    if (walls.length === 0) {
      setZoom(1);
      setFitZoom(1);
      setPan({ x: viewport.width / 2, y: viewport.height / 2 });
      return;
    }

    const xs = walls.flatMap((wall) => [wall.x1, wall.x2]);
    const ys = walls.flatMap((wall) => [wall.y1, wall.y2]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const padding = 96;
    const availableWidth = Math.max(1, viewport.width - padding);
    const availableHeight = Math.max(1, viewport.height - padding);
    const fitScale = Math.min(
      availableWidth / Math.max(1, maxX - minX),
      availableHeight / Math.max(1, maxY - minY),
    );
    const nextZoom = clampZoom(fitScale / PIXELS_PER_INCH);
    const nextScale = nextZoom * PIXELS_PER_INCH;
    setZoom(nextZoom);
    setFitZoom(nextZoom);
    setPan({
      x: viewport.width / 2 - ((minX + maxX) / 2) * nextScale,
      y: viewport.height / 2 - ((minY + maxY) / 2) * nextScale,
    });
  }, [viewport, walls]);

  useEffect(() => {
    if (viewport.width <= 0 || viewport.height <= 0) return;
    if (fittedRoomRef.current !== activeRoomId) {
      fittedRoomRef.current = activeRoomId;
      zoomToFit();
    }
  }, [activeRoomId, viewport, zoomToFit]);

  useEffect(() => {
    if (fitRequest === handledFitRequestRef.current) return;
    handledFitRequestRef.current = fitRequest;
    zoomToFit();
  }, [fitRequest, zoomToFit]);

  const toWorld = useCallback((point) => ({
    x: (point.x - pan.x) / scale,
    y: (point.y - pan.y) / scale,
  }), [pan, scale]);

  const handleWheel = useCallback((event) => {
    event.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    let direction = event.evt.deltaY < 0 ? 1 : -1;
    if (event.evt.ctrlKey) direction = -direction;
    const nextZoom = clampZoom(direction > 0 ? zoom * 1.04 : zoom / 1.04);
    if (nextZoom === zoom) return;
    const worldUnderPointer = toWorld(pointer);
    const nextScale = nextZoom * PIXELS_PER_INCH;
    setZoom(nextZoom);
    setPan({
      x: pointer.x - worldUnderPointer.x * nextScale,
      y: pointer.y - worldUnderPointer.y * nextScale,
    });
  }, [toWorld, zoom]);

  return { viewport, zoom, fitZoom, pan, setPan, scale, toWorld, handleWheel };
}
