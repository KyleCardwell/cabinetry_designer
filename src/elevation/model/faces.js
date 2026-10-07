import { DEFAULT_SETTINGS } from './constants.js';
import { isPartSizes, isStyleRef } from './doorStyles.js';

/** Leaf face types — the same values as ff-job-schedule FACE_NAMES. */
export const FACE_TYPES = ['door', 'pair_door', 'drawer_front', 'false_front', 'panel', 'open'];

export const FACE_TYPE_LABELS = {
  door: 'Door',
  pair_door: 'Pair door',
  drawer_front: 'Drawer front',
  false_front: 'False front',
  panel: 'Panel',
  open: 'Open',
};

/** 'vertical' stacks children top to bottom; 'horizontal' places them left to right. */
export const FACE_DIRECTIONS = ['vertical', 'horizontal'];

/** An auto section smaller than this (inches) produces a 'face-too-small' warning. */
export const MIN_FACE_SIZE = 1;

export const ROOT_FACE_PATH = 'r';

const ZERO_REVEALS = { top: 0, bottom: 0, left: 0, right: 0, horizontal: 0, vertical: 0 };

function isSize(size) {
  return size === null || (Number.isFinite(size) && size > 0);
}

/** Whether `noRail` is a sorted list of seams (i = between children i and i + 1) that lie between two leaves. */
function isSeamList(node) {
  const { noRail, children } = node;
  return Array.isArray(noRail)
    && noRail.length > 0
    && noRail.every((seam, index) => Number.isInteger(seam)
      && seam >= 0
      && seam <= children.length - 2
      && (index === 0 || seam > noRail[index - 1])
      && Boolean(children[seam].type)
      && Boolean(children[seam + 1].type));
}

/**
 * Whether a value is a valid stored face node (recursively).
 * A group may carry noRail, a sorted list of seams with no rail or mullion (SPEC-36.3): seam i is between sections i and i + 1, and both must be leaves.
 */
export function isFaceNode(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  if (!isSize(node.size)) return false;
  if (FACE_TYPES.includes(node.type)) {
    return node.children === undefined && node.direction === undefined && node.noRail === undefined
      && isStyleRef(node.styleId)
      && (node.sizes === undefined || isPartSizes(node.sizes))
      && (node.hinge === undefined || (node.type === 'door' && (node.hinge === 'left' || node.hinge === 'right')));
  }
  return node.type === undefined
    && FACE_DIRECTIONS.includes(node.direction)
    && Array.isArray(node.children)
    && node.children.length >= 2
    && node.children.every(isFaceNode)
    && (node.noRail === undefined || isSeamList(node));
}

/** The face a cabinet shows before anyone edits it. */
export function defaultFace(width, settings) {
  const threshold = settings.pairDoorAboveWidth ?? DEFAULT_SETTINGS.pairDoorAboveWidth;
  return { type: width > threshold ? 'pair_door' : 'door', size: null };
}

/** The six reveal values for a cabinet type. */
export function faceRevealsFor(cabinetTypeId, settings) {
  return {
    ...ZERO_REVEALS,
    ...(settings.faceReveals?.[cabinetTypeId] ?? DEFAULT_SETTINGS.faceReveals[cabinetTypeId]),
  };
}

/** The rectangle the faces fill: the piece minus its edge reveals. */
export function faceArea(piece, reveals) {
  return {
    x: piece.x + reveals.left,
    z: piece.z + reveals.bottom,
    width: piece.width - reveals.left - reveals.right,
    height: piece.height - reveals.top - reveals.bottom,
  };
}

/**
 * Resolve a face tree into true face rectangles, in wall coordinates.
 * A pair_door leaf produces two rectangles with the same path (half 'left' / 'right').
 * A face beside a turned-off seam carries `opening`: the path of the first face of its shared opening (SPEC-36.3).
 *
 * @returns {{faces: {path, type, half?, x, z, width, height}[], warnings: {code, path}[]}}
 */
export function resolveFaces(face, area, reveals) {
  const faces = [];
  const warnings = [];

  const pairGap = reveals.pair ?? reveals.vertical;
  const fit = reveals.fit ?? 0;
  const pairFit = reveals.pairFit ?? fit;

  const shared = Number.isFinite(reveals.shared) ? reveals.shared : null;

  const placeLeaf = (node, rect, path, inset, opening) => {
    const leaf = {
      x: rect.x + inset.left,
      z: rect.z + inset.bottom,
      width: rect.width - (inset.left + inset.right),
      height: rect.height - (inset.top + inset.bottom),
    };
    const extra = opening ? { opening } : {};
    if (node.type === 'pair_door') {
      const half = (leaf.width - pairGap) / 2;
      faces.push({
        path, type: node.type, half: 'left', x: leaf.x, z: leaf.z, width: half, height: leaf.height, ...extra,
      });
      faces.push({
        path,
        type: node.type,
        half: 'right',
        x: leaf.x + half + pairGap,
        z: leaf.z,
        width: half,
        height: leaf.height,
        ...extra,
      });
    } else {
      faces.push({ path, type: node.type, ...leaf, ...extra, ...(node.hinge ? { hinge: node.hinge } : {}) });
    }
  };

  const place = (node, rect, path) => {
    if (node.type) {
      const side = node.type === 'pair_door' ? pairFit : fit;
      placeLeaf(node, rect, path, {
        left: side, right: side, top: fit, bottom: fit,
      });
      return;
    }

    const stacked = node.direction === 'vertical';
    // Seams with no rail or mullion (SPEC-36.3): seam i is between children i and i + 1.
    const cuts = shared !== null && node.noRail ? new Set(node.noRail) : new Set();
    const gap = stacked ? reveals.horizontal : reveals.vertical;
    const gapAfter = (index) => (cuts.has(index) ? shared : gap);
    const length = stacked ? rect.height : rect.width;
    const lastIndex = node.children.length - 1;
    const hasAuto = node.children.some((child) => child.size === null);
    const isAuto = (child, index) => child.size === null || (!hasAuto && index === lastIndex);
    const fixedTotal = node.children.reduce(
      (sum, child, index) => (isAuto(child, index) ? sum : sum + child.size),
      0,
    );
    const autoCount = node.children.filter(isAuto).length;
    // A face next to a cut seam takes no fit on that edge, so an auto slot grows by it and the faces stay equal.
    const uncutEdges = (index) => 2 - (cuts.has(index - 1) ? 1 : 0) - (cuts.has(index) ? 1 : 0);
    const gaps = cuts.size
      ? node.children.reduce((sum, _child, index) => (index < lastIndex ? sum + gapAfter(index) : sum), 0)
      : gap * lastIndex;
    const cutFit = cuts.size
      ? fit * node.children.reduce((sum, child, index) => (isAuto(child, index) ? sum + uncutEdges(index) : sum), 0)
      : 0;
    const autoSize = (length - gaps - fixedTotal - cutFit) / autoCount;
    if (autoSize < MIN_FACE_SIZE) warnings.push({ code: 'face-too-small', path });

    let cursor = stacked ? rect.z + rect.height : rect.x;
    node.children.forEach((child, index) => {
      const size = isAuto(child, index)
        ? autoSize + (cuts.size ? fit * uncutEdges(index) : 0)
        : child.size;
      const childRect = stacked
        ? { x: rect.x, z: cursor - size, width: rect.width, height: size }
        : { x: cursor, z: rect.z, width: size, height: rect.height };
      const childPath = `${path}.${index}`;
      if (child.type && (cuts.has(index - 1) || cuts.has(index))) {
        // The faces on either side of a cut seam are one opening in the frame, named for its first face.
        let first = index;
        while (cuts.has(first - 1)) first -= 1;
        const along = child.type === 'pair_door' && !stacked ? pairFit : fit;
        const lead = cuts.has(index - 1) ? 0 : along;
        const trail = cuts.has(index) ? 0 : along;
        const across = child.type === 'pair_door' && stacked ? pairFit : fit;
        placeLeaf(child, childRect, childPath, stacked
          ? {
            left: across, right: across, top: lead, bottom: trail,
          }
          : {
            left: lead, right: trail, top: across, bottom: across,
          }, `${path}.${first}`);
      } else {
        place(child, childRect, childPath);
      }
      cursor = stacked ? cursor - size - gapAfter(index) : cursor + size + gapAfter(index);
    });
  };

  place(face, area, ROOT_FACE_PATH);
  return { faces, warnings };
}

/** Resolved faces for one cabinet piece from splitRun. Pass revealValues to use style/rule reveals. */
export function cabinetFaces(item, piece, cabinetTypeId, settings, revealValues = null) {
  const reveals = revealValues ?? faceRevealsFor(cabinetTypeId, settings);
  const face = item?.face ?? defaultFace(piece.width, settings);
  return resolveFaces(face, faceArea(piece, reveals), reveals);
}

function overlapsHeight(a, b) {
  return Math.min(a.z + a.height, b.z + b.height) - Math.max(a.z, b.z) > 1e-6;
}

/**
 * Hinge side for each resolved 'door' face: stored, else against the one hinge stop it touches,
 * else away from the one covered side it touches. Warns when a hinge is on a covered side.
 */
export function applyHinges(faces, stops, covered) {
  const warnings = [];
  const next = faces.map((face) => {
    if (face.type !== 'door') return face;
    const beside = faces.filter((other) => other !== face && overlapsHeight(other, face));
    const touches = {
      left: !beside.some((other) => other.x + other.width <= face.x + 1e-6),
      right: !beside.some((other) => other.x >= face.x + face.width - 1e-6),
    };
    let hinge = face.hinge ?? null;
    let rule = false;
    if (!hinge) {
      const stopLeft = touches.left && stops.left;
      const stopRight = touches.right && stops.right;
      const coverLeft = touches.left && covered.left > 0;
      const coverRight = touches.right && covered.right > 0;
      if (stopLeft !== stopRight) hinge = stopLeft ? 'left' : 'right';
      else if (coverLeft !== coverRight) hinge = coverLeft ? 'right' : 'left';
      rule = hinge !== null;
    }
    if (hinge && touches[hinge] && covered[hinge] > 0) {
      warnings.push({ code: 'hinge-on-covered-side', path: face.path });
    }
    return hinge ? { ...face, hinge, ...(rule ? { hingeRule: true } : {}) } : face;
  });
  return { faces: next, warnings };
}
