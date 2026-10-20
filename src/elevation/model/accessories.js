import { isEffectList } from './accessoryEffects.js';
import { gridLeaves } from './grid.js';
import { findLeaf } from './cellTree.js';
import { wallDrawerBoxes } from './drawerBoxes.js';
import { getInteriorNode } from './interiorTree.js';
import { wallInteriors } from './interiors.js';
import { resolveWall } from './room.js';
import { wallRollouts } from './rollouts.js';
import { shelfZone } from './shelves.js';
import { ACCESSORY_PLACES } from './constants.js';
import { PRICING_UNITS, isLabor, isMoney } from './libraryPricing.js';

const ACCESSORY_KEYS = [
  'id', 'name', 'brand', 'model', 'description', 'reportText', 'attachesTo', 'wholeSection',
  'minOpening', 'ownSlides', 'effects', 'pricing', 'price', 'actualCost', 'labor',
];
const OPENING_KEYS = ['width', 'depth', 'height'];

function hasKeys(value, keys) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Reflect.ownKeys(value).every((key) => keys.includes(key))
    && keys.every((key) => Object.hasOwn(value, key));
}

const isText = (value) => typeof value === 'string' && value === value.trim() && value.length <= 120;

export function isAccessory(accessory) {
  return hasKeys(accessory, ACCESSORY_KEYS)
    && typeof accessory.id === 'string' && accessory.id.length > 0
    && typeof accessory.name === 'string' && accessory.name.length > 0 && accessory.name === accessory.name.trim()
    && ['brand', 'model', 'description', 'reportText'].every((key) => isText(accessory[key]))
    && ACCESSORY_PLACES.includes(accessory.attachesTo)
    && typeof accessory.wholeSection === 'boolean'
    && (accessory.attachesTo === 'section' || !accessory.wholeSection)
    && hasKeys(accessory.minOpening, OPENING_KEYS)
    && OPENING_KEYS.every((key) => accessory.minOpening[key] === null
      || (Number.isFinite(accessory.minOpening[key]) && accessory.minOpening[key] > 0))
    && typeof accessory.ownSlides === 'boolean'
    && isEffectList(accessory.effects, accessory.attachesTo)
    && PRICING_UNITS.includes(accessory.pricing)
    && isMoney(accessory.price) && isMoney(accessory.actualCost)
    && isLabor(accessory.labor);
}

export function isAccessoryList(list) {
  if (!Array.isArray(list)) return false;
  const ids = new Set();
  const names = new Set();
  for (const accessory of list) {
    if (!isAccessory(accessory) || ids.has(accessory.id) || names.has(accessory.name.toLowerCase())) return false;
    ids.add(accessory.id);
    names.add(accessory.name.toLowerCase());
  }
  return true;
}

function unusedName(list, base) {
  const names = new Set(list.map((accessory) => accessory.name.toLowerCase()));
  let name = base;
  let number = 2;
  while (names.has(name.toLowerCase())) {
    name = `${base} ${number}`;
    number += 1;
  }
  return name;
}

export function newAccessory(list, id) {
  return {
    id,
    name: unusedName(list, 'New accessory'),
    brand: '',
    model: '',
    description: '',
    reportText: '',
    attachesTo: 'section',
    wholeSection: false,
    minOpening: { width: null, depth: null, height: null },
    ownSlides: false,
    effects: [],
    pricing: 'unit',
    price: null,
    actualCost: null,
    labor: {},
  };
}

export function copyAccessory(list, base, id) {
  return { ...structuredClone(base), id, name: unusedName(list, `${base.name} copy`) };
}

export function findAccessory(id, list) {
  return list.find((accessory) => accessory.id === id) ?? null;
}

export function accessoryText(accessory) {
  return accessory.reportText || accessory.name;
}

/** Resolve stored references against the drawer-clear opening, retaining missing items for repair. */
export function sectionAccessories({ interior, boxes = [], settings, rollouts = new Map() }) {
  const result = new Map();
  for (const section of interior.sections) {
    const node = getInteriorNode(interior.tree, section.path) ?? {};
    if (!node.accessories) continue;
    const opening = { width: section.width, depth: section.depth, height: shelfZone(section, boxes).height };
    const items = node.accessories.map(({ accessoryId, qty = 1 }, index) => {
      const accessory = findAccessory(accessoryId, settings?.accessories ?? []);
      const warnings = [];
      if (!accessory) warnings.push({ code: 'accessory-missing' });
      else if (accessory.attachesTo !== 'section') warnings.push({ code: 'accessory-wrong-place' });
      else {
        const sizes = OPENING_KEYS.filter((dim) => accessory.minOpening[dim] !== null
          && accessory.minOpening[dim] > opening[dim] + 1e-9)
          .map((dim) => ({ dim, needs: accessory.minOpening[dim], has: opening[dim] }));
        if (sizes.length) warnings.push({ code: 'accessory-too-small', sizes });
      }
      return { index, accessoryId, accessory, qty, warnings };
    });
    const counted = items.filter(({ accessory }) => accessory?.attachesTo === 'section');
    const whole = counted.find(({ accessory }) => accessory.wholeSection) ?? null;
    const warnings = whole && (node.rollouts?.count > 0 || rollouts.get(section.path)?.rollouts.length > 0
      || node.shelves?.count > 0 || counted.length > 1)
      ? [{ code: 'accessory-whole-section', name: whole.accessory.name }] : [];
    result.set(section.path, { items, whole, warnings });
  }
  return result;
}

/** Share wall-coordinate interiors, boxes and roll-outs with the shelf pass. */
export function wallAccessories(room, wall, side, settings, shared = {}) {
  const faceLayoutsByRun = shared.faceLayoutsByRun ?? new Map();
  const interiors = shared.interiors ?? wallInteriors(room, wall, side, settings, faceLayoutsByRun);
  const boxes = shared.boxes ?? wallDrawerBoxes(room, wall, side, settings, { interiors, faceLayoutsByRun });
  const rollouts = shared.rollouts ?? wallRollouts(room, wall, side, settings, { interiors, faceLayoutsByRun, boxes });
  const runs = new Map(resolveWall(room, wall, side).runs.map((run) => [run.id, run]));
  return new Map(interiors.map((interior) => [interior.itemId, sectionAccessories({
    interior, boxes: boxes.get(interior.itemId)?.boxes ?? [], rollouts: rollouts.get(interior.itemId),
    leaf: findLeaf(runs.get(interior.runId).grid, interior.itemId), settings,
  })]));
}

/** Stored section accessory picks, including nested grids and interior groups. */
export function* roomAccessoryUses(room) {
  function* sections(node) {
    if (!node) return;
    if (node.children) {
      for (const child of node.children) yield* sections(child);
    } else {
      for (const item of node.accessories ?? []) yield { node: item, key: 'accessoryId' };
    }
  }
  for (const wall of room?.walls ?? []) {
    for (const run of wall.runs ?? []) {
      for (const item of run.grid ? gridLeaves(run.grid) : []) {
        if (item.kind === 'cabinet') yield* sections(item.interior);
      }
    }
  }
}

export function missingAccessories(room, settings) {
  const known = new Set((settings?.accessories ?? []).map(({ id }) => id));
  const missing = new Map();
  for (const { node, key } of roomAccessoryUses(room)) {
    const accessoryId = node[key];
    if (typeof accessoryId !== 'string' || !accessoryId || known.has(accessoryId)) continue;
    if (!missing.has(accessoryId)) missing.set(accessoryId, { accessoryId, roomUses: 0 });
    missing.get(accessoryId).roomUses += 1;
  }
  return [...missing.values()].sort((a, b) => a.accessoryId.localeCompare(b.accessoryId));
}

export function missingAccessoryName(accessoryId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accessoryId)
    ? 'An archived accessory' : `Accessory \`${accessoryId}\``;
}
