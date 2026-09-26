import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import { belowRunReveal } from './bottoms.js';
import { faceRevealsFor } from './faces.js';

const { UPPER, TALL } = CABINET_TYPE_IDS;

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
export const RUN_TOP_OPTIONS = ['stone', 'wood', 'crown', 'topMold', 'none'];

export const REVEAL_SOURCE_LABELS = {
  style: 'style',
  manual: 'manual',
  'rule:below-run': 'rule: part below',
  'rule:wood-top': 'rule: wood top',
  'rule:upper-flush': 'rule: flush bottom',
  'rule:upper-counter': 'rule: on counter',
  'rule:stacked-seam': 'rule: stacked seam',
  'rule:captured-single': 'rule: captured single',
  'rule:covered-panel': 'rule: covered panel',
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

/** REV-009/010: the reveals either side of a seam where one box sits on another. */
export function stackedSeamReveals(style, settings) {
  if (!isInsetStyle(style)) {
    return {
      upperBottom: settings.stackedUpperBottom ?? DEFAULT_SETTINGS.stackedUpperBottom,
      lowerTop: settings.stackedLowerTop ?? DEFAULT_SETTINGS.stackedLowerTop,
    };
  }
  const frame = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame };
  const bead = style.cabinetStyleId === CABINET_STYLE_IDS.BEADED_INSET ? style.beadWidth : 0;
  const half = frame.rail / 2 + bead;   // one shared rail covers both boxes
  return { upperBottom: half, lowerTop: half };
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
  stacked = { top: false, bottom: false },
  covered = { top: 0, bottom: 0, left: 0, right: 0 },
  runEdges = { top: true, bottom: true },
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

  if (euro && run.top === 'wood' && runEdges.top) {
    apply('top', settings.woodTopReveal ?? DEFAULT_SETTINGS.woodTopReveal, 'rule:wood-top');
  }
  const upperBottom = run.upperBottom ?? 'overhang';
  if (cabinetTypeId === UPPER && upperBottom !== 'overhang') {
    apply('bottom', styleReveals(style, TALL, settings).bottom, `rule:upper-${upperBottom}`);
  }
  const below = euro && runEdges.bottom ? belowRunReveal(run, settings) : null;
  if (below !== null) apply('bottom', below, 'rule:below-run');
  if (stacked.top || stacked.bottom) {
    const seam = stackedSeamReveals(style, settings);
    if (stacked.top) apply('top', seam.lowerTop, 'rule:stacked-seam');
    if (stacked.bottom) apply('bottom', seam.upperBottom, 'rule:stacked-seam');
  }
  if (euro && captured.left && captured.right && isSingleColumn(face)) {
    const reveal = settings.capturedSingleReveal ?? DEFAULT_SETTINGS.capturedSingleReveal;
    apply('left', reveal, 'rule:captured-single');
    apply('right', reveal, 'rule:captured-single');
  }
  if (euro) {
    const standard = styleReveals(style, cabinetTypeId, settings);
    for (const key of ['top', 'bottom', 'left', 'right']) {
      if (covered?.[key] > 0) apply(key, standard[key] - covered[key], 'rule:covered-panel');
    }
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

/** How far a run's fillers and end panels extend below the box: to the doors. */
export function panelDrop(run, style, settings) {
  if (!isInsetStyle(style)) {
    const below = belowRunReveal(run, settings);
    if (below !== null) return Math.max(0, -below);
  }
  if (run.cabinetTypeId !== UPPER || (run.upperBottom ?? 'overhang') !== 'overhang') return 0;
  if (!isInsetStyle(style)) return Math.max(0, -faceRevealsFor(UPPER, settings).bottom);
  return { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame }.upperDrop;
}
