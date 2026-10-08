import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import { belowRunReveal, frameBottomParts } from './bottoms.js';
import { faceRevealsFor } from './faces.js';
import { formatInches } from './units.js';

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
export const RUN_TOP_OPTIONS = ['stone', 'wood', 'crown', 'topMold', 'none'];

export const REVEAL_SOURCE_LABELS = {
  style: 'style',
  manual: 'manual',
  'rule:hanging': 'rule: hanging base',
  'rule:below-run': 'rule: part below',
  'rule:wood-top': 'rule: wood top',
  'rule:upper-flush': 'rule: flush bottom',
  'rule:upper-counter': 'rule: on counter',
  'rule:stacked-seam': 'rule: stacked seam',
  'rule:captured-single': 'rule: captured single',
  'rule:bead-seam': 'rule: bead seam',
  'rule:covered-panel': 'rule: covered panel',
  'rule:t-filler': 'rule: T-filler',
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
 * How far a face frame run's bottom rail hangs below its box (SPEC-36.3): the upper drop on an upper
 * whose doors overhang, and on a base marked hanging. An upper's covered or flush parts set its
 * drop when present (SPEC-46.2.1). Zero for everything else.
 */
export function frameDrop(run, settings) {
  const { upperDrop } = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame };
  if (run.cabinetTypeId === UPPER) {
    const { height } = frameBottomParts(run);
    return height > 0 ? height : (run.upperBottom ?? 'overhang') === 'overhang' ? upperDrop : 0;
  }
  return run.cabinetTypeId === BASE && run.hanging === true ? upperDrop : 0;
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
 * `shared` is the gap between the faces of a group with no rail between (SPEC-36.3).
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
    // SPEC-38.3: the bead is in the gaps beside a beaded box, never in its side reveals.
    left: frame.stile,
    right: frame.stile,
    horizontal: frame.midRail + bead * 2,
    vertical: frame.mullion + bead * 2,
    pair: profiled ? profiled.pairGap : 0,
    fit: profiled ? profiled.edge : 0,
    pairFit: profiled ? profiled.pairEdge : 0,
    shared: profiled ? profiled.sharedGap : 0,
  };
}

/** One column of faces: no pair door and no side-by-side group anywhere. */
export function isSingleColumn(face) {
  if (face.type) return face.type !== 'pair_door';
  return face.direction === 'vertical' && face.children.every(isSingleColumn);
}

/** How a captured Euro cabinet's faces read: single-wide, mixed with pair doors, or neither (SPEC-44). */
export function capturedFaces(face) {
  const collect = (node) => {
    if (node.type) return [node];
    if (node.direction !== 'vertical') return null;
    const children = node.children.map(collect);
    return children.includes(null) ? null : children.flat();
  };
  const leaves = collect(face);
  if (leaves === null) return null;
  const pairs = leaves.filter((leaf) => leaf.type === 'pair_door').length;
  if (pairs === 0) return 'single';
  return pairs < leaves.length ? 'mixed' : null;
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
  seams = { left: false, right: false },
  stacked = { top: false, bottom: false },
  covered = { top: 0, bottom: 0, left: 0, right: 0 },
  tCovers = null,
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
  // A hanging base's bottom reveal is an upper's: the frame's rail hangs below the box (SPEC-36.3).
  if (!euro && cabinetTypeId !== UPPER && runEdges.bottom && frameDrop(run, settings) > 0) {
    apply('bottom', styleReveals(style, UPPER, settings).bottom, 'rule:hanging');
  }
  if (!euro && runEdges.bottom) {
    const { height, doors } = frameBottomParts(run);
    if (height > 0) {
      const bead = style.cabinetStyleId === CABINET_STYLE_IDS.BEADED_INSET ? style.beadWidth : 0;
      apply('bottom', doors === 'flush' ? bead : styleReveals(style, UPPER, settings).bottom, 'rule:below-run');
    }
  }
  const below = euro && runEdges.bottom ? belowRunReveal(run, settings) : null;
  if (below !== null) apply('bottom', below, 'rule:below-run');
  if (stacked.top || stacked.bottom) {
    const seam = stackedSeamReveals(style, settings);
    if (stacked.top) apply('top', seam.lowerTop, 'rule:stacked-seam');
    if (stacked.bottom) apply('bottom', seam.upperBottom, 'rule:stacked-seam');
  }
  if (euro && captured.left && captured.right && capturedFaces(face) !== null) {
    const reveal = settings.capturedSingleReveal ?? DEFAULT_SETTINGS.capturedSingleReveal;
    if (capturedFaces(face) === 'mixed') {
      values.pair -= (reveal - values.left) + (reveal - values.right);
    }
    apply('left', reveal, 'rule:captured-single');
    apply('right', reveal, 'rule:captured-single');
  }
  if (style.cabinetStyleId === CABINET_STYLE_IDS.BEADED_INSET) {
    const stile = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame }.stile;
    if (seams.left) apply('left', stile, 'rule:bead-seam');
    if (seams.right) apply('right', stile, 'rule:bead-seam');
  }
  if (euro) {
    const standard = styleReveals(style, cabinetTypeId, settings);
    for (const key of ['top', 'bottom', 'left', 'right']) {
      if (covered?.[key] > 0) apply(key, standard[key] - covered[key], 'rule:covered-panel');
    }
  }
  // A T-filler covers the front edge (REV-005/006): the face sits that much farther in, and between
  // stacked boxes each face takes half the usual gap beside the flat.
  if (euro && tCovers) {
    for (const key of ['left', 'right']) {
      if (tCovers[key] > 0) apply(key, values[key] + tCovers[key], 'rule:t-filler');
    }
    for (const key of ['top', 'bottom']) {
      if (tCovers[key] > 0) apply(key, tCovers[key] + values.horizontal / 2, 'rule:t-filler');
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
  if (isInsetStyle(style)) return frameDrop(run, settings);
  const below = belowRunReveal(run, settings);
  if (below !== null) return Math.max(0, -below);
  if (run.cabinetTypeId !== UPPER || (run.upperBottom ?? 'overhang') !== 'overhang') return 0;
  return Math.max(0, -faceRevealsFor(UPPER, settings).bottom);
}

/**
 * The bottom of a run's end panels and fillers: how far their faces drop below the box to meet the
 * doors, and the chip detail when they sit on a part the doors stop flush above.
 */
export function endPieceBottom(run, style, settings) {
  const below = isInsetStyle(style) ? null : belowRunReveal(run, settings);
  return {
    drop: panelDrop(run, style, settings),
    chip: below !== null && below > 0 ? below : 0,
  };
}

/** Shop notes for an end panel or filler, from endPieceBottom. */
export function endPieceNotes(kind, bottom) {
  const notes = [];
  if (bottom.chip > 0) notes.push(`chip detail bottom ${formatInches(bottom.chip)}`);
  if (kind === 'filler' && bottom.drop > 0) notes.push(`return up ${formatInches(bottom.drop)}`);
  return notes;
}

/**
 * The gap a run leaves at each seam between two cabinet columns (SPEC-36, FF-004): its own
 * `seamGap`, else twice the bead on beaded inset (the stile covers 3/4" of each box and the bead
 * widens it), else 0.
 */
export function runSeamGap(room, run, settings) {
  if (Number.isFinite(run.seamGap)) return run.seamGap;
  const style = resolveStyle(settings, room, run);
  return style.cabinetStyleId === CABINET_STYLE_IDS.BEADED_INSET ? 2 * style.beadWidth : 0;
}

/** The face frame shape carried by an inset run, or null for European. */
export function runFrame(room, run, settings) {
  const style = resolveStyle(settings, room, run);
  if (!isInsetStyle(style)) return null;
  const frame = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame };
  const bead = style.cabinetStyleId === CABINET_STYLE_IDS.BEADED_INSET ? style.beadWidth : 0;
  return { thickness: frame.thickness, drop: frameDrop(run, settings), bead };
}

/**
 * Whether a run end gets a T-filler (a filler end) or an L-shaped end panel (an end panel end)
 * (SPEC-37, 37.1): the end's own choice, `run.endFiller[side].tFiller`, else the run's setting.
 */
export function endCoverOn(run, side) {
  return run.endFiller?.[side]?.tFiller ?? Boolean(run.tFiller);
}
