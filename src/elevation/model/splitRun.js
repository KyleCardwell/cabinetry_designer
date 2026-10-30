import { v4 as uuid } from 'uuid';
import { MIN_CELL_SIZE, derivedLeafWidths } from './cells.js';
import { columnSteps } from './columnSteps.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS, PINNABLE_KINDS } from './constants.js';
import { teamDoorStyle } from './doorStyles.js';
import { replaceRootItems, runItems } from './grid.js';
import { insideEndGap, insideEndPanels } from './insideEnds.js';
import { placedAt } from './layoutLines.js';
import { stepEndPanels } from './stepEnds.js';
import { floorTo, roundTo } from './units.js';

const WIDTH_EPSILON = 1e-6;
const FILLER_STEP = 1 / 16;
const FILLER_END_TYPES = new Set(['filler', 'blind']);
const AUTO_KINDS = new Set(['cabinet', 'panel', 'void', 'shelves']);

/** An item that shares leftover width: a cabinet or cell kind with no width. Never a filler. */
function isAutoItem(item) {
  return item.width === null && AUTO_KINDS.has(item.kind);
}

/**
 * The run's items, each with `gapAfter` (SPEC-36): its column's own `gap`, else the run's seam
 * gap between two cabinet columns; 0 after the last. Items that already carry one keep it (the
 * pinned segments pass slices of this list back in).
 */
function itemsWithGaps(run, settings) {
  const items = runItems(run);
  const seamGap = run._seamGap ?? run.seamGap ?? 0;
  const panels = insideEndPanels(run, settings);
  return items.map((item, index) => {
    if (item.gapAfter !== undefined) return item;
    const next = items[index + 1];
    let gapAfter = 0;
    if (next) {
      gapAfter = item.gap ?? (item.kind === 'cabinet' && next.kind === 'cabinet' ? seamGap : 0);
      gapAfter += insideEndGap(panels, run.grid?.id, run.grid?.cols[index]?.id);
    }
    return { ...item, gapAfter };
  });
}

/**
 * Rounding for the run's auto items (FX3). All auto items share one width W, and W is round when
 * every width that comes out of it (an item's own width, or the cells inside its nested grid) is a
 * multiple of `roundTo`. Without nested grids that is just W on `roundTo`, exactly as before.
 * `floor(x)` is the largest round W ≤ x (1/16" steps, 48" window, else plain rounding), `above(w)`
 * the smallest round W > w.
 */
const ROUND_SEARCH = 48;

function autoRounding(run, settings, items) {
  const step = settings.roundTo;
  const onStep = (value) => Math.abs(value / step - Math.round(value / step)) <= WIDTH_EPSILON;
  const nested = items.filter((item) => isAutoItem(item) && item.grid);
  if (nested.length === 0) {
    return {
      isRound: onStep,
      floor: (x) => floorTo(x, step),
      above: (w) => floorTo(w + WIDTH_EPSILON, step) + step,
    };
  }
  const seamGap = run._seamGap ?? run.seamGap ?? 0;
  const panels = insideEndPanels(run, settings);
  const isRound = (w) => items.filter(isAutoItem).every((item) => {
    const widths = item.grid ? derivedLeafWidths(item.grid, w, seamGap, panels) : [w];
    return widths.length === 0 ? onStep(w) : widths.every(onStep);
  });
  const steps = ROUND_SEARCH / FILLER_STEP;
  return {
    isRound,
    floor: (x) => {
      const start = Math.floor(x / FILLER_STEP + WIDTH_EPSILON);
      for (let k = start; k > start - steps && k > 0; k -= 1) {
        if (isRound(k * FILLER_STEP)) return k * FILLER_STEP;
      }
      return floorTo(x, step);
    },
    above: (w) => {
      const start = Math.floor(w / FILLER_STEP + WIDTH_EPSILON) + 1;
      for (let k = start; k < start + steps; k += 1) {
        if (isRound(k * FILLER_STEP)) return k * FILLER_STEP;
      }
      return floorTo(w + WIDTH_EPSILON, step) + step;
    },
  };
}

const JOINED = new Set(['joint', 'follow']);

/**
 * The gap at each real end of a face frame run (SPEC-38.3), beside a cabinet only: a beaded run's bead,
 * plus, at a free end, the stile's overhang. A None end is free unless a run of the same depth is joined
 * there or a wall end panel is mitered there; one that dies into a deeper run (`_frame.dieIn`) or into
 * a wall end panel (`join: 'butt'`) is free (SPEC-38.4). A pinned run's split points (`_pinSplit`)
 * aren't ends.
 */
function endGaps(run, items, settings) {
  if (!run._frame) return { left: 0, right: 0 };
  const bead = run._frame.bead ?? 0;
  const overhang = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame }.stile;
  const at = (side) => {
    if (run._pinSplit?.[side]) return 0;
    const item = side === 'left' ? items[0] : items[items.length - 1];
    if (item?.kind !== 'cabinet') return 0;
    const wallPanel = run._frame.wallPanels?.[side];
    const joined = JOINED.has(run.anchors?.[side]?.to);
    const free = run.ends[side].type === 'none' && (wallPanel
      ? wallPanel.join === 'butt'
      : !joined || run._frame.dieIn?.[side] === true);
    return bead + (free ? overhang : 0);
  };
  return { left: at('left'), right: at('right') };
}

/** A top-level cell's own settings, copied onto its piece. */
function itemExtras(item) {
  return {
    ...(item.depth !== undefined ? { depth: item.depth } : {}),
    ...(item.align !== undefined ? { align: item.align } : {}),
    ...(item.doors !== undefined ? { doors: item.doors } : {}),
    ...(item.shelves !== undefined ? { shelves: { ...item.shelves } } : {}),
    ...(item.extend !== undefined ? { extend: item.extend } : {}),
  };
}

function endWidth(end, settings, thickness) {
  if (end.type === 'end_panel') return end.width ?? thickness ?? teamDoorStyle(settings).thickness;
  if (FILLER_END_TYPES.has(end.type) && end.width !== null) return end.width;
  return 0;
}

function isFlexEnd(end) {
  return FILLER_END_TYPES.has(end.type) && end.width === null;
}

function flexMinimum(side, settings, opts) {
  return opts?.endMinWidths?.[side] ?? settings.fillerMinWidth;
}

/** Only auto root items at real run ends include their drawn miter in the shared width. */
function autoPanelMiters(run, items) {
  const at = (side, item) => (!run._pinSplit?.[side] && item && isAutoItem(item)
    ? run._panelMiters?.[side] ?? 0 : 0);
  return { left: at('left', items[0]), right: at('right', items[items.length - 1]) };
}

function layoutInputs(run, settings, opts) {
  const items = itemsWithGaps(run, settings);
  const gaps = endGaps(run, items, settings);
  const panelMiters = autoPanelMiters(run, items);
  const fixedEnds = endWidth(run.ends.left, settings, run._endThickness?.left)
    + endWidth(run.ends.right, settings, run._endThickness?.right)
    + gaps.left + gaps.right;
  const fixedItems = items.reduce((sum, item) => (
    sum + (item.width === null ? 0 : item.width) + item.gapAfter
  ), 0);
  const nAuto = items.filter(isAutoItem).length;
  const nAutoCabinets = items.filter(
    (item) => item.kind === 'cabinet' && item.width === null,
  ).length;
  const flexSides = ['left', 'right'].filter((side) => isFlexEnd(run.ends[side]));
  const flex = flexSides.length;
  const minimumTotal = flexSides.reduce(
    (sum, side) => sum + flexMinimum(side, settings, opts),
    0,
  );
  const available = run.width - fixedEnds - fixedItems + panelMiters.left + panelMiters.right;

  return {
    available,
    endGaps: gaps,
    panelMiters,
    fixedEnds,
    fixedItems,
    flex,
    flexSides,
    minimumTotal,
    nAuto,
    nAutoCabinets,
  };
}

/** Return the supported width interval for a run's stored layout intent. */
export function runWidthRange(run, settings, opts) {
  const {
    fixedEnds,
    fixedItems,
    flex,
    minimumTotal,
    nAuto,
  } = layoutInputs(run, settings, opts);
  const rigid = nAuto === 0 && flex === 0;
  const fixedWidth = fixedEnds + fixedItems;
  if (rigid) return { min: fixedWidth, max: fixedWidth };

  const minAuto = run.autoCount && nAuto > 0 ? 1 : nAuto;
  return {
    min: Math.max(
      settings.minRunWidth,
      fixedWidth + minimumTotal + minAuto * settings.minCabinetWidth,
    ),
    max: Infinity,
  };
}

function warning(code, pieceId, message) {
  return { code, pieceId, message };
}

/**
 * Split one run, or one segment of a held run, into positioned end, cabinet, and interior-filler pieces.
 *
 * @param {object} run
 * @param {object} settings
 * @param {{
 *   endMinWidths?: {left?: number, right?: number},
 *   endCornerAngles?: {left?: number, right?: number},
 * }} [opts]
 * @returns {{pieces: object[], warnings: object[], errors: object[]}}
 */
function splitSegment(run, settings, opts) {
  const items = itemsWithGaps(run, settings);
  const {
    available,
    endGaps,
    panelMiters,
    flex,
    minimumTotal,
    nAuto,
  } = layoutInputs(run, settings, opts);
  const warnings = [];
  const errors = [];
  const hasAvailableError = available < -WIDTH_EPSILON;
  let flexOverconstrained = hasAvailableError;
  let autoWidth = 0;
  let flexExtra = 0;
  let flexRemainder = 0;

  if (hasAvailableError) {
    errors.push({ code: 'over-constrained' });
  } else if (flex > 0) {
    const cabSpace = available - minimumTotal;
    if (cabSpace < -WIDTH_EPSILON) {
      flexOverconstrained = true;
      errors.push({ code: 'over-constrained' });
    } else {
      autoWidth = nAuto > 0 ? autoRounding(run, settings, items).floor(cabSpace / nAuto) : 0;
      const leftover = available - nAuto * autoWidth;
      const extra = leftover - minimumTotal;
      flexExtra = floorTo(extra / flex, FILLER_STEP);
      flexRemainder = extra - flex * flexExtra;
    }
  } else if (nAuto > 0) {
    autoWidth = roundTo(available / nAuto, FILLER_STEP);
    if (!autoRounding(run, settings, items).isRound(autoWidth)) {
      const firstAuto = items.find(
        (item) => item.kind === 'cabinet' && item.width === null,
      );
      if (firstAuto) {
        warnings.push(warning(
          'widths-not-rounded',
          firstAuto.id,
          `Auto cabinet widths are not multiples of ${settings.roundTo} inches.`,
        ));
      }
    }
  } else if (Math.abs(available) > WIDTH_EPSILON) {
    errors.push({ code: 'does-not-fill' });
  }

  // A sharing segment gives its autos one round width. The rounding remainder goes to an auto filler
  // (a flex end) as in a whole run (LL4.1 b), else to an auto that isn't the line's column.
  const sharing = run._lineShareItemId !== undefined && nAuto > 0 && !flexOverconstrained;
  const autos = items.filter(isAutoItem);
  const absorber = sharing ? (autos.find((item) => item.absorb)
    ?? autos.filter((item) => item.id !== run._lineShareItemId).at(-1)
    ?? autos[0]) : null;
  if (sharing) {
    // Reinclude the placed column's rounding constraints when splitting its neighbours later.
    const roundingItems = run._lineShareItem ? [...items, run._lineShareItem] : items;
    autoWidth = autoRounding(run, settings, roundingItems).floor(
      (available - minimumTotal + (run._lineShareWidth ?? 0))
        / (nAuto + (run._lineShareItem ? 1 : 0)),
    );
    if (flex > 0) {
      const extra = available - nAuto * autoWidth - minimumTotal;
      flexExtra = floorTo(extra / flex, FILLER_STEP);
      flexRemainder = extra - flex * flexExtra;
    } else {
      flexExtra = 0;
      flexRemainder = 0;
    }
  }

  let autoIndex = 0;
  const lastAutoIndex = nAuto - 1;
  const computedItems = items.map((item, index) => {
    if (!isAutoItem(item)) {
      return { ...item, computedWidth: item.width, auto: false };
    }

    let computedWidth = autoWidth;
    if (sharing && flex === 0 && item.id === absorber.id) {
      computedWidth = available - minimumTotal - autoWidth * lastAutoIndex;
    } else if (!sharing && flex === 0 && !hasAvailableError && autoIndex === lastAutoIndex) {
      computedWidth = available - autoWidth * lastAutoIndex;
    }
    autoIndex += 1;
    if (index === 0) computedWidth -= panelMiters.left;
    if (index === items.length - 1) computedWidth -= panelMiters.right;
    return { ...item, computedWidth, auto: true };
  });

  const maxWidth = run.maxCabinetWidth ?? settings.maxCabinetWidth;
  for (const item of computedItems) {
    if (!item.auto || item.kind !== 'cabinet') continue;
    if (item.computedWidth > maxWidth + WIDTH_EPSILON) {
      warnings.push(warning(
        'wide-cabinet',
        item.id,
        `Cabinet is wider than ${maxWidth} inches.`,
      ));
    }
    if (item.computedWidth < settings.minCabinetWidth - WIDTH_EPSILON) {
      warnings.push(warning(
        'narrow-cabinet',
        item.id,
        `Cabinet is narrower than ${settings.minCabinetWidth} inches.`,
      ));
    }
  }

  const leftIsFlex = isFlexEnd(run.ends.left);
  const rightIsFlex = isFlexEnd(run.ends.right);
  const leftFlexWidth = leftIsFlex && !flexOverconstrained
    ? flexMinimum('left', settings, opts) + flexExtra + flexRemainder
    : 0;
  const rightFlexWidth = rightIsFlex && !flexOverconstrained
    ? flexMinimum('right', settings, opts) + flexExtra + (leftIsFlex ? 0 : flexRemainder)
    : 0;

  if (leftIsFlex && leftFlexWidth > settings.fillerWarnWidth + WIDTH_EPSILON) {
    warnings.push(warning(
      'wide-filler',
      `${run.id}:left`,
      `Filler is wider than ${settings.fillerWarnWidth} inches.`,
    ));
  }
  if (rightIsFlex && rightFlexWidth > settings.fillerWarnWidth + WIDTH_EPSILON) {
    warnings.push(warning(
      'wide-filler',
      `${run.id}:right`,
      `Filler is wider than ${settings.fillerWarnWidth} inches.`,
    ));
  }

  const rawPieces = [];
  const gapsAfter = [];
  const addEnd = (side, end) => {
    if (end.type === 'none') return;
    let width = endWidth(end, settings, run._endThickness?.[side]);
    if (isFlexEnd(end)) width = side === 'left' ? leftFlexWidth : rightFlexWidth;
    const kind = FILLER_END_TYPES.has(end.type) ? 'filler' : end.type;
    const piece = {
      id: `${run.id}:${side}`,
      kind,
      role: `end-${side}`,
      cabinetTypeId: kind === 'filler'
        ? CABINET_TYPE_IDS.FILLER
        : CABINET_TYPE_IDS.END_PANEL,
      width,
      auto: isFlexEnd(end),
      ...(end.extend ? { extend: end.extend } : {}),
    };
    const cornerAngle = opts?.endCornerAngles?.[side];
    if (isFlexEnd(end)
      && Number.isFinite(cornerAngle)
      && Math.abs(cornerAngle - 90) > 0.5) {
      piece.cornerAngle = cornerAngle;
    }
    rawPieces.push(piece);
    gapsAfter.push(0);
  };

  const leftGap = endGaps.left;
  const rightGap = endGaps.right;
  addEnd('left', run.ends.left);
  if (gapsAfter.length > 0) gapsAfter[gapsAfter.length - 1] += leftGap;
  for (const item of computedItems) {
    rawPieces.push({
      id: item.id,
      kind: item.kind,
      role: 'item',
      cabinetTypeId: item.kind === 'filler' ? CABINET_TYPE_IDS.FILLER : run.cabinetTypeId,
      width: item.computedWidth,
      auto: item.auto,
      ...itemExtras(item),
    });
    gapsAfter.push(item.gapAfter);
  }
  if (computedItems.length > 0) gapsAfter[gapsAfter.length - 1] += rightGap;
  addEnd('right', run.ends.right);

  let x = run.x + (run.ends.left.type === 'none' ? leftGap : 0);
  const pieces = rawPieces.map((piece, index) => {
    const positioned = {
      ...piece,
      x,
      z: run.z,
      height: run.height,
      depth: piece.depth ?? (piece.kind === 'end_panel' ? teamDoorStyle(settings).thickness : run.depth),
    };
    x += piece.width + gapsAfter[index];
    return positioned;
  });

  return { pieces, warnings, errors };
}

function cabinetAnchorX(left, width, anchor) {
  if (anchor === 'right') return left + width;
  if (anchor === 'center') return left + width / 2;
  return left;
}

function itemMinimum(item, settings) {
  if (item.width !== null) return item.width;
  return item.kind === 'cabinet' ? settings.minCabinetWidth : 0;
}

function itemsMinimum(items, settings) {
  return items.reduce((sum, item) => sum + itemMinimum(item, settings) + (item.gapAfter ?? 0), 0);
}

function outerMinimum(run, side, items, settings, opts) {
  const end = run.ends[side];
  const endMinimum = isFlexEnd(end)
    ? flexMinimum(side, settings, opts)
    : endWidth(end, settings, run._endThickness?.[side]);
  return endMinimum + itemsMinimum(items, settings);
}

/** Space outside an attached column, including its seams and the real end's frame gap. */
export function lineEndMinimum(run, settings, itemId, side) {
  const items = itemsWithGaps(run, settings);
  const index = items.findIndex((item) => item.id === itemId);
  const outerItems = side === 'left' ? items.slice(0, index) : items.slice(index + 1);
  return outerMinimum(run, side, outerItems, settings)
    + endGaps(run, items, settings)[side]
    + (side === 'right' ? items[index].gapAfter : 0);
}

function positionedItemPiece(run, settings, item, width, x, auto, absorbed) {
  return {
    id: item.id,
    kind: item.kind,
    role: 'item',
    cabinetTypeId: item.kind === 'filler' ? CABINET_TYPE_IDS.FILLER : run.cabinetTypeId,
    width,
    auto,
    ...itemExtras(item),
    ...(Math.abs(absorbed ?? 0) > WIDTH_EPSILON ? { absorbed } : {}),
    x,
    z: run.z,
    height: run.height,
    depth: item.depth ?? run.depth,
  };
}

function cabinetWidthWarnings(run, settings, item, width, auto) {
  if (!auto || item.kind !== 'cabinet') return [];
  const warnings = [];
  const maxWidth = run.maxCabinetWidth ?? settings.maxCabinetWidth;
  if (width > maxWidth + WIDTH_EPSILON) {
    warnings.push(warning(
      'wide-cabinet',
      item.id,
      `Cabinet is wider than ${maxWidth} inches.`,
    ));
  }
  if (width < settings.minCabinetWidth - WIDTH_EPSILON) {
    warnings.push(warning(
      'narrow-cabinet',
      item.id,
      `Cabinet is narrower than ${settings.minCabinetWidth} inches.`,
    ));
  }
  return warnings;
}

function interiorLayout(run, settings, items, start, end, leftPin, rightPin, sharingPin) {
  const onLine = Boolean(leftPin.item.attach || rightPin.item.attach);
  const width = onLine ? Math.max(0, end - start) : end - start;
  const fixedWidth = items.reduce(
    (sum, item) => sum + (item.width === null ? 0 : item.width) + item.gapAfter,
    0,
  );
  const autos = items.filter(isAutoItem);
  const available = width - fixedWidth;
  const warnings = [];
  const errors = [];
  let baseWidth = 0;
  let absorberId = null;
  let absorberWidth = 0;

  if (autos.length > 0) {
    const autoSpace = onLine ? Math.max(0, available) : available;
    const roundingItems = sharingPin ? [...items, sharingPin.item] : items;
    baseWidth = autoRounding(run, settings, roundingItems).floor(
      (autoSpace + (sharingPin?.width ?? 0)) / (autos.length + (sharingPin ? 1 : 0)),
    );
    absorberId = autos.find((item) => item.absorb)?.id ?? autos[autos.length - 1].id;
    absorberWidth = autoSpace - baseWidth * (autos.length - 1);
  } else if (Math.abs(available) > WIDTH_EPSILON) {
    errors.push({
      code: 'pin-gap',
      pieceId: rightPin.item.id,
      message: `Pins ${leftPin.item.id} and ${rightPin.item.id} leave an unfilled ${available}-inch gap. Widen a pinned cabinet or add a filler item.`,
    });
  }

  let x = start;
  const pieces = items.map((item) => {
    const auto = isAutoItem(item);
    const itemWidth = auto
      ? item.id === absorberId ? absorberWidth : baseWidth
      : item.width;
    const absorbed = auto && item.id === absorberId ? itemWidth - baseWidth : 0;
    warnings.push(...cabinetWidthWarnings(run, settings, item, itemWidth, auto));
    const piece = positionedItemPiece(run, settings, item, itemWidth, x, auto, absorbed);
    x += itemWidth + item.gapAfter;
    return piece;
  });

  return { pieces, warnings, errors };
}

function pinUnreachableWarning(pin, actualLeft) {
  const actual = cabinetAnchorX(actualLeft, pin.width, placedAt(pin.item));
  return warning(
    'pin-unreachable',
    pin.item.id,
    `Pin requested ${pin.target} inches but was clamped to ${actual} inches.`,
  );
}

/** Apply offsets once, after all width and pin solving has finished. */
function steppedLayout(run, layout) {
  const steps = columnSteps(run);
  if (!steps.size) return layout;
  const warnings = [...layout.warnings];
  const pieces = layout.pieces.map((piece) => {
    const offsets = piece.role === 'item' ? steps.get(piece.id) : null;
    if (!offsets) return piece;
    const top = offsets.top?.value ?? 0;
    const bottom = offsets.bottom?.value ?? 0;
    if (top + bottom > run.height - MIN_CELL_SIZE) {
      warnings.push(warning('column-step-too-big', piece.id, 'Top drop and bottom up leave less than 1 inch of box.'));
      return piece;
    }
    return { ...piece, z: piece.z + bottom, height: piece.height - top - bottom };
  });
  return { ...layout, pieces, warnings };
}

/**
 * Split a run, optionally resolving cabinet pins against wall-local targets,
 * then apply column steps to its root item pieces.
 *
 * @param {object} run
 * @param {object} settings
 * @param {{
 *   endMinWidths?: {left?: number, right?: number},
 *   endCornerAngles?: {left?: number, right?: number},
 *   pinTargets?: Record<string, number>,
 *   lineLabels?: Record<string, string>,
 * }} [opts]
 * @returns {{pieces: object[], warnings: object[], errors: object[]}}
 */
export function splitRun(run, settings, opts) {
  run = withLineEndFillers(run, settings, opts);
  const insidePanels = insideEndPanels(run, settings);
  const stepPanels = stepEndPanels(run, settings);
  const panels = {
    ...(insidePanels.length ? { insidePanels } : {}),
    ...(stepPanels.length ? { stepPanels } : {}),
  };
  const plan = pinPlan(run, settings, opts);
  if (!plan) {
    const layout = splitSegment(run, settings, opts);
    return steppedLayout(run, { ...layout, ...panels });
  }

  const { items, actualPins } = plan;
  const warnings = [...plan.warnings];
  const pieces = [];
  const errors = [];
  const appendLayout = (layout) => {
    pieces.push(...layout.pieces);
    warnings.push(...layout.warnings);
    errors.push(...layout.errors);
  };
  appendLayout(splitSegment(leftSegmentRun(run, plan), settings, opts));

  actualPins.forEach((pin, index) => {
    const pinnedPiece = {
      ...pin.piece,
      x: pin.left,
      width: pin.width,
    };
    pieces.push(pinnedPiece);
    warnings.push(...cabinetWidthWarnings(
      run,
      settings,
      pin.item,
      pin.width,
      Boolean(pin.piece?.auto),
    ));

    const next = actualPins[index + 1];
    if (next) {
      appendLayout(interiorLayout(
        run,
        settings,
        items.slice(pin.itemIndex + 1, next.itemIndex),
        pin.left + pin.width + pin.item.gapAfter,
        next.left,
        pin,
        next,
        plan.sharedWidths[pin.item.id] !== undefined && placedAt(pin.item) === 'left' ? pin
          : plan.sharedWidths[next.item.id] !== undefined && placedAt(next.item) === 'right' ? next
            : null,
      ));
    }
  });

  appendLayout(splitSegment(rightSegmentRun(run, plan), settings, opts));

  return steppedLayout(run, { pieces, warnings, errors, ...panels });
}

/**
 * LL4.1 b: the run edge past an end column was set from the end piece's minimum (line + end piece), so an
 * auto filler there stays at that minimum; the rest of the run takes the leftover as usual.
 */
function withLineEndFillers(run, settings, opts) {
  const sides = ['left', 'right'].filter((side) => opts?.lineEnds?.[side] && isFlexEnd(run.ends[side]));
  if (!sides.length) return run;
  const ends = { ...run.ends };
  for (const side of sides) ends[side] = { ...ends[side], width: flexMinimum(side, settings, opts) };
  return { ...run, ends };
}

/** Auto edge-attached columns share with the autos on their bounded side, independent of history. */
export function lineSharedWidths(run, settings, opts) {
  const items = itemsWithGaps(run, settings);
  const targets = opts?.pinTargets ?? {};
  const placed = items.flatMap((item, itemIndex) => (
    PINNABLE_KINDS.has(item.kind) && placedAt(item) && Number.isFinite(targets[item.id])
      ? [{ item, itemIndex, target: targets[item.id] }] : []
  ));
  const candidates = placed.map(({ item, itemIndex }, index) => {
    if (!item.attach || !isAutoItem(item)) return null;
    const at = placedAt(item);
    if (at !== 'left' && at !== 'right') return null;
    const side = at === 'right' ? 'left' : 'right';
    const neighbour = placed[index + (side === 'left' ? -1 : 1)];
    if (!neighbour && !run.anchors?.[side] && !opts?.lineEnds?.[side]) return null;
    const others = side === 'left'
      ? items.slice(neighbour ? neighbour.itemIndex + 1 : 0, itemIndex)
      : items.slice(itemIndex + 1, neighbour ? neighbour.itemIndex : items.length);
    if (!others.some((other) => isAutoItem(other) && PINNABLE_KINDS.has(other.kind))) return null;
    return { side, neighbour, others };
  });
  // Two columns pointing into one segment both retain their remembered widths.
  const shares = candidates.map((candidate, index) => {
    const other = candidates[index + (candidate?.side === 'left' ? -1 : 1)];
    return candidate && other && candidate.side !== other.side ? null : candidate;
  });
  if (!shares.some(Boolean)) return {};

  const pieces = new Map(splitSegment(run, settings, opts).pieces.map((piece) => [piece.id, piece]));
  const retained = opts?.pinWidths ?? run._pinWidths ?? {};
  const widths = {};
  const widthOf = (entry) => {
    const { item, target } = entry;
    if (widths[item.id] !== undefined) return widths[item.id];
    const share = shares[placed.indexOf(entry)];
    if (!share) return (item.pin?.from === 'return' && item.pin.edge === 'both'
      ? run._returnPins?.[item.id]?.width : undefined)
      ?? item.width ?? retained[item.id] ?? pieces.get(item.id)?.width ?? 0;
    const { side, neighbour, others } = share;
    let boundary = side === 'left' ? run.x : run.x + run.width;
    if (neighbour) {
      const width = widthOf(neighbour);
      const left = neighbour.target - (placedAt(neighbour.item) === 'center'
        ? width / 2 : placedAt(neighbour.item) === 'right' ? width : 0);
      boundary = side === 'left' ? left + width + neighbour.item.gapAfter : left;
    }
    const segmentItems = side === 'left'
      ? [...others, { ...item, gapAfter: 0 }]
      : [item, ...others];
    const segment = {
      ...run,
      x: side === 'left' ? boundary : target,
      width: Math.max(0, side === 'left' ? target - boundary : boundary - target),
      items: segmentItems,
      _lineShareItemId: item.id,
      _pinSplit: { [side === 'left' ? 'right' : 'left']: true,
        ...(neighbour ? { [side]: true } : {}) },
      ends: {
        left: side === 'left' && !neighbour ? run.ends.left : { type: 'none', width: null },
        right: side === 'right' && !neighbour ? run.ends.right : { type: 'none', width: null },
      },
    };
    widths[item.id] = splitSegment(segment, settings, opts).pieces.find((piece) => piece.id === item.id).width;
    return widths[item.id];
  };
  placed.forEach((entry, index) => { if (shares[index]) widthOf(entry); });
  return widths;
}

/**
 * Attached columns land exactly on their lines; return pins clamp so their neighbours still fit.
 * Warn on squeezed line segments and unreachable return pins. Null without a finite target.
 */
function pinPlan(run, settings, opts) {
  const items = itemsWithGaps(run, settings);
  const targets = opts?.pinTargets ?? {};
  const pinnedItems = items.filter((item) => (
    PINNABLE_KINDS.has(item.kind)
    && placedAt(item)
    && Number.isFinite(targets[item.id])
  ));
  if (pinnedItems.length === 0) return null;

  const pass1 = splitSegment(run, settings, opts);
  const pass1Pieces = new Map(pass1.pieces.map((piece) => [piece.id, piece]));
  const retainedPinWidths = opts?.pinWidths ?? run._pinWidths ?? {};
  const sharedWidths = lineSharedWidths(run, settings, opts);
  const pins = pinnedItems.map((item) => {
    const itemIndex = items.findIndex((candidate) => candidate.id === item.id);
    const piece = pass1Pieces.get(item.id);
    const width = (item.pin?.from === 'return' && item.pin.edge === 'both'
      ? run._returnPins?.[item.id]?.width : undefined)
      ?? item.width ?? sharedWidths[item.id] ?? retainedPinWidths[item.id] ?? piece?.width ?? 0;
    const target = targets[item.id];
    return {
      item,
      itemIndex,
      piece,
      width,
      target,
      requestedLeft: target - (placedAt(item) === 'center'
        ? width / 2
        : placedAt(item) === 'right' ? width : 0),
    };
  });

  const leftItems = items.slice(0, pins[0].itemIndex);
  const rightItems = items.slice(pins[pins.length - 1].itemIndex + 1);
  const leftMinimum = outerMinimum(run, 'left', leftItems, settings, opts) + endGaps(run, items, settings).left;
  const rightMinimum = outerMinimum(run, 'right', rightItems, settings, opts)
    + pins[pins.length - 1].item.gapAfter + endGaps(run, items, settings).right;
  const middleMinimums = pins.slice(0, -1).map((pin, index) => (
    itemsMinimum(
      items.slice(pin.itemIndex + 1, pins[index + 1].itemIndex),
      settings,
    ) + pin.item.gapAfter
  ));

  const warnings = [];
  const actualPins = [];
  for (let index = 0; index < pins.length; index += 1) {
    const pin = pins[index];
    const minimumLeft = index === 0
      ? run.x + leftMinimum
      : actualPins[index - 1].left
        + actualPins[index - 1].width
        + middleMinimums[index - 1];
    let requiredAfter = rightMinimum;
    for (let future = index + 1; future < pins.length; future += 1) {
      requiredAfter += middleMinimums[future - 1] + pins[future].width;
    }
    const maximumLeft = run.x + run.width - pin.width - requiredAfter;
    const left = pin.item.attach
      ? pin.requestedLeft
      : Math.max(minimumLeft, Math.min(pin.requestedLeft, maximumLeft));
    const actual = { ...pin, left };
    actualPins.push(actual);
    if (Math.abs(cabinetAnchorX(left, pin.width, placedAt(pin.item)) - pin.target)
      > WIDTH_EPSILON) {
      const unreachable = pinUnreachableWarning(pin, left);
      if (index > 0 && left > pin.requestedLeft + WIDTH_EPSILON) {
        unreachable.message += ' Growing the run cannot widen a middle pin segment; shrink a pinned cabinet or remove a cabinet.';
      }
      warnings.push(unreachable);
    }
  }

  actualPins.forEach((pin, index) => {
    if (!pin.item.attach) return;
    const previous = actualPins[index - 1];
    const next = actualPins[index + 1];
    const before = previous ? pin.left - previous.left - previous.width : pin.left - run.x;
    const after = next ? next.left - pin.left - pin.width : run.x + run.width - pin.left - pin.width;
    if (before < (previous ? middleMinimums[index - 1] : leftMinimum) - WIDTH_EPSILON
      || after < (next ? middleMinimums[index] : rightMinimum) - WIDTH_EPSILON) {
      warnings.push(warning(
        'line-squeeze',
        pin.item.id,
        `Cabinets beside it are below minimum width because of line ${opts?.lineLabels?.[pin.item.id] ?? pin.item.attach.lineId}.`,
      ));
    }
  });

  return { items, actualPins, leftItems, rightItems, warnings, sharedWidths };
}

/** The part of a pinned run left of its first pin, as a run of its own. */
function leftSegmentRun(run, plan) {
  const firstPin = plan.actualPins[0];
  const width = firstPin.left - run.x;
  return {
    ...run,
    x: run.x,
    width: firstPin.item.attach ? Math.max(0, width) : width,
    items: plan.leftItems,
    ...(placedAt(firstPin.item) === 'right' && plan.sharedWidths[firstPin.item.id] !== undefined
      ? { _lineShareItemId: firstPin.item.id, _lineShareItem: firstPin.item, _lineShareWidth: firstPin.width } : {}),
    _pinSplit: { right: true },
    ends: { left: run.ends.left, right: { type: 'none', width: null } },
  };
}

/** The part of a pinned run right of its last pin, as a run of its own. */
function rightSegmentRun(run, plan) {
  const lastPin = plan.actualPins[plan.actualPins.length - 1];
  const rightStart = lastPin.left + lastPin.width + lastPin.item.gapAfter;
  const width = run.x + run.width - rightStart;
  return {
    ...run,
    x: rightStart,
    width: lastPin.item.attach ? Math.max(0, width) : width,
    items: plan.rightItems,
    ...(placedAt(lastPin.item) === 'left' && plan.sharedWidths[lastPin.item.id] !== undefined
      ? { _lineShareItemId: lastPin.item.id, _lineShareItem: lastPin.item, _lineShareWidth: lastPin.width } : {}),
    _pinSplit: { left: true },
    ends: { left: { type: 'none', width: null }, right: run.ends.right },
  };
}

/**
 * How much one run (or one outer pin segment) would have to grow (+) or shrink (−) for its auto
 * boxes to come out on the rounding setting (run flex, SPEC-RF1). Typed widths, end panels, fixed
 * fillers and face frame end gaps stay as they are.
 *
 * - No flex filler: `candidates`, the nearer round box size first, then the other (a tie grows).
 *   Every box typed: the change that makes the run fill exactly.
 * - A flex filler: nothing to round, since the filler takes the leftover. `elastic` is how far the run can
 *   shrink or grow with its boxes staying `box` (the filler between its minimum and one rounding
 *   step per box more), and `raise(box)` the growth that lets the boxes be `box` with the filler at
 *   its minimum.
 */
function roundingNeed(run, settings, opts) {
  const {
    available,
    flex,
    minimumTotal,
    nAuto,
  } = layoutInputs(run, settings, opts);
  const rounding = autoRounding(run, settings, itemsWithGaps(run, settings));
  const sixteenth = (value) => roundTo(value, FILLER_STEP);
  if (flex > 0) {
    const cabSpace = available - minimumTotal;
    if (cabSpace < -WIDTH_EPSILON) {
      return { candidates: nAuto === 0 ? [sixteenth(-cabSpace)] : [], box: null };
    }
    if (nAuto === 0) {
      return { candidates: [], box: null, elastic: { lo: sixteenth(-cabSpace), hi: Infinity } };
    }
    const box = rounding.floor(cabSpace / nAuto);
    const extra = sixteenth(cabSpace - nAuto * box);
    return {
      candidates: [],
      box,
      elastic: { lo: -extra, hi: sixteenth(nAuto * (rounding.above(box) - box) - extra - FILLER_STEP) },
      // A remembered box size that isn't round (FX3: saved before nested cells rounded) isn't kept.
      raise: (target) => (rounding.isRound(target)
        ? sixteenth(nAuto * target + minimumTotal - available)
        : null),
    };
  }
  if (nAuto === 0) {
    return {
      candidates: Math.abs(available) > WIDTH_EPSILON ? [sixteenth(-available)] : [],
      box: null,
    };
  }
  if (available <= WIDTH_EPSILON) return { candidates: [], box: null };
  const per = available / nAuto;
  if (rounding.isRound(per)) {
    return { candidates: [], box: null };
  }
  const down = rounding.floor(per);
  const up = rounding.above(down);
  const grow = sixteenth(nAuto * up - available);
  const shrink = sixteenth(nAuto * down - available);
  const candidates = down > WIDTH_EPSILON && Math.abs(shrink) < Math.abs(grow) - WIDTH_EPSILON
    ? [shrink, grow]
    : [grow, ...(down > WIDTH_EPSILON ? [shrink] : [])];
  return { candidates, box: null };
}

/**
 * What run flex (SPEC-RF1) has to solve for one run: the whole run against both its edges, or, with
 * pins, the part left of the first pin against the left edge and the part right of the last pin
 * against the right edge (between pins nothing can move). Empty when a pin can't reach its target.
 *
 * @returns {{key: 'run'|'left'|'right', edges: ('left'|'right')[], candidates: number[], box: number|null,
 *   elastic?: {lo: number, hi: number}, raise?: (box: number) => number}[]}
 */
export function runFlexNeeds(run, settings, opts) {
  run = withLineEndFillers(run, settings, opts);
  const plan = pinPlan(run, settings, opts);
  if (!plan) return [{ key: 'run', edges: ['left', 'right'], ...roundingNeed(run, settings, opts) }];
  if (plan.warnings.some(({ code }) => code === 'pin-unreachable')) return [];
  return [
    { key: 'left', edges: ['left'], ...roundingNeed(leftSegmentRun(run, plan), settings, opts) },
    { key: 'right', edges: ['right'], ...roundingNeed(rightSegmentRun(run, plan), settings, opts) },
  ];
}

/**
 * Synchronize the number of auto-sized cabinet items with the run's capacity.
 *
 * @param {object} run
 * @param {object} settings
 * @param {{endMinWidths?: {left?: number, right?: number}}} [opts]
 * @returns {object}
 */
export function syncAutoItems(run, settings, opts) {
  if (!run.autoCount) return run;

  const {
    available,
    flex,
    minimumTotal,
    nAutoCabinets,
  } = layoutInputs(run, settings, opts);
  const autoSpace = flex > 0
    ? available - minimumTotal
    : available;
  const maxWidth = run.maxCabinetWidth ?? settings.maxCabinetWidth;
  const target = autoSpace > 0 ? Math.max(1, Math.ceil(autoSpace / maxWidth)) : 0;

  if (target === nAutoCabinets) return run;

  const items = [...runItems(run)];
  if (target > nAutoCabinets) {
    for (let index = nAutoCabinets; index < target; index += 1) {
      items.push({ id: uuid(), kind: 'cabinet', width: null });
    }
  } else {
    let toRemove = nAutoCabinets - target;
    for (let index = items.length - 1; index >= 0 && toRemove > 0; index -= 1) {
      if (items[index].kind === 'cabinet' && items[index].width === null && !items[index].grid) {
        items.splice(index, 1);
        toRemove -= 1;
      }
    }
  }

  return run.items ? { ...run, items } : { ...run, grid: replaceRootItems(run.grid, items) };
}
