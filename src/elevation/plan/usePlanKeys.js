/* eslint-disable react-hooks/exhaustive-deps -- Preserve the original dependency lists.
 * Passed setters and refs retain their stable identities.
 */
import { useEffect } from 'react';
import {
  clearSelection,
  deleteOpening,
  deleteRun,
  deleteWall,
  setTool,
} from '../store/elevationSlice.js';

export default function usePlanKeys({
  entry,
  cancelEntry,
  drawStartRef,
  cancelDrawing,
  dispatch,
  setPendingDeleteWallId,
  selection,
  walls,
  selectedWall,
}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      const tagName = event.target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') return;
      if (globalThis.document?.querySelector('[aria-modal="true"]')) return;

      if (event.key === 'Escape') {
        if (entry) {
          event.preventDefault();
          cancelEntry();
          return;
        }
        if (drawStartRef.current) cancelDrawing();
        dispatch(setTool('select'));
        dispatch(clearSelection());
        setPendingDeleteWallId(null);
        return;
      }

      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (selection.openingId) {
        const openingWall = walls.find((wall) => (
          (wall.openings ?? []).some((opening) => opening.id === selection.openingId)
        ));
        if (!openingWall) return;
        event.preventDefault();
        dispatch(deleteOpening({
          wallId: openingWall.id,
          openingId: selection.openingId,
        }));
        return;
      }
      if (selection.runId) {
        const runWall = walls.find((wall) => wall.runs.some((run) => run.id === selection.runId));
        if (!runWall) return;
        event.preventDefault();
        dispatch(deleteRun({ wallId: runWall.id, runId: selection.runId }));
        return;
      }
      if (!selectedWall) return;
      event.preventDefault();
      if (selectedWall.runs.length > 0) {
        setPendingDeleteWallId(selectedWall.id);
      } else {
        dispatch(deleteWall(selectedWall.id));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cancelDrawing, cancelEntry, dispatch, entry, selectedWall, selection.openingId,
    selection.runId, walls]);

}
