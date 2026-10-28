import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { screenToWall } from '../../canvas/transform.js';
import { centerOverTargets, centerRunOver, targetsAt } from '../../model/centerOver.js';
import { isJointAnchor } from '../../model/joints.js';
import { formatInches } from '../../model/units.js';
import { wallSideOf } from '../../model/wallSides.js';
import {
  endCenterPick,
  replaceRun,
  replaceWallLayout,
  setMessage,
} from '../../store/elevationSlice.js';

export const CENTER_PICK_PROMPT = 'Center over: click a cell (Esc to cancel)';
export const CENTER_ANCHORED = 'Anchored — set Anchor to Free to center';
export const CENTER_NOTHING = 'Nothing on this wall to center over';
const OFF_TOLERANCE = 1 / 64;

/** Why run `run` can't start "Center over…", or null when it can (SPEC-CV1 §1.5). */
export function centerPickRefusal(room, wallId, run, settings) {
  if (!run) return CENTER_NOTHING;
  const anchored = ['left', 'right'].some((side) => run.anchors?.[side] && !isJointAnchor(run.anchors[side]));
  if (anchored) return CENTER_ANCHORED;
  return centerOverTargets(room, wallId, run.id, settings).length ? null : CENTER_NOTHING;
}

/** Message for a finished center-over result (SPEC-CV1 §1.6), or null when nothing needs saying. */
export function centerResultMessage(result) {
  if (!result.ok) return result.reason === 'anchored' ? CENTER_ANCHORED : result.reason;
  return Math.abs(result.off ?? 0) > OFF_TOLERANCE
    ? `Centered as far as it goes — ${formatInches(Math.abs(result.off))} off`
    : null;
}

/** Commit a successful center-over result the way run move commits (one dispatch). */
export function commitCenterResult(dispatch, wallId, runId, result) {
  const resolvedWall = result.room.walls.find((candidate) => candidate.id === wallId);
  if (!resolvedWall) return;
  if (result.joints) {
    dispatch(replaceWallLayout({ wallId, runs: resolvedWall.runs, joints: resolvedWall.joints }));
  } else {
    const run = resolvedWall.runs.find((candidate) => candidate.id === runId);
    if (run) dispatch(replaceRun({ wallId, run }));
  }
}

/**
 * Canvas side of "Center over…" (SPEC-CV1 step b): while `centerPick` names a run on this wall face,
 * hovering outlines the cell under the pointer and a click centers the run on it.
 */
export default function useCenterPick({
  room, wall, settings, transform, stageRef, tool, dispatch, showMessage,
}) {
  const centerPick = useSelector((state) => state.elevation.centerPick ?? null);
  const [hovered, setHovered] = useState(null);
  const run = useMemo(() => {
    if (!centerPick || !wall || centerPick.wallId !== wall.id) return null;
    const candidate = (wall.sideSource ?? wall).runs.find(({ id }) => id === centerPick.runId) ?? null;
    return candidate && wallSideOf(candidate) === (wall.side ?? 'front') ? candidate : null;
  }, [centerPick, wall]);
  const active = Boolean(run && room && tool === 'select');
  const targets = useMemo(
    () => (active ? centerOverTargets(room, wall.id, run.id, settings) : []),
    [active, room, run, settings, wall],
  );

  const end = useCallback((message = null) => {
    setHovered(null);
    dispatch(endCenterPick());
    if (message) showMessage(message);
    else dispatch(setMessage(null));
  }, [dispatch, showMessage]);

  // Leaving the face, room or tool — or the run going away — ends the mode.
  useEffect(() => {
    if (centerPick && !active) {
      setHovered(null);
      dispatch(endCenterPick());
    }
  }, [active, centerPick, dispatch]);

  useEffect(() => {
    if (active) dispatch(setMessage(CENTER_PICK_PROMPT));
  }, [active, dispatch]);

  useEffect(() => {
    if (!active) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      end();
    };
    globalThis.addEventListener('keydown', handleKeyDown, true);
    return () => globalThis.removeEventListener('keydown', handleKeyDown, true);
  }, [active, end]);

  const hitAtPointer = useCallback(() => {
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer || !transform) return { pointer: null, hits: [] };
    return { pointer, hits: targetsAt(targets, screenToWall(pointer, transform)) };
  }, [stageRef, targets, transform]);

  const move = useCallback(() => {
    if (!active) return;
    const { pointer, hits } = hitAtPointer();
    const next = hits[0] ?? null;
    setHovered((current) => {
      if (!next) return null;
      if (current?.target.key === next.key) return { ...current, pointer };
      return { target: next, pointer };
    });
  }, [active, hitAtPointer]);

  const leave = useCallback(() => setHovered(null), []);

  const center = useCallback((target) => {
    const result = centerRunOver(room, wall.id, run.id, target.key, settings);
    if (result.ok) commitCenterResult(dispatch, wall.id, run.id, result);
    return result;
  }, [dispatch, room, run, settings, wall]);

  const click = useCallback((event) => {
    if (!active) return;
    if (event?.evt?.button !== undefined && event.evt.button !== 0) return;
    const { hits } = hitAtPointer();
    if (!hits.length) {
      end();
      return;
    }
    end(centerResultMessage(center(hits[0])));
  }, [active, center, end, hitAtPointer]);

  const cancel = useCallback(() => {
    if (active) end();
  }, [active, end]);

  return {
    active,
    run: active ? run : null,
    targets,
    hovered: active ? hovered : null,
    move,
    leave,
    click,
    cancel,
  };
}
