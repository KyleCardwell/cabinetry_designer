export const DOOR_CONSTRUCTIONS = ['five_piece', 'slab', 'slab_applied'];
export const RAIL_SHAPES = ['flat', 'arch', 'cathedral', 'eyebrow'];
export const DOOR_PROFILE_SLOTS = ['outside', 'inside', 'panel', 'applied'];
export const PANEL_TYPES = ['flat', 'raised'];
export const DOOR_STYLE_KEYS = ['doorStyleId', 'drawerFrontStyleId', 'panelStyleId'];
export const DEFAULT_DESIGN_ID = 'five-piece-square';

export const DOOR_DESIGNS = [
  {
    id: DEFAULT_DESIGN_ID,
    code: '5PC',
    vendor: null,
    description: '5-piece square',
    construction: 'five_piece',
    topRail: { shape: 'flat' },
    bottomRail: { shape: 'flat' },
    slots: ['outside', 'inside', 'panel', 'applied'],
  },
  {
    id: 'slab',
    code: 'Slab',
    vendor: null,
    description: 'Slab',
    construction: 'slab',
    topRail: { shape: 'flat' },
    bottomRail: { shape: 'flat' },
    slots: ['outside'],
  },
  {
    id: 'slab-applied',
    code: 'Slab AM',
    vendor: null,
    description: 'Slab with applied molding',
    construction: 'slab_applied',
    topRail: { shape: 'flat' },
    bottomRail: { shape: 'flat' },
    slots: ['outside', 'applied'],
  },
];

export const DEFAULT_DOOR_STYLE = {
  id: 'default',
  label: 'Std',
  name: 'Team default',
  designId: DEFAULT_DESIGN_ID,
  thickness: 0.8125,
  stiles: { left: 3, right: 3 },
  rails: { top: 3, bottom: 3 },
  mid: { extra: 0 },
  panel: { type: 'flat', thickness: 0.25 },
  profiles: { outside: null, inside: null, panel: null, applied: null },
  arch: { rise: 2 },
  shortFace: { minPanel: 2.125, minRail: 1.625, slabBelow: 4.8125, step: 0.0625 },
};

/** Interim until the team style screen (SPEC-46, 46.3). */
export function teamDoorStyle(settings) {
  return {
    ...DEFAULT_DOOR_STYLE,
    thickness: settings?.doorThickness ?? DEFAULT_DOOR_STYLE.thickness,
  };
}

/** Interim sheet material thickness until materials (SPEC-46.1.1). */
export const SHEET_PANEL_THICKNESS = 0.75;

export function sheetPanelStyle() {
  return {
    ...DEFAULT_DOOR_STYLE,
    id: 'sheet',
    label: 'Sheet',
    name: 'Sheet slab',
    designId: 'slab',
    thickness: SHEET_PANEL_THICKNESS,
  };
}

export function findDoorDesign(designId, designs = DOOR_DESIGNS) {
  return designs.find((design) => design.id === designId) ?? null;
}

const DOOR_STYLE_FIELDS = [
  'id', 'label', 'name', 'designId', 'thickness', 'stiles', 'rails', 'mid',
  'panel', 'profiles', 'arch', 'shortFace',
];
const REQUIRED_DOOR_STYLE_FIELDS = DOOR_STYLE_FIELDS.filter((key) => key !== 'name');
const PART_SIZE_KEYS = ['rails', 'stiles', 'midRails', 'midStiles', 'archRise', 'notes'];

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
const isPositive = (value) => Number.isFinite(value) && value > 0;
const isNonNegative = (value) => Number.isFinite(value) && value >= 0;

function isPositivePair(value, keys) {
  return hasKeys(value, keys) && keys.every((key) => isPositive(value[key]));
}

export function isStyleRef(value) {
  return value === undefined || value === null || isNonEmptyString(value);
}

export function isDoorStyle(doorStyle) {
  return hasKeys(doorStyle, DOOR_STYLE_FIELDS, REQUIRED_DOOR_STYLE_FIELDS)
    && ['id', 'label', 'designId'].every((key) => isNonEmptyString(doorStyle[key]))
    && (doorStyle.name === undefined || typeof doorStyle.name === 'string')
    && isPositive(doorStyle.thickness)
    && isPositivePair(doorStyle.stiles, ['left', 'right'])
    && isPositivePair(doorStyle.rails, ['top', 'bottom'])
    && hasKeys(doorStyle.mid, ['extra'])
    && isNonNegative(doorStyle.mid.extra)
    && hasKeys(doorStyle.panel, ['type', 'thickness'])
    && PANEL_TYPES.includes(doorStyle.panel.type)
    && isPositive(doorStyle.panel.thickness)
    && hasKeys(doorStyle.profiles, DOOR_PROFILE_SLOTS, [])
    && Reflect.ownKeys(doorStyle.profiles).every((key) => doorStyle.profiles[key] === null
      || isNonEmptyString(doorStyle.profiles[key]))
    && hasKeys(doorStyle.arch, ['rise'])
    && isPositive(doorStyle.arch.rise)
    && hasKeys(doorStyle.shortFace, ['minPanel', 'minRail', 'slabBelow', 'step'])
    && ['minPanel', 'minRail', 'step'].every((key) => isPositive(doorStyle.shortFace[key]))
    && isNonNegative(doorStyle.shortFace.slabBelow);
}

export function isDoorStyleList(list) {
  if (list === undefined) return true;
  if (!Array.isArray(list)) return false;
  const ids = new Set();
  const labels = new Set();
  for (const doorStyle of list) {
    if (!isDoorStyle(doorStyle) || doorStyle.id === 'default' || doorStyle.id === 'sheet'
      || ids.has(doorStyle.id) || labels.has(doorStyle.label)) return false;
    ids.add(doorStyle.id);
    labels.add(doorStyle.label);
  }
  return true;
}

function isPartialValues(value, keys, check) {
  return hasKeys(value, keys, [])
    && Reflect.ownKeys(value).length > 0
    && Reflect.ownKeys(value).every((key) => check(value[key]));
}

function isMidSizes(value) {
  return Array.isArray(value) && value.length > 0
    && Array.from(value).every((entry) => hasKeys(entry, ['at', 'width'], ['at'])
      && isPositive(entry.at)
      && (entry.width === undefined || isPositive(entry.width)));
}

export function isPartSizes(sizes) {
  if (!hasKeys(sizes, PART_SIZE_KEYS, []) || Reflect.ownKeys(sizes).length === 0) return false;
  return Reflect.ownKeys(sizes).every((key) => {
    const value = sizes[key];
    if (key === 'rails') return isPartialValues(value, ['top', 'bottom'], isPositive);
    if (key === 'stiles') return isPartialValues(value, ['left', 'right'], isPositive);
    if (key === 'midRails' || key === 'midStiles') return isMidSizes(value);
    if (key === 'archRise') return isPositive(value);
    return isPartialValues(value, ['top', 'bottom', 'left', 'right'], isNonEmptyString);
  });
}
