import { DEFAULT_SETTINGS } from '../elevation/model/constants.js';
import { partNumbers } from '../elevation/model/partNumbers.js';
import { wallInteriorData } from '../elevation/model/shelves.js';
import { resolveSlide } from '../elevation/model/slides.js';
import { WALL_SIDES } from '../elevation/model/wallSides.js';

const SPEC_OPTIONS = {
  sideMaterial: ['Baltic Birch Ply', 'Soft Maple'],
  sideThickness: ['1/2"', '5/8"'],
  bottomMaterial: ['1/4" Baltic Birch Ply', '1/4" Maple Veneer'],
  topEdge: ['Flat Flush'],
  bottomPlacement: ['Standard'],
  assembly: ['Pre-finished & assembled', 'Assembled w/ clear coat'],
};

function boxSpec(values) {
  return Object.fromEntries(Object.entries(SPEC_OPTIONS).map(([key, choices]) => {
    const value = values[key].trim();
    const options = choices.map((choice) => ({
      label: key === 'topEdge' ? 'Flat Flush (w/ eased edges)' : choice,
      checked: value.toLowerCase() === choice.toLowerCase(),
    }));
    return [key, { options, writeIn: value && !options.some(({ checked }) => checked) ? value : null }];
  }));
}

function instructionsFor(box, rollout, roomMount, headerClips) {
  const notes = rollout ? ['Scoop'] : [];
  if (box.slide.mount === 'undermount' && roomMount === 'side') notes.push('Notch & Undermount Clips');
  if (box.slide.mount === 'side' && roomMount === 'undermount') notes.push('No Notch', 'No Clips');
  if (box.clips != null && box.clips !== headerClips) {
    notes.push(box.clips === 'standard' ? 'Use Standard Mounting Clips' : 'Use Adjustable Mounting Clips');
  }
  notes.push(...(box.notes ?? []));
  return notes.join(', ');
}

function groupedLines(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const { rollout, cab, height, width, depth, instructions } = entry;
    const key = JSON.stringify([rollout, cab, height, width, depth, instructions]);
    if (groups.has(key)) groups.get(key).qty += 1;
    else groups.set(key, { ...entry, qty: 1 });
  }
  const numberOrder = (cab) => cab ?? Infinity;
  return [...groups.values()].sort((a, b) => Number(a.rollout) - Number(b.rollout)
    || a.height - b.height
    || numberOrder(a.cab) - numberOrder(b.cab)
    || a.width - b.width
    || a.depth - b.depth
    || a.instructions.localeCompare(b.instructions))
    .map(({ cab, qty, height, width, depth, instructions }) => ({ cab, qty, height, width, depth, instructions }));
}

/** Collect ProBox's outside box sizes using the same part numbers and interiors as shipping. */
export function proBoxOrder(room, settings, header) {
  const values = { ...DEFAULT_SETTINGS.drawerBoxOrder, ...settings.drawerBoxOrder, ...header.drawerBoxOrder };
  const slide = resolveSlide(settings);
  const undermount = slide.mount === 'undermount';
  const headerClips = undermount ? (header.faceFrame ? 'adjustable' : 'standard') : null;
  const comments = [values.comments.trim()].filter(Boolean);
  if (undermount && header.faceFrame) comments.push('Use Adjustable Mounting Clips Except As Noted');
  const { byKey, warnings: numberWarnings } = partNumbers(room, settings);
  const warnings = [...numberWarnings];
  const entries = [];
  const add = (box, itemId, rollout = false) => {
    const key = box.kind === 'rot' ? `${itemId}:rot:${box.path}` : itemId;
    const cab = byKey.get(key) ?? null;
    if (![box.height, box.width, box.depth].every((value) => Number.isFinite(value) && value > 0)) {
      warnings.push({ code: 'report-drawer-box-unsized',
        message: `Cab ${cab ?? '?'}: a drawer box has no size; not on the ProBox order.` });
      return;
    }
    entries.push({ rollout, cab, height: box.height, width: box.width, depth: box.depth,
      instructions: instructionsFor(box, rollout, slide.mount, headerClips) });
  };
  for (const wall of room?.walls ?? []) {
    for (const side of WALL_SIDES) {
      const data = wallInteriorData(room, wall, side, settings);
      for (const [itemId, { boxes }] of data.boxes) {
        for (const box of boxes) add(box, itemId);
      }
      for (const [itemId, sections] of data.rollouts) {
        for (const { rollouts } of sections.values()) {
          for (const rollout of rollouts) add(rollout, itemId, true);
        }
      }
    }
  }
  return {
    jobName: header.job ? `${header.job} - ${header.orderRoom}` : header.orderRoom,
    spec: boxSpec(values),
    options: { notch: undermount, clips: undermount,
      brand: undermount ? `${headerClips.toUpperCase()} ${slide.brand.toUpperCase()}` : '' },
    comments, lines: groupedLines(entries), warnings,
  };
}
