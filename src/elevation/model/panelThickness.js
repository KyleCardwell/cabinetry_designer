import { blindEntries, panelDepth } from './blind.js';
import { panelLevels, resolveDoorStyle } from './doorStyleResolve.js';
import { isJointAnchor, isFollowAnchor } from './joints.js';

export function isJoinedEnd(run, side) {
  return isJointAnchor(run.anchors?.[side]) || isFollowAnchor(run.anchors?.[side]);
}

/** Joined ends and blind panels receiving a return run default to sheet slab. */
export function endPanelSheet(room, wall, run, side, settings) {
  return isJoinedEnd(run, side) || (run.ends?.[side]?.type === 'blind'
    && panelDepth(room, wall, run, side, settings) > 0
    && blindEntries(room, wall, run, settings).entries.some((entry) => entry.side === side && entry.panel));
}

/** A panel cell is sheet slab by default unless it's a back panel, whose face shows (SPEC-46.2.1). */
export function isSheetCell(leaf) {
  return leaf?.align !== 'back';
}

/** Panels use their resolved door style or sheet material thickness (SPEC-EP1). */
export function panelThickness(room, wall, run, part, settings, { sheet = false } = {}) {
  const { style } = resolveDoorStyle(
    room, settings, 'panel', panelLevels(room, wall, run, part, { sheet }),
  );
  return style.thickness;
}

export function runEndThickness(room, wall, run, settings) {
  return Object.fromEntries(['left', 'right'].map((side) => [
    side,
    panelThickness(room, wall, run, run.ends?.[side] ?? null, settings, {
      sheet: endPanelSheet(room, wall, run, side, settings),
    }),
  ]));
}

export function wallPanelThickness(room, wall, settings) {
  return Object.fromEntries(['start', 'end'].map((endpoint) => {
    const panel = wall.endPanels?.[endpoint];
    return [endpoint, panel == null ? null : panelThickness(room, wall, null, panel, settings)];
  }));
}
