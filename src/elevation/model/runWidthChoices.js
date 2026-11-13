/**
 * LL6: typing a run width that only typed numbers would have to absorb. Lists the ways out (make one
 * item auto, change a typed end filler, or remove a cabinet when shrinking) and applies the pick.
 * See plans/LAYOUT-PLAN.md "Width from cells".
 */
import { removeRootColumn, runItems, updateRootItem } from './grid.js';
import { isJointAnchor } from './joints.js';
import { findLine, placedAt } from './layoutLines.js';
import { lineHeldJoints, movableRunSides } from './linePlacement.js';
import { splitOptionsForRun } from './placement.js';
import { cloneRoom } from './roomClone.js';
import { syncRoom } from './roomSync.js';
import { resizeRun } from './runJoins.js';
import { contentsWidth, isAutoItem, runWidthRange, splitRun } from './splitRun.js';
import { formatDimension } from './units.js';
import { wallSideOf } from './wallSides.js';

const EPSILON = 1e-6;
const FILLER_END_TYPES = new Set(['filler', 'blind']);
const KIND_WORDS = { cabinet: 'cabinet', void: 'open', panel: 'panel', shelves: 'shelves' };
const NO_CHOICE = Object.freeze({ needsChoice: false });

const inches = (value) => formatDimension(value);

function withItems(run, edit) {
  if (run.items) return { ...run, items: edit.items(run.items) };
  return { ...run, grid: edit.grid(run.grid) };
}

function removeItems(run, ids) {
  if (!ids.length) return run;
  return withItems(run, {
    items: (items) => items.filter((item) => !ids.includes(item.id)),
    grid: (grid) => ids.reduce(removeRootColumn, grid),
  });
}

function setItemWidth(run, id, width) {
  return withItems(run, {
    items: (items) => items.map((item) => (item.id === id ? { ...item, width } : item)),
    grid: (grid) => updateRootItem(grid, id, { width }),
  });
}

function typable(run, wall) {
  if (run.autoCount) return false;
  if (runItems(run).some((item) => placedAt(item))) return false;
  const held = (side) => run.anchors?.[side] && !isJointAnchor(run.anchors[side]);
  if (held('left') && held('right')) return false;
  const line = run.attach && findLine(wall, run.attach.lineId);
  if (line && wallSideOf(line) === wallSideOf(run)
    && movableRunSides(run, lineHeldJoints(wall)).length < 2) return false;
  return true;
}

function fitsRange(range, width) {
  if (range.min === range.max) return Math.abs(range.min - width) <= EPSILON;
  return width >= range.min - EPSILON && width <= range.max + EPSILON;
}

/** "cabinet 2 (24)" by the item's place in the run as it stands now. */
function itemName(items, id) {
  const index = items.findIndex((item) => item.id === id);
  const item = items[index];
  const width = item.width === null ? '' : ` (${inches(item.width)})`;
  return `${KIND_WORDS[item.kind] ?? item.kind} ${index + 1}${width}`;
}

/**
 * What typing `width` on the run needs. `{ needsChoice: false }` when it just fits (or can't be typed
 * here); otherwise `{ needsChoice, current, width, grow, removed, header, without, options }`.
 * `removed` lists root items already taken out in the dialog.
 */
export function runWidthChoices(room, wallId, runId, width, grow, settings, removed = []) {
  const synced = syncRoom(room, settings);
  const wall = synced.walls.find((candidate) => candidate.id === wallId);
  const run = wall?.runs.find((candidate) => candidate.id === runId);
  if (!run || !Number.isFinite(width) || width <= 0 || !typable(run, wall)) return NO_CHOICE;
  const opts = splitOptionsForRun(synced, wall, run, settings);
  const original = runItems(run);
  const rest = removeItems(run, removed);
  const trial = { ...rest, width };
  const fits = (candidate) => fitsRange(runWidthRange(candidate, settings, opts), width);
  if (!removed.length && fits(trial)) return NO_CHOICE;

  const range = runWidthRange(trial, settings, opts);
  const options = [];
  for (const item of runItems(trial)) {
    if (item.width === null || !isAutoItem({ ...item, width: null })) continue;
    const candidate = setItemWidth(trial, item.id, null);
    if (!fits(candidate)) continue;
    const result = splitRun(candidate, settings, opts).pieces.find((piece) => piece.id === item.id)?.width;
    options.push({
      type: 'auto', itemId: item.id, result,
      label: `Make ${itemName(original, item.id)} auto → ${inches(result)}`,
    });
  }
  if (range.min === range.max) {
    for (const side of ['left', 'right']) {
      const end = trial.ends[side];
      if (!FILLER_END_TYPES.has(end?.type) || end.width === null) continue;
      const next = end.width + (width - range.min);
      if (next < (opts.endMinWidths?.[side] ?? settings.fillerMinWidth) - EPSILON) continue;
      options.push({
        type: 'end', side, width: next, result: next,
        label: `Change the ${side} ${end.type} to ${inches(next)}`,
      });
    }
  }
  if (!options.length && width < range.min - EPSILON) {
    for (const item of runItems(trial)) {
      if (item.kind !== 'cabinet') continue;
      const final = fits(removeItems(trial, [item.id]));
      options.push({
        type: 'remove', itemId: item.id, final,
        label: `Remove ${itemName(original, item.id)}${final ? '' : '…'}`,
      });
    }
  }

  const current = removed.length ? contentsWidth(rest, settings, opts) : run.width;
  return {
    needsChoice: true, current, width, grow, removed, options,
    header: `Run is ${inches(current)}. Changing it to ${inches(width)} changes a typed width.`,
    without: removed.length
      ? `Without ${removed.map((id) => itemName(original, id)).join(', ')}:`
      : null,
  };
}

/** Apply a pick from `runWidthChoices`, then type the width (joints and lines as `resizeRun`). */
export function applyRunWidthChoice(room, wallId, runId, choice, settings) {
  const { width, grow = 'right', removed = [], auto = null, end = null } = choice ?? {};
  const next = cloneRoom(room);
  const wall = next.walls.find((candidate) => candidate.id === wallId);
  const index = wall?.runs.findIndex((candidate) => candidate.id === runId) ?? -1;
  if (index < 0) return { ok: false, reason: 'run-not-found', room };
  let run = removeItems(wall.runs[index], removed);
  if (removed.length) run = { ...run, autoCount: false };
  if (auto) run = setItemWidth(run, auto, null);
  if (end && (end.side === 'left' || end.side === 'right') && Number.isFinite(end.width)) {
    run = { ...run, ends: { ...run.ends, [end.side]: { ...run.ends[end.side], width: end.width } } };
  }
  delete run.widthFrom;
  wall.runs[index] = run;
  const result = resizeRun(next, wallId, runId, width, grow, settings);
  return result.ok ? result : { ...result, room };
}
