import { v4 as uuid } from 'uuid';
import { CABINET_TYPE_IDS } from './constants.js';
import { floorTo, roundTo } from './units.js';

const WIDTH_EPSILON = 1e-6;
const FILLER_STEP = 1 / 16;

function endWidth(end, settings) {
  if (end.type === 'end_panel') return end.width ?? settings.endPanelThickness;
  if (end.type === 'filler' && end.width !== null) return end.width;
  return 0;
}

function isFlexEnd(end) {
  return end.type === 'filler' && end.width === null;
}

function layoutInputs(run, settings) {
  const fixedEnds = endWidth(run.ends.left, settings) + endWidth(run.ends.right, settings);
  const fixedItems = run.items.reduce((sum, item) => (
    sum + (item.width === null ? 0 : item.width)
  ), 0);
  const nAuto = run.items.filter(
    (item) => item.kind === 'cabinet' && item.width === null,
  ).length;
  const flex = Number(isFlexEnd(run.ends.left)) + Number(isFlexEnd(run.ends.right));
  const available = run.width - fixedEnds - fixedItems;

  return { available, flex, nAuto };
}

function warning(code, pieceId, message) {
  return { code, pieceId, message };
}

/**
 * Split a run into positioned end, cabinet, and interior-filler pieces.
 *
 * @param {object} run
 * @param {object} settings
 * @returns {{pieces: object[], warnings: object[], errors: object[]}}
 */
export function splitRun(run, settings) {
  const { available, flex, nAuto } = layoutInputs(run, settings);
  const warnings = [];
  const errors = [];
  const hasAvailableError = available < -WIDTH_EPSILON;
  let autoWidth = 0;
  let flexWidth = 0;
  let flexRemainder = 0;

  if (hasAvailableError) {
    errors.push({ code: 'over-constrained' });
  } else if (flex > 0) {
    const cabSpace = available - flex * settings.fillerMinWidth;
    if (cabSpace < -WIDTH_EPSILON) {
      errors.push({ code: 'over-constrained' });
    } else {
      autoWidth = nAuto > 0 ? floorTo(cabSpace / nAuto, settings.roundTo) : 0;
      const leftover = available - nAuto * autoWidth;
      flexWidth = floorTo(leftover / flex, FILLER_STEP);
      flexRemainder = leftover - flex * flexWidth;
    }
  } else if (nAuto > 0) {
    autoWidth = roundTo(available / nAuto, FILLER_STEP);
    if (Math.abs(autoWidth / settings.roundTo - Math.round(autoWidth / settings.roundTo)) > WIDTH_EPSILON) {
      const firstAuto = run.items.find(
        (item) => item.kind === 'cabinet' && item.width === null,
      );
      warnings.push(warning(
        'widths-not-rounded',
        firstAuto.id,
        `Auto cabinet widths are not multiples of ${settings.roundTo} inches.`,
      ));
    }
  } else if (Math.abs(available) > WIDTH_EPSILON) {
    errors.push({ code: 'does-not-fill' });
  }

  let autoIndex = 0;
  const lastAutoIndex = nAuto - 1;
  const computedItems = run.items.map((item) => {
    if (item.kind !== 'cabinet' || item.width !== null) {
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
    if (!item.auto) continue;
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
  const leftFlexWidth = leftIsFlex ? flexWidth + flexRemainder : 0;
  const rightFlexWidth = rightIsFlex
    ? flexWidth + (leftIsFlex ? 0 : flexRemainder)
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
    rawPieces.push({
      id: `${run.id}:${side}`,
      kind: end.type,
      role: `end-${side}`,
      cabinetTypeId: end.type === 'filler'
        ? CABINET_TYPE_IDS.FILLER
        : CABINET_TYPE_IDS.END_PANEL,
      width,
      auto: isFlexEnd(end),
    });
  };

  addEnd('left', run.ends.left);
  for (const item of computedItems) {
    rawPieces.push({
      id: item.id,
      kind: item.kind,
      role: 'item',
      cabinetTypeId: item.kind === 'cabinet'
        ? run.cabinetTypeId
        : CABINET_TYPE_IDS.FILLER,
      width: item.computedWidth,
      auto: item.auto,
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
      depth: piece.kind === 'end_panel' ? settings.endPanelThickness : run.depth,
    };
    x += piece.width;
    return positioned;
  });

  return { pieces, warnings, errors };
}

/**
 * Synchronize the number of auto-sized cabinet items with the run's capacity.
 *
 * @param {object} run
 * @param {object} settings
 * @returns {object}
 */
export function syncAutoItems(run, settings) {
  if (!run.autoCount) return run;

  const { available, flex, nAuto } = layoutInputs(run, settings);
  const autoSpace = flex > 0
    ? available - flex * settings.fillerMinWidth
    : available;
  const maxWidth = run.maxCabinetWidth ?? settings.maxCabinetWidth;
  const target = autoSpace > 0 ? Math.max(1, Math.ceil(autoSpace / maxWidth)) : 0;

  if (target === nAuto) return run;

  const items = [...run.items];
  if (target > nAuto) {
    for (let index = nAuto; index < target; index += 1) {
      items.push({ id: uuid(), kind: 'cabinet', width: null });
    }
  } else {
    let toRemove = nAuto - target;
    for (let index = items.length - 1; index >= 0 && toRemove > 0; index -= 1) {
      if (items[index].kind === 'cabinet' && items[index].width === null) {
        items.splice(index, 1);
        toRemove -= 1;
      }
    }
  }

  return { ...run, items };
}
