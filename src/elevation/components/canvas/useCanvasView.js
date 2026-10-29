import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  DEFAULT_VIEW,
  fitWallToViewport,
  withView,
  zoomViewAt,
} from '../../canvas/transform.js';

export default function useCanvasView({
  containerRef,
  stageRef,
  wall,
  combined,
  activeKey,
  dimensionChains,
}) {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [view, setView] = useState(DEFAULT_VIEW);

  const resetView = useCallback(() => {
    setView(DEFAULT_VIEW);
  }, []);

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

  const baseTransform = useMemo(() => {
    if (!wall || viewport.width <= 0 || viewport.height <= 0) return null;
    // A group's padding stays fixed when the opened face (and its dimension rows) changes.
    const fitted = fitWallToViewport(combined ?? wall, viewport, combined
      ? { top: 96, right: 74, bottom: 152, left: 136 }
      : {
        top: dimensionChains?.upper.inner.length > 0 ? 96 : 64,
        right: 48 + (dimensionChains?.vertical.right.middle.length > 0 ? 26 : 0),
        bottom: dimensionChains?.openings.length > 0 || dimensionChains?.wall.length > 0 ? 152 : 96,
        left: 110 + (dimensionChains?.vertical.left.middle.length > 0 ? 26 : 0),
      });
    if (combined) fitted.offsetX += combined.faces.find((face) => face.key === activeKey).dx * fitted.scale;
    return fitted;
  }, [
    activeKey,
    combined,
    dimensionChains?.openings.length,
    dimensionChains?.wall.length,
    dimensionChains?.upper.inner.length,
    dimensionChains?.vertical.left.middle.length,
    dimensionChains?.vertical.right.middle.length,
    viewport,
    wall,
  ]);
  const transform = useMemo(
    () => (baseTransform ? withView(baseTransform, view) : null),
    [baseTransform, view],
  );

  const zoomAt = useCallback((pointer, factor) => {
    if (!baseTransform) return;
    setView((current) => zoomViewAt(baseTransform, current, pointer, factor));
  }, [baseTransform]);

  const zoomIn = useCallback(() => {
    zoomAt({ x: viewport.width / 2, y: viewport.height / 2 }, 1.08);
  }, [viewport.height, viewport.width, zoomAt]);

  const zoomOut = useCallback(() => {
    zoomAt({ x: viewport.width / 2, y: viewport.height / 2 }, 1 / 1.08);
  }, [viewport.height, viewport.width, zoomAt]);

  const handleWheel = useCallback((event) => {
    event.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    let factor = event.evt.deltaY < 0 ? 1.08 : 1 / 1.08;
    if (event.evt.ctrlKey || event.evt.metaKey) factor = 1 / factor;
    zoomAt(pointer, factor);
  }, [zoomAt]);

  return { viewport, view, setView, resetView, transform, zoomIn, zoomOut, handleWheel };
}
