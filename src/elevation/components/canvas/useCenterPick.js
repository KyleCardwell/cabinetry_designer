import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { screenToWall } from '../../canvas/transform.js';
import { centerOverTargets, centerRunOver, targetsAt } from '../../model/centerOver.js';
import { isJointAnchor, jointMembers } from '../../model/joints.js';
import { formatInches } from '../../model/units.js';
import { wallSideOf, wallSideView } from '../../model/wallSides.js';
import {
  endCenterPick,
  replaceRun,
  replaceWallLayout,
  setMessage,
  startCenterPick,
} from '../../store/elevationSlice.js';

export const CENTER_PICK_PROMPT = 'Center over: click a cell (Esc to cancel)';
export const CENTER_ANCHORED = 'Anchored — set Anchor to Free to center';
export const CENTER_NOTHING = 'Nothing on this wall to center over';
const OFF_TOLERANCE = 1 / 64;
const IDLE = { hovered: null, chooser: null };

/** Why run `run` can't start "Center over…", or null when it can (SPEC-CV1 §1.5). */
export function centerPickRefusal(room, wallId, run, settings) {
  if (!run) return CENTER_NOTHING;
  const anchored = ['left', 'right'].some((side) => run.anchors?.[side] && !isJointAnchor(run.anchors[side]));
  if (anchored) return CENTER_ANCHORED;
  return centerOverTargets(room, wallId, run.id, settings).length ? null : CENTER_NOTHING;
}

/** Start "Center over…" for a run, or say why it can't start. */
export function requestCenterPick({ room, wallId, run, settings, dispatch, showMessage }) {
  const refusal = centerPickRefusal(room, wallId, run, settings);
  if (refusal) showMessage(refusal);
  else dispatch(startCenterPick({ wallId, runId: run.id }));
  return !refusal;
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

/** The stretch preview a center-over result draws: the moved run plus its joint neighbours. */
export function centerPreview(result, wallId, runId, side) {
  if (!result.ok) return null;
  const resolvedWall = result.room.walls.find((candidate) => candidate.id === wallId);
  const run = resolvedWall?.runs.find((candidate) => candidate.id === runId);
  if (!run) return null;
  const runIds = new Set([runId]);
  for (const end of ['left', 'right']) {
    const anchor = run.anchors?.[end];
    if (isJointAnchor(anchor)) jointMembers(resolvedWall, anchor.jointId).forEach((member) => runIds.add(member.runId));
  }
  return { room: result.room, wall: wallSideView(resolvedWall, side), runIds: [...runIds] };
}

/**
 * Canvas side of "Center over…" (SPEC-CV1 steps b–c): while `centerPick` names a run on this wall face,
 * hovering outlines the cell under the pointer and previews the run centered on it; a click centers it.
 * When 2+ targets sit under the click, the first is used and a chooser lists the rest.
 */
export default function useCenterPick({
  room, wall, settings, transform, stageRef, tool, dispatch, showMessage,
  setStretchPreview = () => {},
}) {
  const centerPick = useSelector((state) => state.elevation.centerPick ?? null);
  const [ui, setUi] = useState(IDLE);
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
  const side = wall?.side ?? 'front';

  const end = useCallback((message = null) => {
    setUi(IDLE);
    setStretchPreview(null);
    dispatch(endCenterPick());
    if (message) showMessage(message);
    else dispatch(setMessage(null));
  }, [dispatch, setStretchPreview, showMessage]);

  // Leaving the face, room or tool — or the run going away — ends the mode.
  useEffect(() => {
    if (centerPick && !active) {
      setUi(IDLE);
      setStretchPreview(null);
      dispatch(endCenterPick());
    }
  }, [active, centerPick, dispatch, setStretchPreview]);

  useEffect(() => {
    if (active) dispatch(setMessage(CENTER_PICK_PROMPT));
  }, [active, dispatch]);

  useEffect(() => {
    if (!active) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || ui.chooser) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      end();
    };
    globalThis.addEventListener('keydown', handleKeyDown, true);
    return () => globalThis.removeEventListener('keydown', handleKeyDown, true);
  }, [active, end, ui.chooser]);

  const tryCenter = useCallback((target, fromRoom = room) => (
    centerRunOver(fromRoom, wall.id, run.id, target.key, settings)
  ), [room, run, settings, wall]);

  const hover = useCallback((target, pointer, fromRoom = room) => {
    if (!target) {
      setStretchPreview(null);
      return null;
    }
    const result = tryCenter(target, fromRoom);
    setStretchPreview(centerPreview(result, wall.id, run.id, side));
    return { target, pointer, refused: result.ok ? null : centerResultMessage(result) };
  }, [room, run, setStretchPreview, side, tryCenter, wall]);

  const hitAtPointer = useCallback(() => {
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer || !transform) return { pointer: null, hits: [] };
    return { pointer, hits: targetsAt(targets, screenToWall(pointer, transform)) };
  }, [stageRef, targets, transform]);

  const move = useCallback(() => {
    if (!active || ui.chooser) return;
    const { pointer, hits } = hitAtPointer();
    const next = hits[0] ?? null;
    if (next && ui.hovered?.target.key === next.key) {
      setUi({ ...ui, hovered: { ...ui.hovered, pointer } });
      return;
    }
    if (!next && !ui.hovered) return;
    setUi({ ...ui, hovered: hover(next, pointer) });
  }, [active, hitAtPointer, hover, ui]);

  const leave = useCallback(() => {
    if (ui.chooser || !ui.hovered) return;
    setStretchPreview(null);
    setUi({ ...ui, hovered: null });
  }, [setStretchPreview, ui]);

  const click = useCallback((event) => {
    if (!active || ui.chooser) return;
    if (event?.evt?.button !== undefined && event.evt.button !== 0) return;
    const { pointer, hits } = hitAtPointer();
    if (!hits.length) {
      end();
      return;
    }
    const result = tryCenter(hits[0]);
    if (result.ok) commitCenterResult(dispatch, wall.id, run.id, result);
    if (hits.length < 2) {
      end(centerResultMessage(result));
      return;
    }
    setStretchPreview(null);
    setUi({
      hovered: null,
      chooser: {
        x: pointer.x,
        y: pointer.y,
        baseRoom: room,
        message: centerResultMessage(result),
        candidates: hits.map((target) => ({ ...target, kind: target.kind })),
        activeKey: hits[0].key,
        hoverKey: null,
      },
    });
  }, [active, dispatch, end, hitAtPointer, room, run, setStretchPreview, tryCenter, ui.chooser, wall]);

  const hoverChoice = useCallback((key) => {
    if (!ui.chooser) return;
    const target = ui.chooser.candidates.find((candidate) => candidate.key === key) ?? null;
    setUi({
      hovered: target ? hover(target, null, ui.chooser.baseRoom) : hover(null),
      chooser: { ...ui.chooser, hoverKey: key },
    });
  }, [hover, ui]);

  const choose = useCallback((key) => {
    const chooser = ui.chooser;
    const target = chooser?.candidates.find((candidate) => candidate.key === key);
    if (!target) return;
    if (key === chooser.activeKey) {
      end(chooser.message);
      return;
    }
    const result = tryCenter(target, chooser.baseRoom);
    if (result.ok) commitCenterResult(dispatch, wall.id, run.id, result);
    end(centerResultMessage(result));
  }, [dispatch, end, run, tryCenter, ui.chooser, wall]);

  const closeChooser = useCallback(() => {
    if (ui.chooser) end(ui.chooser.message);
  }, [end, ui.chooser]);

  const cancel = useCallback(() => {
    if (active) end();
  }, [active, end]);

  return {
    active,
    run: active ? run : null,
    targets,
    hovered: active ? ui.hovered : null,
    chooser: active ? ui.chooser : null,
    move,
    leave,
    click,
    cancel,
    hoverChoice,
    choose,
    closeChooser,
  };
}
