import { useEffect } from 'react';
import { runItems } from '../../model/grid.js';
import { findLeaf } from '../../model/cellTree.js';
import { nextWallId } from '../../model/topology.js';
import {
  deleteOpening,
  deleteRecess,
  deleteRun,
  deleteSoffit,
  removeCell,
  removeItem,
  setActiveWall,
  setFacePath,
  setSelection,
  setTool,
} from '../../store/elevationSlice.js';

export default function useElevationKeys({
  cancelDrag,
  cancelEntry,
  cursor,
  dispatch,
  dragRef,
  entry,
  facePath,
  resetView,
  room,
  selectionRef,
  setAlignmentGuides,
  setStretchPreview,
  stretchPreview,
  tool,
  wallRef,
  zoomIn,
  zoomOut,
}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      const tagName = event.target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') return;

      if (event.key === 'Escape') {
        cursor.releaseHold();
        if (entry) {
          event.preventDefault();
          cancelEntry();
          return;
        }
        if (tool !== 'select') {
          if (dragRef.current) cancelDrag();
          setAlignmentGuides([]);
          dispatch(setTool('select'));
          dispatch(setSelection({}));
          return;
        }
        setAlignmentGuides([]);
        if (dragRef.current) cancelDrag();
        else if (stretchPreview) setStretchPreview(null);
        else if (facePath) dispatch(setFacePath(null));
        else dispatch(setSelection({}));
        return;
      }

      if (event.key === '[' || event.key === ']') {
        const currentWall = wallRef.current;
        const targetWallId = nextWallId(room, currentWall?.id, event.key === '[' ? -1 : 1);
        if (targetWallId && targetWallId !== currentWall?.id) {
          event.preventDefault();
          dispatch(setActiveWall(targetWallId));
        }
        return;
      }

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomIn();
        return;
      }
      if (event.key === '-') {
        event.preventDefault();
        zoomOut();
        return;
      }
      if (event.key === '0') {
        event.preventDefault();
        resetView();
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;

      const currentSelection = selectionRef.current;
      const currentWall = wallRef.current;
      if (!currentWall) return;
      if (currentSelection.openingId) {
        const selectedOpening = (currentWall.openings ?? []).find(
          (opening) => opening.id === currentSelection.openingId,
        );
        if (!selectedOpening) return;
        event.preventDefault();
        dispatch(deleteOpening({
          wallId: currentWall.id,
          openingId: selectedOpening.id,
        }));
        return;
      }
      if (currentSelection.recessId) {
        event.preventDefault();
        dispatch(deleteRecess({ wallId: currentWall.id, recessId: currentSelection.recessId }));
        return;
      }
      if (currentSelection.soffitId) {
        const selectedSoffit = (currentWall.soffits ?? []).find(
          (soffit) => soffit.id === currentSelection.soffitId,
        );
        if (!selectedSoffit) return;
        event.preventDefault();
        dispatch(deleteSoffit({
          wallId: currentWall.id,
          soffitId: selectedSoffit.id,
        }));
        return;
      }
      if (!currentSelection.runId) return;
      const selectedRun = currentWall.runs.find(
        (run) => run.id === currentSelection.runId,
      );
      if (!selectedRun) return;

      if (currentSelection.pieceId) {
        const selectedItem = runItems(selectedRun).find(
          (item) => item.id === currentSelection.pieceId,
        );
        if (!selectedItem) {
          if (findLeaf(selectedRun.grid, currentSelection.pieceId)) {
            event.preventDefault();
            dispatch(removeCell({
              wallId: currentWall.id,
              runId: selectedRun.id,
              cellId: currentSelection.pieceId,
            }));
          }
          return;
        }
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
  }, [
    cancelDrag,
    cancelEntry,
    cursor,
    dispatch,
    entry,
    facePath,
    resetView,
    room,
    stretchPreview,
    tool,
    zoomIn,
    zoomOut,
  ]);

}
