import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import { faceRevealsFor } from './faces.js';

const { BASE, UPPER, TALL } = CABINET_TYPE_IDS;

/** The estimator's cabinet_styles ids (ff-job-schedule). */
export const CABINET_STYLE_IDS = { EUROPEAN: 13, INSET: 14, BEADED_INSET: 15 };

export const CABINET_STYLE_LABELS = {
  13: 'European',
  14: 'Inset face frame',
  15: 'Beaded inset face frame',
};

/** The six reveal keys a user can see, rules can change and a manual override can set. */
export const REVEAL_KEYS = ['top', 'bottom', 'left', 'right', 'horizontal', 'vertical'];

export const UPPER_BOTTOM_OPTIONS = ['overhang', 'flush', 'counter'];
export const RUN_TOP_OPTIONS = ['stone', 'wood'];

export const REVEAL_SOURCE_LABELS = {
  style: 'style',
  manual: 'manual',
  'rule:wood-top': 'rule: wood top',
  'rule:upper-flush': 'rule: flush bottom',
  'rule:upper-counter': 'rule: on counter',
  'rule:captured-single': 'rule: captured single',
};

const STYLE_KEYS = ['cabinetStyleId', 'beadWidth', 'profiledEdge'];
const STYLE_ID_VALUES = Object.values(CABINET_STYLE_IDS);

/** Whether a value is a valid stored partial style (room, run or item). */
export function isStyle(style) {
  if (style === undefined || style === null) return true;
  if (typeof style !== 'object' || Array.isArray(style)) return false;
  return Object.entries(style).every(([key, value]) => {
    if (!STYLE_KEYS.includes(key)) return false;
    if (value === null) return true;
    if (key === 'cabinetStyleId') return STYLE_ID_VALUES.includes(value);
    if (key === 'beadWidth') return Number.isFinite(value) && value >= 0;
    return typeof value === 'boolean';
  });
}

/**
 * The effective style: settings.defaultStyle, then each level's `style` in order
 * (room, run, item). Null or missing keys inherit.
 */
export function resolveStyle(settings, ...levels) {
  const resolved = { ...DEFAULT_SETTINGS.defaultStyle, ...settings.defaultStyle };
  for (const level of levels) {
    const style = level?.style;
    if (!style) continue;
    for (const key of STYLE_KEYS) {
      if (style[key] !== undefined && style[key] !== null) resolved[key] = style[key];
    }
  }
  return resolved;
}

export function isInsetStyle(style) {
  return style.cabinetStyleId !== CABINET_STYLE_IDS.EUROPEAN;
}

/**
 * Full reveal values for a style and cabinet type, before rules.
 * Inset values are measured from the box to the frame opening (bead included);
 * `fit` / `pairFit` shrink each face inside its slot; `pair` is the gap between pair doors.
 */
export function styleReveals(style, cabinetTypeId, settings) {
  if (!isInsetStyle(style)) {
    const euro = faceRevealsFor(cabinetTypeId, settings);
    return { ...euro, pair: euro.vertical, fit: 0, pairFit: 0 };
  }
  const frame = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame };
  const bead = style.cabinetStyleId === CABINET_STYLE_IDS.BEADED_INSET ? style.beadWidth : 0;
  const profiled = style.profiledEdge
    ? { ...DEFAULT_SETTINGS.profiledFit, ...settings.profiledFit }
    : null;
  const bottomRail = cabinetTypeId === UPPER ? frame.rail - frame.upperDrop : frame.rail;
  return {
    top: frame.rail + bead,
    bottom: bottomRail + bead,
    left: frame.stile + bead,
    right: frame.stile + bead,
    horizontal: frame.midRail + bead * 2,
    vertical: frame.mullion + bead * 2,
    pair: profiled ? profiled.pairGap : 0,
    fit: profiled ? profiled.edge : 0,
    pairFit: profiled ? profiled.pairEdge : 0,
  };
}

/** One column of faces: no pair door and no side-by-side group anywhere. */
export function isSingleColumn(face) {
  if (face.type) return face.type !== 'pair_door';
  return face.direction === 'vertical' && face.children.every(isSingleColumn);
}

/**
 * Reveals for one cabinet: style, then rules, then manual overrides.
 *
 * @returns {{values: object, sources: Record<string, string>}}
 */
export function cabinetReveals({
  style,
  cabinetTypeId,
  run = {},
  face,
  captured = { left: false, right: false },
  manual = null,
  settings,
}) {
  const values = styleReveals(style, cabinetTypeId, settings);
  const sources = Object.fromEntries(REVEAL_KEYS.map((key) => [key, 'style']));
  const apply = (key, value, source) => {
    values[key] = value;
    sources[key] = source;
  };
  const euro = !isInsetStyle(style);

  if (euro && cabinetTypeId === BASE && run.top === 'wood') {
    apply('top', settings.woodTopReveal ?? DEFAULT_SETTINGS.woodTopReveal, 'rule:wood-top');
  }
  const upperBottom = run.upperBottom ?? 'overhang';
  if (cabinetTypeId === UPPER && upperBottom !== 'overhang') {
    apply('bottom', styleReveals(style, TALL, settings).bottom, `rule:upper-${upperBottom}`);
  }
  if (euro && captured.left && captured.right && isSingleColumn(face)) {
    const reveal = settings.capturedSingleReveal ?? DEFAULT_SETTINGS.capturedSingleReveal;
    apply('left', reveal, 'rule:captured-single');
    apply('right', reveal, 'rule:captured-single');
  }
  for (const key of REVEAL_KEYS) {
    if (Number.isFinite(manual?.[key])) apply(key, manual[key], 'manual');
  }
  return { values, sources };
}

/** The standard top drawer front height for a style (a slot size for face frame styles). */
export function standardDrawerHeight(style, settings) {
  const heights = { ...DEFAULT_SETTINGS.standardDrawerHeights, ...settings.standardDrawerHeights };
  return isInsetStyle(style) ? heights.faceFrame : heights.european;
}

const STANDARD_DRAWER_TYPES = ['drawer_front', 'false_front'];

/**
 * Set every fixed drawer front / false front smaller than settings.standardDrawerBelow (6")
 * to the style's standard height. Returns the same tree when nothing changes.
 */
export function applyStandardDrawers(face, style, settings) {
  if (!face) return face;
  const height = standardDrawerHeight(style, settings);
  const below = settings.standardDrawerBelow ?? DEFAULT_SETTINGS.standardDrawerBelow;
  const visit = (node) => {
    if (node.type) {
      const change = STANDARD_DRAWER_TYPES.includes(node.type)
        && Number.isFinite(node.size)
        && node.size < below
        && node.size !== height;
      return change ? { ...node, size: height } : node;
    }
    const children = node.children.map(visit);
    return children.every((child, index) => child === node.children[index])
      ? node
      : { ...node, children };
  };
  return visit(face);
}

/** How far an upper run's fillers and end panels extend below the box. */
export function panelDrop(run, style, settings) {
  if (run.cabinetTypeId !== UPPER || (run.upperBottom ?? 'overhang') !== 'overhang') return 0;
  if (!isInsetStyle(style)) return Math.max(0, -faceRevealsFor(UPPER, settings).bottom);
  return { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame }.upperDrop;
}
