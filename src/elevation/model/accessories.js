import { findEffect, isEffectList } from './accessoryEffects.js';
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
  'minOpening', 'ownSlides', 'effects', 'pricing', 'price', 'actualCost', 'labor', 'size', 'lengthDeduction',
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
    && hasKeys(accessory.size, OPENING_KEYS)
    && OPENING_KEYS.every((key) => accessory.size[key] === null
      || (Number.isFinite(accessory.size[key]) && accessory.size[key] > 0)
      || (key === 'width' && accessory.size[key] === 'section' && accessory.attachesTo === 'section'))
    && (accessory.lengthDeduction === null || (accessory.attachesTo === 'section'
      && Number.isFinite(accessory.lengthDeduction) && accessory.lengthDeduction >= 0))
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
    size: { width: null, height: null, depth: null },
    lengthDeduction: null,
    ownSlides: false,
    effects: [],
    pricing: 'unit',
    price: null,
    actualCost: null,
    labor: {},
  };
}

/** Older stored accessories have no drawing size or ordered-length deduction. */
export function withAccessoryDefaults(accessory) {
  if (!accessory || typeof accessory !== 'object' || Array.isArray(accessory)) return accessory;
  return {
    ...accessory,
    ...(!Object.hasOwn(accessory, 'size') ? { size: { width: null, height: null, depth: null } } : {}),
    ...(!Object.hasOwn(accessory, 'lengthDeduction') ? { lengthDeduction: null } : {}),
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
    const items = node.accessories.map(({ accessoryId, qty = 1, fromBottom: placed = null }, index) => {
      const accessory = findAccessory(accessoryId, settings?.accessories ?? []);
      const warnings = [];
      let size = null;
      let orderedLength = null;
      let fromBottom = null;
      let centerZ = null;
      let rect = null;
      if (!accessory) warnings.push({ code: 'accessory-missing' });
      else if (accessory.attachesTo !== 'section') warnings.push({ code: 'accessory-wrong-place' });
      else {
        const sizes = OPENING_KEYS.filter((dim) => accessory.minOpening[dim] !== null
          && accessory.minOpening[dim] > opening[dim] + 1e-9)
          .map((dim) => ({ dim, needs: accessory.minOpening[dim], has: opening[dim] }));
        if (sizes.length) warnings.push({ code: 'accessory-too-small', sizes });
        size = {
          width: accessory.size?.width === 'section' ? section.width : accessory.size?.width ?? null,
          height: accessory.size?.height ?? null,
          depth: accessory.size?.depth ?? null,
        };
        if (accessory.lengthDeduction != null) {
          orderedLength = section.width - accessory.lengthDeduction;
          if (orderedLength <= 1e-9) {
            orderedLength = null;
            warnings.push({ code: 'accessory-length', deduction: accessory.lengthDeduction, has: section.width });
          }
        }
        fromBottom = placed;
        if (fromBottom !== null) {
          centerZ = section.z + fromBottom;
          if (size.width !== null && size.height !== null) {
            rect = { x: section.x + (section.width - size.width) / 2,
              z: centerZ - size.height / 2, width: size.width, height: size.height };
          }
          if (centerZ < section.z - 1e-9 || centerZ > section.z + section.height + 1e-9
            || (rect && (rect.x < section.x - 1e-9 || rect.x + rect.width > section.x + section.width + 1e-9
              || rect.z < section.z - 1e-9 || rect.z + rect.height > section.z + section.height + 1e-9))) {
            warnings.push({ code: 'accessory-outside', sectionHeight: section.height });
          }
        }
      }
      return { index, accessoryId, accessory, qty, warnings, size, orderedLength, fromBottom, centerZ, rect };
    });
    const counted = items.filter(({ accessory }) => accessory?.attachesTo === 'section');
    const whole = counted.find(({ accessory }) => accessory.wholeSection) ?? null;
    const warnings = whole && (node.rollouts?.count > 0 || rollouts.get(section.path)?.rollouts.length > 0
      || node.shelves?.count > 0 || node.shelves?.shoe > 0 || counted.length > 1)
      ? [{ code: 'accessory-whole-section', name: whole.accessory.name }] : [];
    const lineBoreRow = counted.some(({ accessory }) => findEffect(accessory, 'line_bore_row'));
    result.set(section.path, { items, whole, warnings, lineBoreRow });
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

/** Stored accessory picks by place, including nested grids, faces and interior groups. */
export function* roomAccessoryUses(room) {
  function* sections(node) {
    if (!node) return;
    if (node.children) {
      for (const child of node.children) yield* sections(child);
    } else {
      for (const item of node.accessories ?? []) yield { node: item, key: 'accessoryId', place: 'section' };
    }
  }
  function* faces(face) {
    if (!face) return;
    if (face.children) {
      for (const child of face.children) yield* faces(child);
    } else if (face.type === 'drawer_front') {
      for (const item of face.drawerBox?.accessories ?? []) {
        yield { node: item, key: 'accessoryId', place: 'drawer_box' };
      }
    }
  }
  for (const wall of room?.walls ?? []) {
    for (const run of wall.runs ?? []) {
      for (const item of run.grid ? gridLeaves(run.grid) : []) {
        if (item.kind !== 'cabinet') continue;
        yield* sections(item.interior);
        yield* faces(item.face);
      }
    }
  }
}

export function missingAccessories(room, settings) {
  const known = new Set((settings?.accessories ?? []).map(({ id }) => id));
  const missing = new Map();
  for (const { node, key, place } of roomAccessoryUses(room)) {
    const accessoryId = node[key];
    if (typeof accessoryId !== 'string' || !accessoryId || known.has(accessoryId)) continue;
    const idAndPlace = JSON.stringify([accessoryId, place]);
    if (!missing.has(idAndPlace)) missing.set(idAndPlace, { accessoryId, place, roomUses: 0 });
    missing.get(idAndPlace).roomUses += 1;
  }
  return [...missing.values()].sort((a, b) => a.accessoryId.localeCompare(b.accessoryId)
    || (a.place === b.place ? 0 : a.place === 'section' ? -1 : 1));
}

export function missingAccessoryName(accessoryId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accessoryId)
    ? 'An archived accessory' : `Accessory \`${accessoryId}\``;
}
