import { useCallback, useEffect, useState } from 'react';
import { runItems } from '../../model/grid.js';
import { setDividerPosition } from '../../model/interiorTree.js';
import { setItemWidth, setItemInterior, setTrackSize } from '../../store/elevationSlice.js';

export default function useInlineEdits({
  room, wall, wallId, tool, doorsOff, selection, interiors, dispatch, closePicker, suppressNextClick,
}) {
  const [trackEdit, setTrackEdit] = useState(null);
  const [dividerEdit, setDividerEdit] = useState(null);

  const editTrack = useCallback((runId, edit) => setTrackEdit({ ...edit, runId }), []);
  const editPieceSegment = useCallback((segment, point) => {
    // A cell of a column holding a void (FX3) edits its nested column track.
    if (segment.runId && segment.trackId) {
      setTrackEdit({
        runId: segment.runId, trackId: segment.trackId, label: 'Width', value: segment.end - segment.start, x: point.x, y: point.y,
      });
      return;
    }
    if (!segment.runId || !segment.pieceId
      || segment.pieceId.startsWith(`${segment.runId}:`)) return;
    setTrackEdit({
      runId: segment.runId,
      itemId: segment.pieceId,
      label: 'Width',
      value: segment.end - segment.start,
      x: point.x,
      y: point.y,
    });
  }, []);
  const commitTrackEdit = useCallback((size) => {
    if (trackEdit && wall) {
      dispatch(trackEdit.trackId
        ? setTrackSize({
          wallId: wall.id,
          runId: trackEdit.runId,
          trackId: trackEdit.trackId,
          size,
        })
        : setItemWidth({
          wallId: wall.id,
          runId: trackEdit.runId,
          itemId: trackEdit.itemId,
          width: size,
        }));
    }
    setTrackEdit(null);
  }, [dispatch, trackEdit, wall]);

  const commitDividerEdit = useCallback((edit, value) => {
    if (!wall || !room || tool !== 'select' || !doorsOff) return;
    const run = wall.runs.find((candidate) => candidate.id === edit.runId);
    const item = run && runItems(run).find((candidate) => candidate.id === edit.itemId);
    const entry = interiors.find((candidate) => candidate.runId === edit.runId && candidate.itemId === edit.itemId);
    if (!item || !entry) return;
    dispatch(setItemInterior({
      roomId: room.id,
      wallId: wall.id,
      runId: run.id,
      itemIds: [item.id],
      interior: setDividerPosition(entry.tree, edit.path, edit.index, value,
        edit.side === 'bottom' ? undefined : edit.side),
    }));
    setDividerEdit(null);
  }, [dispatch, doorsOff, interiors, room, tool, wall]);

  const moveDivider = useCallback((edit, value) => {
    suppressNextClick();
    closePicker();
    commitDividerEdit(edit, value);
  }, [closePicker, commitDividerEdit, suppressNextClick]);

  useEffect(() => {
    setDividerEdit(null);
  }, [doorsOff, room?.id, wallId, wall?.side, selection.runId, selection.pieceId, tool]);

  return {
    trackEdit, setTrackEdit, dividerEdit, setDividerEdit, editTrack, editPieceSegment,
    commitTrackEdit, commitDividerEdit, moveDivider,
  };
}
