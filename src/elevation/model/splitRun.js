import { v4 as uuid } from 'uuid';
import { CABINET_TYPE_IDS } from './constants.js';
import { replaceRootItems, runItems } from './grid.js';
import { floorTo, roundTo } from './units.js';

const WIDTH_EPSILON = 1e-6;
const FILLER_STEP = 1 / 16;
const FILLER_END_TYPES = new Set(['filler', 'blind']);
const AUTO_KINDS = new Set(['cabinet', 'panel', 'void', 'shelves']);

/** An item that shares leftover width: a cabinet or cell kind with no width. Never a filler. */
function isAutoItem(item) {
  return item.width === null && AUTO_KINDS.has(item.kind);
}

/** A top-level cell's own settings, copied onto its piece. */
function itemExtras(item) {
  return {
    ...(item.depth !== undefined ? { depth: item.depth } : {}),
    ...(item.align !== undefined ? { align: item.align } : {}),
    ...(item.doors !== undefined ? { doors: item.doors } : {}),
    ...(item.shelves !== undefined ? { shelves: { ...item.shelves } } : {}),
  };
}

function endWidth(end, settings) {
  if (end.type === 'end_panel') return end.width ?? settings.endPanelThickness;
  if (FILLER_END_TYPES.has(end.type) && end.width !== null) return end.width;
  return 0;
}

function isFlexEnd(end) {
  return FILLER_END_TYPES.has(end.type) && end.width === null;
}

function flexMinimum(side, settings, opts) {
  return opts?.endMinWidths?.[side] ?? settings.fillerMinWidth;
}

function layoutInputs(run, settings, opts) {
  const items = runItems(run);
  const fixedEnds = endWidth(run.ends.left, settings) + endWidth(run.ends.right, settings);
  const fixedItems = items.reduce((sum, item) => (
    sum + (item.width === null ? 0 : item.width)
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
  const available = run.width - fixedEnds - fixedItems;

  return {
    available,
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
 * Split a run into positioned end, cabinet, and interior-filler pieces.
 *
 * @param {object} run
 * @param {object} settings
 * @param {{
 *   endMinWidths?: {left?: number, right?: number},
 *   endCornerAngles?: {left?: number, right?: number},
 * }} [opts]
 * @returns {{pieces: object[], warnings: object[], errors: object[]}}
 */
function splitRunLegacy(run, settings, opts) {
  const items = runItems(run);
  const {
    available,
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
      autoWidth = nAuto > 0 ? floorTo(cabSpace / nAuto, settings.roundTo) : 0;
      const leftover = available - nAuto * autoWidth;
      const extra = leftover - minimumTotal;
      flexExtra = floorTo(extra / flex, FILLER_STEP);
      flexRemainder = extra - flex * flexExtra;
    }
  } else if (nAuto > 0) {
    autoWidth = roundTo(available / nAuto, FILLER_STEP);
    if (Math.abs(autoWidth / settings.roundTo - Math.round(autoWidth / settings.roundTo)) > WIDTH_EPSILON) {
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

  let autoIndex = 0;
  const lastAutoIndex = nAuto - 1;
  const computedItems = items.map((item) => {
    if (!isAutoItem(item)) {
      return { ...item, computedWidth: item.width, auto: false };
    }

    let computedWidth = autoWidth;
    if (flex === 0 && !hasAvailableError && autoIndex === lastAutoIndex) {
      computedWidth = available - autoWidth * lastAutoIndex;
    }
    autoIndex += 1;
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
  const addEnd = (side, end) => {
    if (end.type === 'none') return;
    let width = endWidth(end, settings);
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
    };
    const cornerAngle = opts?.endCornerAngles?.[side];
    if (isFlexEnd(end)
      && Number.isFinite(cornerAngle)
      && Math.abs(cornerAngle - 90) > 0.5) {
      piece.cornerAngle = cornerAngle;
    }
    rawPieces.push(piece);
  };

  addEnd('left', run.ends.left);
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
  }
  addEnd('right', run.ends.right);

  let x = run.x;
  const pieces = rawPieces.map((piece) => {
    const positioned = {
      ...piece,
      x,
      z: run.z,
      height: run.height,
      depth: piece.depth ?? (piece.kind === 'end_panel' ? settings.endPanelThickness : run.depth),
    };
    x += piece.width;
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
  return items.reduce((sum, item) => sum + itemMinimum(item, settings), 0);
}

function outerMinimum(run, side, items, settings, opts) {
  const end = run.ends[side];
  const endMinimum = isFlexEnd(end)
    ? flexMinimum(side, settings, opts)
    : endWidth(end, settings);
  return endMinimum + itemsMinimum(items, settings);
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

function interiorLayout(run, settings, items, start, end, leftPin, rightPin) {
  const width = end - start;
  const fixedWidth = items.reduce(
    (sum, item) => sum + (item.width === null ? 0 : item.width),
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
    baseWidth = floorTo(available / autos.length, settings.roundTo);
    absorberId = autos.find((item) => item.absorb)?.id ?? autos[autos.length - 1].id;
    absorberWidth = available - baseWidth * (autos.length - 1);
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
    x += itemWidth;
    return piece;
  });

  return { pieces, warnings, errors };
}

function pinUnreachableWarning(pin, actualLeft) {
  const actual = cabinetAnchorX(actualLeft, pin.width, pin.item.pin.anchor);
  return warning(
    'pin-unreachable',
    pin.item.id,
    `Pin requested ${pin.target} inches but was clamped to ${actual} inches.`,
  );
}

/**
 * Split a run, optionally resolving cabinet pins against wall-local targets.
 * With no finite pin targets this delegates byte-for-byte to the legacy solver.
 *
 * @param {object} run
 * @param {object} settings
 * @param {{
 *   endMinWidths?: {left?: number, right?: number},
 *   endCornerAngles?: {left?: number, right?: number},
 *   pinTargets?: Record<string, number>,
 * }} [opts]
 * @returns {{pieces: object[], warnings: object[], errors: object[]}}
 */
export function splitRun(run, settings, opts) {
  const items = runItems(run);
  const targets = opts?.pinTargets ?? {};
  const pinnedItems = items.filter((item) => (
    item.kind === 'cabinet'
    && item.pin
    && Number.isFinite(targets[item.id])
  ));
  if (pinnedItems.length === 0) return splitRunLegacy(run, settings, opts);

  const pass1 = splitRunLegacy(run, settings, opts);
  const pass1Pieces = new Map(pass1.pieces.map((piece) => [piece.id, piece]));
  const retainedPinWidths = opts?.pinWidths ?? run._pinWidths ?? {};
  const pins = pinnedItems.map((item) => {
    const itemIndex = items.findIndex((candidate) => candidate.id === item.id);
    const piece = pass1Pieces.get(item.id);
    const width = item.width ?? retainedPinWidths[item.id] ?? piece?.width ?? 0;
    const target = targets[item.id];
    return {
      item,
      itemIndex,
      piece,
      width,
      target,
      requestedLeft: target - (item.pin.anchor === 'center'
        ? width / 2
        : item.pin.anchor === 'right' ? width : 0),
    };
  });

  const leftItems = items.slice(0, pins[0].itemIndex);
  const rightItems = items.slice(pins[pins.length - 1].itemIndex + 1);
  const leftMinimum = outerMinimum(run, 'left', leftItems, settings, opts);
  const rightMinimum = outerMinimum(run, 'right', rightItems, settings, opts);
  const middleMinimums = pins.slice(0, -1).map((pin, index) => (
    itemsMinimum(
      items.slice(pin.itemIndex + 1, pins[index + 1].itemIndex),
      settings,
    )
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
    const left = Math.max(minimumLeft, Math.min(pin.requestedLeft, maximumLeft));
    const actual = { ...pin, left };
    actualPins.push(actual);
    if (Math.abs(cabinetAnchorX(left, pin.width, pin.item.pin.anchor) - pin.target)
      > WIDTH_EPSILON) {
      const unreachable = pinUnreachableWarning(pin, left);
      if (index > 0 && left > pin.requestedLeft + WIDTH_EPSILON) {
        unreachable.message += ' Growing the run cannot widen a middle pin segment; shrink a pinned cabinet or remove a cabinet.';
      }
      warnings.push(unreachable);
    }
  }

  const pieces = [];
  const errors = [];
  const appendLayout = (layout) => {
    pieces.push(...layout.pieces);
    warnings.push(...layout.warnings);
    errors.push(...layout.errors);
  };
  appendLayout(splitRunLegacy({
    ...run,
    x: run.x,
    width: actualPins[0].left - run.x,
    items: leftItems,
    ends: { left: run.ends.left, right: { type: 'none', width: null } },
  }, settings, opts));

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
        pin.left + pin.width,
        next.left,
        pin,
        next,
      ));
    }
  });

  const lastPin = actualPins[actualPins.length - 1];
  appendLayout(splitRunLegacy({
    ...run,
    x: lastPin.left + lastPin.width,
    width: run.x + run.width - lastPin.left - lastPin.width,
    items: rightItems,
    ends: { left: { type: 'none', width: null }, right: run.ends.right },
  }, settings, opts));

  return { pieces, warnings, errors };
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
