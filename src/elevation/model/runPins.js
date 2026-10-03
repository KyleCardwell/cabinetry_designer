import { DEFAULT_SETTINGS } from './constants.js';
import { runItems } from './grid.js';
import { openingGeometry } from './openings.js';
import { validateRunPlacement } from './overlap.js';
import { splitRun } from './splitRun.js';
import { wallViewForRun } from './wallSides.js';

const PIN_EPSILON = 1e-6;

/** Resolve a stored cabinet pin to a wall-local target coordinate. */
export function resolvePinTarget(pin, wall, wallLengthValue, settings) {
  if (!pin || !Number.isFinite(pin.value)) return null;
  if (pin.from === 'left') return pin.value;
  if (pin.from === 'right') return wallLengthValue - pin.value;
  if (pin.from !== 'opening' || typeof pin.openingId !== 'string') return null;
  const opening = (wall.openings ?? []).find((candidate) => candidate.id === pin.openingId);
  if (!opening) return null;
  const geometry = openingGeometry(opening, wallLengthValue, settings);
  const anchors = {
    center: geometry.jamb.x + geometry.jamb.width / 2,
    'casing-left': (geometry.casing ?? geometry.jamb).x,
    'casing-right': (geometry.casing ?? geometry.jamb).x
      + (geometry.casing ?? geometry.jamb).width,
    'jamb-left': geometry.jamb.x,
    'jamb-right': geometry.jamb.x + geometry.jamb.width,
  };
  const datum = anchors[pin.openingAnchor];
  return Number.isFinite(datum) ? datum + pin.value : null;
}

/** Resolve all usable pin targets for a run. */
export function pinTargetsForRun(run, wall, wallLengthValue, settings) {
  wall = wallViewForRun(wall, run);
  return Object.fromEntries(runItems(run).flatMap((item) => {
    const target = resolvePinTarget(item.pin, wall, wallLengthValue, settings);
    return Number.isFinite(target) ? [[item.id, target]] : [];
  }));
}

function storedEndMinimum(end, settings) {
  if (end.type === 'end_panel') return end.width ?? settings.endPanelThickness;
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

/** Grow free outer run ends when that can make the first or last pin reachable. */
export function resolvePinnedSpan(run, wall, wallLengthValue, settings, pinTargets) {
  const items = runItems(run);
  const pinned = items
    .map((item, itemIndex) => ({ item, itemIndex, target: pinTargets[item.id] }))
    .filter(({ item, target }) => item.kind === 'cabinet'
      && item.pin
      && Number.isFinite(target));
  if (pinned.length === 0) {
    if (!run._pinWidths) return run;
    const { _pinWidths, ...withoutPinWidths } = run;
    void _pinWidths;
    return withoutPinWidths;
  }

  const pass1 = splitRun(run, settings, { pinTargets: {} });
  const pieces = new Map(pass1.pieces.map((piece) => [piece.id, piece]));
  const pinWidths = Object.fromEntries(pinned.map(({ item }) => [
    item.id,
    item.width ?? run._pinWidths?.[item.id] ?? pieces.get(item.id)?.width ?? 0,
  ]));
  const first = pinned[0];
  const last = pinned[pinned.length - 1];
  const firstWidth = pinWidths[first.item.id];
  const lastWidth = pinWidths[last.item.id];
  const leftMinimum = storedEndMinimum(run.ends.left, settings)
    + storedItemsMinimum(items.slice(0, first.itemIndex), settings);
  const rightMinimum = storedEndMinimum(run.ends.right, settings)
    + storedItemsMinimum(items.slice(last.itemIndex + 1), settings);

  let resolved = growLeft(
    run,
    pinLeft(first.target, firstWidth, first.item.pin.anchor) - leftMinimum,
    wall,
    wallLengthValue,
    settings,
  );
  resolved = growRight(
    resolved,
    pinLeft(last.target, lastWidth, last.item.pin.anchor) + lastWidth + rightMinimum,
    wall,
    wallLengthValue,
    settings,
  );
  return { ...resolved, _pinWidths: pinWidths };
}
