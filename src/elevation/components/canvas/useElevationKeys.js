import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { runItems } from '../../model/grid.js';
import { findLeaf } from '../../model/cellTree.js';
import { nextWallId } from '../../model/topology.js';
import {
  deleteOpening,
  deleteLayoutLine,
  deleteRecess,
  deleteRun,
  deleteSoffit,
  removeCell,
  removeItem,
  setActiveWall,
  setFacePath,
  setInteriorPath,
  setSelection,
  setTool,
} from '../../store/elevationSlice.js';

export default function useElevationKeys({
  cancelDrag,
  cancelEntry,
  commitEntry,
  cursor,
  dispatch,
  dragRef,
  entry,
  facePath,
  onMeasureEscape = () => false,
  resetView,
  room,
  selectionRef,
  setAlignmentGuides,
  setStretchPreview,
  startMoveMode,
  stretchPreview,
  tool,
  wallRef,
  zoomIn,
  zoomOut,
}) {
  const interiorPath = useSelector((state) => state.elevation.interiorPath);
  useEffect(() => {
    const handleKeyDown = (event) => {
      const tagName = event.target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') return;
      if (globalThis.document?.querySelector('[aria-modal="true"]')) return;

      if (event.key === 'Escape') {
        cursor.releaseHold();
        if (entry) {
          event.preventDefault();
          cancelEntry();
          return;
        }
        if (tool === 'measure' && onMeasureEscape()) {
          event.preventDefault();
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
        else if (interiorPath != null) dispatch(setInteriorPath(null));
        else dispatch(setSelection({}));
        return;
      }

      if (event.key.toLowerCase() === 'd' && !event.ctrlKey && !event.metaKey
        && !event.altKey && !event.repeat && !entry) {
        event.preventDefault();
        dispatch(setTool(tool === 'measure' ? 'select' : 'measure'));
        return;
      }

      if (event.key.toLowerCase() === 'm' && !event.ctrlKey && !event.metaKey
        && !event.altKey && !event.repeat && tool === 'select' && !entry) {
        const runId = selectionRef.current?.runId;
        if (runId) {
          event.preventDefault();
          startMoveMode(runId);
        }
        return;
      }

      if (event.key === 'Enter' && entry?.kind === 'run-move') {
        event.preventDefault();
        commitEntry();
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
      if (currentSelection.lineId) {
        event.preventDefault();
        dispatch(deleteLayoutLine({ wallId: currentWall.id, lineId: currentSelection.lineId }));
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
    commitEntry,
    cursor,
    dispatch,
    entry,
    facePath,
    interiorPath,
    onMeasureEscape,
    resetView,
    room,
    startMoveMode,
    stretchPreview,
    tool,
    zoomIn,
    zoomOut,
  ]);

}
