/* eslint-disable react-hooks/exhaustive-deps -- Preserve the original dependency lists.
 * Passed setters and refs retain their stable identities.
 */
import { useCallback, useEffect } from 'react';
import { panExceedsThreshold } from '../canvas/panGesture.js';

export default function usePlanPan({
  setPan,
  setPointerMode,
  panRef,
  spacePressedRef,
  suppressClickRef,
  clickSuppressionTimeoutRef,
  stageRef,
  tool,
  entry,
}) {
  const stopPanning = useCallback(() => {
    const current = panRef.current;
    panRef.current = null;
    setPointerMode(spacePressedRef.current ? 'pan-ready' : 'idle');
    if (!current?.moved) return;
    suppressClickRef.current = true;
    if (clickSuppressionTimeoutRef.current !== null) {
      globalThis.clearTimeout(clickSuppressionTimeoutRef.current);
    }
    clickSuppressionTimeoutRef.current = globalThis.setTimeout(() => {
      suppressClickRef.current = false;
      clickSuppressionTimeoutRef.current = null;
    }, 0);
  }, []);

  useEffect(() => {
    const handleSpaceDown = (event) => {
      const tagName = event.target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') return;
      if (event.code !== 'Space') return;
      event.preventDefault();
      spacePressedRef.current = true;
      setPointerMode('pan-ready');
    };
    const handleSpaceUp = (event) => {
      if (event.code === 'Space') {
        spacePressedRef.current = false;
        setPointerMode('idle');
      }
    };
    const handleBlur = () => {
      spacePressedRef.current = false;
      setPointerMode('idle');
      stopPanning();
    };
    const handlePointerMove = (event) => {
      const current = panRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (dx === 0 && dy === 0) return;
      const moved = current.moved || panExceedsThreshold(
        { x: current.originX, y: current.originY },
        { x: event.clientX, y: event.clientY },
      );
      if (moved && !current.moved) setPointerMode('panning');
      panRef.current = {
        ...current,
        x: event.clientX,
        y: event.clientY,
        moved,
      };
      if (!moved) return;
      setPan((activePan) => ({ x: activePan.x + dx, y: activePan.y + dy }));
    };
    const handlePointerEnd = (event) => {
      if (panRef.current && event.pointerId === panRef.current.pointerId) stopPanning();
    };
    const handlePointerOut = (event) => {
      if (!event.relatedTarget) stopPanning();
    };

    window.addEventListener('keydown', handleSpaceDown);
    window.addEventListener('keyup', handleSpaceUp);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);
    window.addEventListener('pointerout', handlePointerOut);
    return () => {
      window.removeEventListener('keydown', handleSpaceDown);
      window.removeEventListener('keyup', handleSpaceUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
      window.removeEventListener('pointerout', handlePointerOut);
    };
  }, [stopPanning]);

  const handlePanPointerDown = useCallback((event) => {
    const pointerEvent = event.evt;
    const emptyCanvas = event.target === stageRef.current || tool === 'measure';
    const middleDrag = pointerEvent.button === 1;
    const spaceDrag = pointerEvent.button === 0 && spacePressedRef.current;
    const selectDrag = pointerEvent.button === 0 && tool === 'select';
    if (entry || !emptyCanvas || (!middleDrag && !spaceDrag && !selectDrag)) return;
    pointerEvent.preventDefault();
    panRef.current = {
      pointerId: pointerEvent.pointerId,
      x: pointerEvent.clientX,
      y: pointerEvent.clientY,
      originX: pointerEvent.clientX,
      originY: pointerEvent.clientY,
      moved: false,
    };
  }, [entry, tool]);

  return { stopPanning, handlePanPointerDown };
}
