import { useCallback, useEffect, useState } from 'react';
import { planPickStack } from '../model/planPick.js';
import { clearSelection, setActiveWall, setSelection } from '../store/elevationSlice.js';

/** Plan picks share the elevation list UI, with host walls included in every run/opening stack. */
export default function usePlanPicker({ room, settings, scale, tool, entry, dispatch }) {
  const [picker, setPicker] = useState(null);
  const context = `${room?.id}:${tool}:${entry ? 'entry' : ''}`;
  const closePicker = useCallback(() => setPicker(null), []);
  useEffect(() => closePicker(), [closePicker, context]);

  const apply = useCallback((candidate) => {
    if (!candidate) {
      dispatch(clearSelection());
      return;
    }
    dispatch(setActiveWall(candidate.wallId));
    if (candidate.selection) dispatch(setSelection(candidate.selection));
  }, [dispatch]);

  const pick = useCallback((pointer, worldPoint) => {
    if (tool !== 'select' || entry || !room || !pointer) return;
    const candidates = planPickStack(room, worldPoint, settings, { tolerance: 4 / scale });
    const chosen = candidates[0];
    apply(chosen);
    setPicker(candidates.length >= 2 ? {
      context,
      x: pointer.x,
      y: pointer.y,
      candidates,
      activeKey: chosen.key,
      hoverKey: null,
    } : null);
  }, [apply, context, entry, room, scale, settings, tool]);

  const hoverPick = useCallback((key) => {
    setPicker((current) => (current ? { ...current, hoverKey: key } : current));
  }, []);
  const choosePick = useCallback((key) => {
    const candidate = picker?.context === context
      ? picker.candidates.find((candidate) => candidate.key === key) : null;
    if (candidate) apply(candidate);
    closePicker();
  }, [apply, closePicker, context, picker]);

  const open = picker?.context === context ? picker : null;
  return {
    picker: open,
    hovered: open?.candidates.find((candidate) => candidate.key === open.hoverKey) ?? null,
    pick,
    choosePick,
    hoverPick,
    closePicker,
  };
}
