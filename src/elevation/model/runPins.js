import { teamDoorStyle } from './doorStyles.js';
import { DEFAULT_SETTINGS, PINNABLE_KINDS } from './constants.js';
import { runItems } from './grid.js';
import { findLine, lineX, placedAt } from './layoutLines.js';
import { validateRunPlacement } from './overlap.js';
import { lineEndMinimum, lineSharedWidths, splitRun } from './splitRun.js';
import { wallSideOf, wallViewForRun } from './wallSides.js';

export { placedAt };

const PIN_EPSILON = 1e-6;

/** LL4: a wall-end or opening pin (gone; layout lines replaced them). Return pins stay. */
function isWallPin(pin) {
  return Boolean(pin) && pin.from !== 'return';
}

function withoutWallPin(track) {
  if (!isWallPin(track.pin)) return track;
  const next = { ...track };
  delete next.pin;
  return next;
}

/**
 * LL4 prune: drop wall-end and opening pins from root columns (old lab rooms still load with them;
 * Kyle rebuilds them with layout lines). Same wall object when there are none.
 */
export function dropWallPins(wall) {
  let changed = false;
  const runs = (wall.runs ?? []).map((run) => {
    const cols = run.grid?.cols;
    const items = run.items;
    const colsHave = cols?.some((col) => isWallPin(col.pin));
    const itemsHave = items?.some((item) => isWallPin(item.pin));
    if (!colsHave && !itemsHave) return run;
    changed = true;
    return {
      ...run,
      ...(colsHave ? { grid: { ...run.grid, cols: cols.map(withoutWallPin) } } : {}),
      ...(itemsHave ? { items: items.map(withoutWallPin) } : {}),
    };
  });
  return changed ? { ...wall, runs } : wall;
}

/** An attached root column's target: its line plus offset, in the run's face coordinates (LL4). */
function attachTarget(item, run, wall, wallLengthValue) {
  const line = findLine(wall, item.attach.lineId);
  if (!line || wallSideOf(line) !== wallSideOf(run)) return null;
  return lineX(line, wallLengthValue) + item.attach.offset;
}

/** Resolve all usable segment targets for a run: attached columns and return pins. */
export function pinTargetsForRun(run, wall, wallLengthValue) {
  wall = wallViewForRun(wall, run);
  return Object.fromEntries(runItems(run).flatMap((item) => {
    const target = item.attach && PINNABLE_KINDS.has(item.kind)
      ? attachTarget(item, run, wall, wallLengthValue)
      : item.pin?.from === 'return'
        ? run._returnPins?.[item.id]?.target
        : null;
    return Number.isFinite(target) ? [[item.id, target]] : [];
  }));
}

function storedEndMinimum(end, settings, thickness) {
  if (end.type === 'end_panel') return end.width ?? thickness ?? teamDoorStyle(settings).thickness;
  if (end.type === 'filler' || end.type === 'blind') {
    return end.width ?? settings.fillerMinWidth;
  }
  return 0;
}

function storedItemsMinimum(items, settings) {
  return items.reduce((sum, item) => (
    sum + (item.width ?? (item.kind === 'cabinet' ? settings.minCabinetWidth : 0))
  ), 0);
}

function pinLeft(target, width, anchor) {
  if (anchor === 'center') return target - width / 2;
  if (anchor === 'right') return target - width;
  return target;
}

function validGrowth(run, wall, wallLengthValue, settings) {
  return validateRunPlacement({ ...wall, length: wallLengthValue }, run, settings).ok;
}

function growLeft(run, desiredX, wall, wallLengthValue, settings) {
  if (desiredX >= run.x - PIN_EPSILON || run.anchors?.left) return run;
  const maxOverhang = settings.maxRunOverhang ?? DEFAULT_SETTINGS.maxRunOverhang;
  const boundedX = Math.max(-maxOverhang, desiredX);
  const right = run.x + run.width;
  const candidate = { ...run, x: boundedX, width: right - boundedX };
  if (validGrowth(candidate, wall, wallLengthValue, settings)) return candidate;
  let invalid = boundedX;
  let valid = run.x;
  for (let index = 0; index < 48; index += 1) {
    const middle = (invalid + valid) / 2;
    const attempt = { ...run, x: middle, width: right - middle };
    if (validGrowth(attempt, wall, wallLengthValue, settings)) valid = middle;
    else invalid = middle;
  }
  return { ...run, x: valid, width: right - valid };
}

function growRight(run, desiredRight, wall, wallLengthValue, settings) {
  const currentRight = run.x + run.width;
  if (desiredRight <= currentRight + PIN_EPSILON || run.anchors?.right) return run;
  const maxOverhang = settings.maxRunOverhang ?? DEFAULT_SETTINGS.maxRunOverhang;
  const boundedRight = Math.min(wallLengthValue + maxOverhang, desiredRight);
  const candidate = { ...run, width: boundedRight - run.x };
  if (validGrowth(candidate, wall, wallLengthValue, settings)) return candidate;
  let valid = currentRight;
  let invalid = boundedRight;
  for (let index = 0; index < 48; index += 1) {
    const middle = (valid + invalid) / 2;
    const attempt = { ...run, width: middle - run.x };
    if (validGrowth(attempt, wall, wallLengthValue, settings)) valid = middle;
    else invalid = middle;
  }
  return { ...run, width: valid - run.x };
}

/** Attached columns with no outer auto cabinet/void set a free edge exactly; other ends grow only. */
export function resolvePinnedSpan(run, wall, wallLengthValue, settings, pinTargets) {
  const items = runItems(run);
  const pinned = items
    .map((item, itemIndex) => ({ item, itemIndex, target: pinTargets[item.id] }))
    .filter(({ item, target }) => PINNABLE_KINDS.has(item.kind)
      && placedAt(item)
      && Number.isFinite(target));
  if (pinned.length === 0) {
    if (!run._pinWidths) return run;
    const { _pinWidths, ...withoutPinWidths } = run;
    void _pinWidths;
    return withoutPinWidths;
  }

  const pass1 = splitRun(run, settings, { pinTargets: {} });
  const pieces = new Map(pass1.pieces.map((piece) => [piece.id, piece]));
  const sharedWidths = lineSharedWidths(run, settings, { pinTargets });
  const pinWidths = Object.fromEntries(pinned.map(({ item }) => [
    item.id,
    (item.pin?.from === 'return' && item.pin.edge === 'both'
      ? run._returnPins?.[item.id]?.width : undefined)
      ?? item.width ?? sharedWidths[item.id] ?? run._pinWidths?.[item.id] ?? pieces.get(item.id)?.width ?? 0,
  ]));
  const first = pinned[0];
  const last = pinned[pinned.length - 1];
  const firstWidth = pinWidths[first.item.id];
  const lastWidth = pinWidths[last.item.id];
  const leftItems = items.slice(0, first.itemIndex);
  const rightItems = items.slice(last.itemIndex + 1);
  const leftMinimum = storedEndMinimum(run.ends.left, settings, run._endThickness?.left)
    + storedItemsMinimum(leftItems, settings);
  const rightMinimum = storedEndMinimum(run.ends.right, settings, run._endThickness?.right)
    + storedItemsMinimum(rightItems, settings);
  const hasAuto = (outerItems) => outerItems.some((item) => item.width === null
    && (item.kind === 'cabinet' || item.kind === 'void'));
  const exactLeft = first.item.attach && !run.anchors?.left && !hasAuto(leftItems);
  const exactRight = last.item.attach && !run.anchors?.right && !hasAuto(rightItems);
  const desiredX = pinLeft(first.target, firstWidth, placedAt(first.item))
    - (exactLeft ? lineEndMinimum(run, settings, first.item.id, 'left') : leftMinimum);
  const desiredRight = pinLeft(last.target, lastWidth, placedAt(last.item)) + lastWidth
    + (exactRight ? lineEndMinimum(run, settings, last.item.id, 'right') : rightMinimum);

  let resolved = exactLeft
    ? { ...run, x: desiredX, width: Math.max(0, run.x + run.width - desiredX) }
    : growLeft(run, desiredX, wall, wallLengthValue, settings);
  resolved = exactRight
    ? { ...resolved, width: Math.max(0, desiredRight - resolved.x) }
    : growRight(resolved, desiredRight, wall, wallLengthValue, settings);
  return { ...resolved, _pinWidths: pinWidths };
}
