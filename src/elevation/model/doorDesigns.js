import { DOOR_CONSTRUCTIONS, DOOR_DESIGNS, RAIL_SHAPES, teamDoorStyle } from './doorStyles.js';

export const DESIGN_SLOTS = {
  five_piece: ['outside', 'inside', 'panel', 'applied'],
  slab: ['outside'],
  slab_applied: ['outside', 'applied'],
};
export const SEEDED_DESIGN_IDS = ['five-piece-square', 'slab', 'slab-applied'];

const DESIGN_FIELDS = [
  'id', 'code', 'vendor', 'description', 'construction', 'topRail', 'bottomRail', 'slots',
];

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Allowed own keys, with every required key present. */
function hasKeys(value, allowed, required = allowed) {
  return isPlainObject(value)
    && Reflect.ownKeys(value).every((key) => allowed.includes(key))
    && required.every((key) => Object.hasOwn(value, key));
}

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const isTrimmedString = (value) => isNonEmptyString(value) && value === value.trim();
const isRail = (value) => hasKeys(value, ['shape']) && RAIL_SHAPES.includes(value.shape);

export function isDoorDesign(design) {
  return hasKeys(design, DESIGN_FIELDS)
    && isNonEmptyString(design.id)
    && isTrimmedString(design.code)
    && (design.vendor === null || isTrimmedString(design.vendor))
    && typeof design.description === 'string'
    && DOOR_CONSTRUCTIONS.includes(design.construction)
    && isRail(design.topRail)
    && isRail(design.bottomRail)
    && Array.isArray(design.slots)
    && design.slots.length === DESIGN_SLOTS[design.construction].length
    && DESIGN_SLOTS[design.construction].every((slot, index) => design.slots[index] === slot);
}

export function isDoorDesignList(list) {
  if (!Array.isArray(list)) return false;
  const ids = new Set();
  const codes = new Set();
  for (const design of list) {
    if (!isDoorDesign(design) || ids.has(design.id) || codes.has(design.code.toLowerCase())) {
      return false;
    }
    ids.add(design.id);
    codes.add(design.code.toLowerCase());
  }
  return SEEDED_DESIGN_IDS.every((id) => {
    const design = list.find((entry) => entry.id === id);
    const seeded = DOOR_DESIGNS.find((entry) => entry.id === id);
    return design !== undefined
      && design.construction === seeded.construction
      && design.topRail.shape === seeded.topRail.shape
      && design.bottomRail.shape === seeded.bottomRail.shape;
  });
}

/** An independent copy with a fresh identity and the first unused copy code. */
export function newDoorDesign(designs, base, id) {
  const codes = new Set(designs.map((design) => design.code.toLowerCase()));
  let code = `${base.code} copy`;
  let number = 2;
  while (codes.has(code.toLowerCase())) {
    code = `${base.code} copy ${number}`;
    number += 1;
  }
  return { ...structuredClone(base), id, code };
}

/** Team default first, followed by matching styles in room and style order. */
export function doorDesignUses(settings, rooms, designId) {
  const uses = teamDoorStyle(settings).designId === designId ? [{ level: 'team' }] : [];
  for (const room of rooms) {
    for (const style of room.doorStyles ?? []) {
      if (style.designId === designId) {
        uses.push({ level: 'room', roomId: room.id, styleId: style.id, label: style.label });
      }
    }
  }
  return uses;
}

/** The designs a room's styles name that the library doesn't have (SPEC-46.3.1). */
export function missingDoorDesigns(room, designs) {
  const designIds = new Set(designs.map((design) => design.id));
  const missing = new Map();
  for (const style of room.doorStyles ?? []) {
    if (designIds.has(style.designId)) continue;
    if (!missing.has(style.designId)) {
      missing.set(style.designId, { designId: style.designId, styles: [] });
    }
    missing.get(style.designId).styles.push({ styleId: style.id, label: style.label });
  }
  return [...missing.values()];
}
