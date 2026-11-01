/**
 * LL6: width from cabinets. A run flagged `widthFrom: 'cells'` takes its width from its contents when
 * every root item is typed, an end is free and no column is on a line (see plans/LAYOUT-PLAN.md).
 * Structure only: reads the stored run and wall.
 */
import { runItems } from './grid.js';
import { findLine, placedAt } from './layoutLines.js';
import { splitOptionsForRun } from './placement.js';
import { contentsWidth, isAutoItem } from './splitRun.js';
import { wallSideOf } from './wallSides.js';

const EPSILON = 1e-9;

function onLine(run, wall) {
  const line = run.attach && findLine(wall, run.attach.lineId);
  return Boolean(line) && wallSideOf(line) === wallSideOf(run);
}

/** Why width from cabinets can't apply now: 'auto-item' | 'placed-column' | 'no-free-end' | 'line-sized' | null. */
export function cellWidthsBlocker(run, wall) {
  const items = runItems(run);
  if (items.some(isAutoItem)) return 'auto-item';
  if (items.some((item) => placedAt(item))) return 'placed-column';
  const free = ['left', 'right'].filter((side) => !run.anchors?.[side]);
  if (free.length === 0) return 'no-free-end';
  if (onLine(run, wall) && free.length < 2) return 'line-sized';
  return null;
}

export function isWidthFromCells(run, wall) {
  return run.widthFrom === 'cells' && cellWidthsBlocker(run, wall) === null;
}

function cellWidthRun(room, wall, run, settings) {
  if (!isWidthFromCells(run, wall)) return run;
  const width = contentsWidth(run, settings, splitOptionsForRun(room, wall, run, settings));
  if (Math.abs(width - run.width) < EPSILON) return run;
  // Right held and left free: the right edge stays (run edges re-derive it from the anchor anyway).
  const x = run.anchors?.right && !run.anchors?.left ? run.x + run.width - width : run.x;
  return { ...run, x, width };
}

/** Sync stage before run edges: flagged runs take their contents width. */
export function cellWidths(room, settings) {
  let changed = false;
  const walls = room.walls.map((wall) => {
    if (!wall.runs?.some((run) => run.widthFrom === 'cells')) return wall;
    const runs = wall.runs.map((run) => cellWidthRun(room, wall, run, settings));
    if (runs.every((run, index) => run === wall.runs[index])) return wall;
    changed = true;
    return { ...wall, runs };
  });
  return changed ? { ...room, walls } : room;
}
