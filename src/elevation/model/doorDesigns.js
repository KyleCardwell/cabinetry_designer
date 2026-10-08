import { DOOR_CONSTRUCTIONS, DOOR_DESIGNS, RAIL_SHAPES } from './doorStyles.js';

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
