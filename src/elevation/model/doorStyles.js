export const DOOR_CONSTRUCTIONS = ['five_piece', 'slab'];
export const SLAB_CORES = ['hardwood', 'mdf'];
export const PANEL_JOINTS = ['curved', 'square'];
export const DESIGN_DEFAULT_KEYS = ['thickness', 'stileWidth', 'panelThickness', 'slabBelow'];
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
    slabCore: null,
    panelJoint: 'curved',
    topRail: { shape: 'flat' },
    bottomRail: { shape: 'flat' },
    slots: ['outside', 'inside', 'panel', 'applied'],
    defaults: { thickness: 0.8125, stileWidth: 3, panelThickness: 0.5, slabBelow: 4.8125 },
  },
  {
    id: 'slab',
    code: 'Slab',
    vendor: null,
    description: 'Slab (hardwood)',
    construction: 'slab',
    slabCore: 'hardwood',
    panelJoint: null,
    topRail: { shape: 'flat' },
    bottomRail: { shape: 'flat' },
    slots: ['outside', 'applied'],
    defaults: { thickness: 0.8125 },
  },
  {
    id: 'slab-mdf',
    code: 'Slab - MDF Core',
    vendor: null,
    description: 'Slab, MDF core, edge banded',
    construction: 'slab',
    slabCore: 'mdf',
    panelJoint: null,
    topRail: { shape: 'flat' },
    bottomRail: { shape: 'flat' },
    slots: ['outside', 'applied'],
    defaults: { thickness: 0.75 },
  },
  {
    id: 'micro-shaker',
    code: 'Micro Shaker',
    vendor: null,
    description: 'Micro shaker, 1 1/2" stiles & rails',
    construction: 'five_piece',
    slabCore: null,
    panelJoint: 'square',
    topRail: { shape: 'flat' },
    bottomRail: { shape: 'flat' },
    slots: ['outside', 'inside', 'panel', 'applied'],
    defaults: { thickness: 0.8125, stileWidth: 1.5, panelThickness: 0.625, slabBelow: 3.9375 },
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
  panel: { type: 'flat', thickness: 0.5 },
  profiles: { outside: null, inside: null, panel: null },
  appliedMoldings: [],
  arch: { rise: 2 },
  shortFace: { minPanel: 2.125, minRail: 1.625, slabBelow: 4.8125, step: 0.0625 },
};

/** The team default style from the Library (SPEC-46.3). */
export function teamDoorStyle(settings) {
  return settings?.teamDoorStyle ?? DEFAULT_DOOR_STYLE;
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
  'panel', 'profiles', 'appliedMoldings', 'arch', 'shortFace',
];
const REQUIRED_DOOR_STYLE_FIELDS = DOOR_STYLE_FIELDS.filter((key) => key !== 'name' && key !== 'appliedMoldings');
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
    && hasKeys(doorStyle.profiles, ['outside', 'inside', 'panel'], [])
    && Reflect.ownKeys(doorStyle.profiles).every((key) => doorStyle.profiles[key] === null
      || isNonEmptyString(doorStyle.profiles[key]))
    && (doorStyle.appliedMoldings === undefined
      || (Array.isArray(doorStyle.appliedMoldings) && doorStyle.appliedMoldings.length <= 6
        && Array.from(doorStyle.appliedMoldings).every((molding) => hasKeys(molding, ['profileId', 'offset'])
          && (molding.profileId === null || isNonEmptyString(molding.profileId))
          && Number.isFinite(molding.offset))))
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
