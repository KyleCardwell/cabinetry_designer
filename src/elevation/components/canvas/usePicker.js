import { useCallback, useState } from 'react';
import { screenToWall } from '../../canvas/transform.js';
import { defaultPick, pickStack } from '../../model/pick.js';
import { setFacePath, setSelection } from '../../store/elevationSlice.js';

/**
 * Click-to-pick (SPEC-39.1). A click on anything in the elevation selects what a click always
 * selected and, when more than one thing besides the wall is under the pointer, opens a list of all
 * of them. The list belongs to the room, wall face and tool it opened on, and closes when they change.
 */
export default function usePicker({
  room, wall, settings, transform, stageRef, tool, suppressClickRef, dispatch,
}) {
  const [picker, setPicker] = useState(null);
  const context = `${room?.id}:${wall?.id}:${wall?.side ?? 'front'}:${tool}`;

  const apply = useCallback((candidate) => {
    if (!candidate?.selection) {
      dispatch(setSelection({}));
      return;
    }
    dispatch(setSelection(candidate.selection));
    if (candidate.facePath) dispatch(setFacePath(candidate.facePath));
  }, [dispatch]);

  const pickWith = useCallback((prefer) => {
    if (tool !== 'select' || suppressClickRef.current || !room || !wall || !transform) return;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const candidates = pickStack(room, wall, settings, screenToWall(pointer, transform));
    const chosen = defaultPick(candidates, prefer);
    apply(chosen);
    setPicker(candidates.length > 2 ? {
      context,
      x: pointer.x,
      y: pointer.y,
      candidates,
      activeKey: chosen?.key ?? null,
      hoverKey: null,
    } : null);
  }, [apply, context, room, settings, stageRef, suppressClickRef, tool, transform, wall]);

  const pick = useCallback(() => pickWith(null), [pickWith]);
  const pickFace = useCallback(() => pickWith('face'), [pickWith]);
  const closePicker = useCallback(() => setPicker(null), []);
  const hoverPick = useCallback((key) => {
    setPicker((current) => (current ? { ...current, hoverKey: key } : current));
  }, []);
  const choosePick = useCallback((key) => {
    const candidate = picker?.candidates.find((entry) => entry.key === key);
    if (candidate) apply(candidate);
    setPicker(null);
  }, [apply, picker]);

  const open = picker?.context === context ? picker : null;
  return {
    picker: open,
    hovered: open?.candidates.find((candidate) => candidate.key === open.hoverKey) ?? null,
    pick,
    pickFace,
    choosePick,
    hoverPick,
    closePicker,
  };
}
