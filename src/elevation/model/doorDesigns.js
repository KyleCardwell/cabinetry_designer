import { DESIGN_DEFAULT_KEYS, DOOR_CONSTRUCTIONS, DOOR_DESIGNS, PANEL_JOINTS, RAIL_SHAPES, SLAB_CORES } from './doorStyles.js';

export const DESIGN_SLOTS = {
  five_piece: ['outside', 'inside', 'panel', 'applied'],
  slab: ['outside', 'applied'],
};
export const SEEDED_DESIGN_IDS = ['five-piece-square', 'slab', 'slab-mdf'];

const DESIGN_FIELDS = [
  'id', 'code', 'vendor', 'description', 'construction', 'slabCore', 'panelJoint',
  'topRail', 'bottomRail', 'slots', 'defaults',
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
    && (design.construction === 'slab'
      ? SLAB_CORES.includes(design.slabCore) && design.panelJoint === null
      : design.slabCore === null && PANEL_JOINTS.includes(design.panelJoint))
    && hasKeys(design.defaults, DESIGN_DEFAULT_KEYS, [])
    && Reflect.ownKeys(design.defaults).every((key) => Number.isFinite(design.defaults[key]) && design.defaults[key] > 0)
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
      && design.slabCore === seeded.slabCore
      && design.topRail.shape === seeded.topRail.shape
      && design.bottomRail.shape === seeded.bottomRail.shape;
  });
}

/** Bring a saved design into today's shape without mutating it or writing it back. */
export function migrateDoorDesign(design) {
  if (!isPlainObject(design)) return design;
  const construction = design.construction === 'slab_applied' ? 'slab' : design.construction;
  if (!DOOR_CONSTRUCTIONS.includes(construction)) return design;
  const id = design.id === 'slab-applied' ? 'slab-mdf' : design.id;
  const seed = DOOR_DESIGNS.find((entry) => entry.id === id);
  const changes = {
    id,
    construction,
    slabCore: construction === 'five_piece' ? null
      : design.construction === 'slab_applied' ? 'mdf' : design.slabCore ?? 'hardwood',
    panelJoint: construction === 'slab' ? null : design.panelJoint ?? 'curved',
    defaults: design.defaults === undefined ? structuredClone(seed?.defaults ?? {}) : design.defaults,
  };
  if (id === 'slab-mdf') {
    if (design.code === 'Slab AM') changes.code = seed.code;
    if (design.description === 'Slab with applied molding') changes.description = seed.description;
  }
  if (id === 'slab' && design.description === 'Slab') changes.description = seed.description;
  const slots = DESIGN_SLOTS[construction];
  if (!Array.isArray(design.slots) || design.slots.length !== slots.length
    || slots.some((slot, index) => design.slots[index] !== slot)) changes.slots = [...slots];
  return Object.entries(changes).every(([key, value]) => design[key] === value)
    ? design : { ...design, ...changes };
}

/** A versioned door-design library file, matching the profile-file envelope. */
export function doorDesignFile(designs) {
  return { kind: 'door-designs', version: 1, designs };
}

/** Migrate imported designs before the import reducer validates the library. */
export function parseDoorDesignFile(text) {
  try {
    const file = JSON.parse(text);
    return file?.kind === 'door-designs' && file.version === 1 && Array.isArray(file.designs)
      ? file.designs.map(migrateDoorDesign) : null;
  } catch {
    return null;
  }
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
