import { panelLevels, resolveDoorStyle } from './doorStyleResolve.js';
import { isJointAnchor, isFollowAnchor } from './joints.js';

export function isJoinedEnd(run, side) {
  return isJointAnchor(run.anchors?.[side]) || isFollowAnchor(run.anchors?.[side]);
}

/** A panel cell is sheet slab by default unless it's a back panel, whose face shows (SPEC-46.2.1). */
export function isSheetCell(leaf) {
  return leaf?.align !== 'back';
}

/** Interim team panel thickness until 46.3 (SPEC-46.1.1). */
export function panelThickness(room, wall, run, part, settings, { sheet = false } = {}) {
  const { style } = resolveDoorStyle(
    room, settings, 'panel', panelLevels(room, wall, run, part, { sheet }),
  );
  return style.id === 'default' ? settings.endPanelThickness : style.thickness;
}

export function runEndThickness(room, wall, run, settings) {
  return Object.fromEntries(['left', 'right'].map((side) => [
    side,
    panelThickness(room, wall, run, run.ends?.[side] ?? null, settings, {
      sheet: isJoinedEnd(run, side),
    }),
  ]));
}

export function wallPanelThickness(room, wall, settings) {
  return Object.fromEntries(['start', 'end'].map((endpoint) => {
    const panel = wall.endPanels?.[endpoint];
    return [endpoint, panel == null ? null : panelThickness(room, wall, null, panel, settings)];
  }));
}
