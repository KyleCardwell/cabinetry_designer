import { DEFAULT_SETTINGS } from './constants.js';

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

/** Whether a value is a valid stored face node (recursively). */
export function isFaceNode(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  if (!isSize(node.size)) return false;
  if (FACE_TYPES.includes(node.type)) {
    return node.children === undefined && node.direction === undefined;
  }
  return node.type === undefined
    && FACE_DIRECTIONS.includes(node.direction)
    && Array.isArray(node.children)
    && node.children.length >= 2
    && node.children.every(isFaceNode);
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
 *
 * @returns {{faces: {path, type, half?, x, z, width, height}[], warnings: {code, path}[]}}
 */
export function resolveFaces(face, area, reveals) {
  const faces = [];
  const warnings = [];

  const pairGap = reveals.pair ?? reveals.vertical;
  const fit = reveals.fit ?? 0;
  const pairFit = reveals.pairFit ?? fit;

  const place = (node, rect, path) => {
    if (node.type) {
      const side = node.type === 'pair_door' ? pairFit : fit;
      const leaf = {
        x: rect.x + side,
        z: rect.z + fit,
        width: rect.width - side * 2,
        height: rect.height - fit * 2,
      };
      if (node.type === 'pair_door') {
        const half = (leaf.width - pairGap) / 2;
        faces.push({ path, type: node.type, half: 'left', x: leaf.x, z: leaf.z, width: half, height: leaf.height });
        faces.push({
          path,
          type: node.type,
          half: 'right',
          x: leaf.x + half + pairGap,
          z: leaf.z,
          width: half,
          height: leaf.height,
        });
      } else {
        faces.push({ path, type: node.type, ...leaf });
      }
      return;
    }

    const stacked = node.direction === 'vertical';
    const gap = stacked ? reveals.horizontal : reveals.vertical;
    const length = stacked ? rect.height : rect.width;
    const lastIndex = node.children.length - 1;
    const hasAuto = node.children.some((child) => child.size === null);
    const isAuto = (child, index) => child.size === null || (!hasAuto && index === lastIndex);
    const fixedTotal = node.children.reduce(
      (sum, child, index) => (isAuto(child, index) ? sum : sum + child.size),
      0,
    );
    const autoCount = node.children.filter(isAuto).length;
    const autoSize = (length - gap * lastIndex - fixedTotal) / autoCount;
    if (autoSize < MIN_FACE_SIZE) warnings.push({ code: 'face-too-small', path });

    let cursor = stacked ? rect.z + rect.height : rect.x;
    node.children.forEach((child, index) => {
      const size = isAuto(child, index) ? autoSize : child.size;
      const childRect = stacked
        ? { x: rect.x, z: cursor - size, width: rect.width, height: size }
        : { x: cursor, z: rect.z, width: size, height: rect.height };
      place(child, childRect, `${path}.${index}`);
      cursor = stacked ? cursor - size - gap : cursor + size + gap;
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
