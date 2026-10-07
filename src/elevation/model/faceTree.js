import { FACE_DIRECTIONS, FACE_TYPES, ROOT_FACE_PATH } from './faces.js';

/** Most sections a single split or count can create. */
export const MAX_FACE_SPLIT = 8;

function indexesOf(path) {
  return path === ROOT_FACE_PATH ? [] : path.split('.').slice(1).map(Number);
}

export function parentFacePath(path) {
  if (path === ROOT_FACE_PATH) return null;
  return path.split('.').slice(0, -1).join('.');
}

export function getFaceNode(face, path) {
  let node = face;
  for (const index of indexesOf(path)) node = node?.children?.[index];
  return node ?? null;
}

function replaceAt(face, path, replacer) {
  const next = structuredClone(face);
  if (path === ROOT_FACE_PATH) return replacer(next);
  const parent = getFaceNode(next, parentFacePath(path));
  const index = indexesOf(path).at(-1);
  parent.children[index] = replacer(parent.children[index]);
  return next;
}

/** A group with its no-rail seams replaced; an empty list removes the key. */
function withSeams(node, seams) {
  const { noRail, ...rest } = node;
  void noRail;
  return seams.length ? { ...rest, noRail: seams } : rest;
}

/** The group at `path` without the given seams: a child nested into it is no longer a leaf. */
function withoutSeams(face, path, dropped) {
  const group = path === null ? null : getFaceNode(face, path);
  if (!group?.noRail) return face;
  return replaceAt(face, path, (node) => withSeams(
    node,
    node.noRail.filter((seam) => !dropped.includes(seam)),
  ));
}

/** Pre-order rows for the panel outline: [{path, depth, node}]. */
export function faceOutline(face) {
  const rows = [];
  const walk = (node, path, depth) => {
    rows.push({ path, depth, node });
    node.children?.forEach((child, index) => walk(child, `${path}.${index}`, depth + 1));
  };
  walk(face, ROOT_FACE_PATH, 0);
  return rows;
}

export function setFaceType(face, path, type) {
  const target = getFaceNode(face, path);
  if (!target?.type || !FACE_TYPES.includes(type)) return face;
  return replaceAt(face, path, (node) => { const next = { ...node, type }; if (type !== 'door') delete next.hinge; return next; });
}

/** Set or clear a non-open leaf's own style and sizes. */
export function setFacePart(face, path, patch) {
  const target = getFaceNode(face, path);
  if (!target?.type || target.children || target.type === 'open') return face;
  const keys = ['styleId', 'sizes'].filter((key) => Object.hasOwn(patch, key));
  const changed = keys.some((key) => {
    if (patch[key] == null) return Object.hasOwn(target, key);
    return key === 'sizes'
      ? JSON.stringify(target[key]) !== JSON.stringify(patch[key])
      : target[key] !== patch[key];
  });
  if (!changed) return face;
  return replaceAt(face, path, (node) => {
    const next = { ...node };
    for (const key of keys) {
      if (patch[key] == null) delete next[key];
      else next[key] = patch[key];
    }
    return next;
  });
}

export function setFaceSize(face, path, size) {
  if (path === ROOT_FACE_PATH || !getFaceNode(face, path)) return face;
  if (size !== null && !(Number.isFinite(size) && size > 0)) return face;
  return replaceAt(face, path, (node) => ({ ...node, size }));
}

/**
 * Split a leaf into `count` equal (auto) sections of its type.
 * Same direction as its parent: the new sections become siblings in the parent (flat).
 * Otherwise: the leaf becomes a group that keeps the leaf's size.
 */
export function splitFace(face, path, direction, count) {
  const target = getFaceNode(face, path);
  if (!target?.type || !FACE_DIRECTIONS.includes(direction) || !Number.isFinite(count)) return face;
  const n = Math.min(MAX_FACE_SPLIT, Math.max(2, Math.round(count)));
  const copies = Array.from({ length: n }, () => ({ type: target.type, size: null }));
  const parentPath = parentFacePath(path);
  const parent = parentPath === null ? null : getFaceNode(face, parentPath);
  const index = indexesOf(path).at(-1);
  if (parent && parent.direction === direction) {
    return replaceAt(face, parentPath, (node) => {
      // Seams after the split leaf move along; splitting inside a shared opening stays shared.
      const seams = node.noRail ?? [];
      const inside = seams.includes(index - 1) && seams.includes(index);
      const moved = seams.map((seam) => (seam < index ? seam : seam + n - 1));
      const added = inside ? Array.from({ length: n - 1 }, (_, offset) => index + offset) : [];
      return withSeams({
        ...node,
        children: [...node.children.slice(0, index), ...copies, ...node.children.slice(index + 1)],
      }, [...moved, ...added].sort((a, b) => a - b));
    });
  }
  const nested = replaceAt(face, path, (node) => ({ direction, size: node.size, children: copies }));
  return withoutSeams(nested, parentPath, [index - 1, index]);
}

/** Replace a leaf with a nested vertical stack of drawer fronts. */
export function makeDrawerStack(face, path, count) {
  const target = getFaceNode(face, path);
  if (!target?.type || !Number.isFinite(count)) return face;
  const n = Math.min(MAX_FACE_SPLIT, Math.max(2, Math.round(count)));
  const children = Array.from({ length: n }, () => ({ type: 'drawer_front', size: null }));
  const stacked = replaceAt(face, path, (node) => ({
    direction: 'vertical',
    size: node.size,
    children,
  }));
  const index = indexesOf(path).at(-1);
  return withoutSeams(stacked, parentFacePath(path), [index - 1, index]);
}

/** Change how many sections a group has. Added ones copy the last leaf's type; 1 collapses the group. */
export function setGroupCount(face, path, count) {
  const target = getFaceNode(face, path);
  if (!target?.children || !Number.isFinite(count)) return face;
  const n = Math.min(MAX_FACE_SPLIT, Math.max(1, Math.round(count)));
  if (n === 1) return replaceAt(face, path, (node) => ({ ...node.children[0], size: node.size }));
  return replaceAt(face, path, (node) => {
    const fillType = node.children.at(-1).type ?? 'door';
    const children = node.children.slice(0, n);
    while (children.length < n) children.push({ type: fillType, size: null });
    return withSeams({ ...node, children }, (node.noRail ?? []).filter((seam) => seam <= n - 2));
  });
}

/** Remove a section. A group left with one child collapses into it, keeping the group's size. */
export function removeFace(face, path) {
  const parentPath = parentFacePath(path);
  if (parentPath === null || !getFaceNode(face, path)) return face;
  const index = indexesOf(path).at(-1);
  return replaceAt(face, parentPath, (node) => {
    const children = node.children.filter((_, childIndex) => childIndex !== index);
    if (children.length === 1) return { ...children[0], size: node.size };
    // The seams beside the removed section join into one, kept only if both were cut.
    const seams = node.noRail ?? [];
    const joined = seams.includes(index - 1) && seams.includes(index) ? [index - 1] : [];
    const kept = seams
      .filter((seam) => seam < index - 1 || seam > index)
      .map((seam) => (seam > index ? seam - 1 : seam));
    return withSeams({ ...node, children }, [...kept, ...joined].sort((a, b) => a - b));
  });
}

/** Make every child of a group auto (equal). */
export function equalizeGroup(face, path) {
  const target = getFaceNode(face, path);
  if (!target?.children) return face;
  return replaceAt(face, path, (node) => ({
    ...node,
    children: node.children.map((child) => ({ ...child, size: null })),
  }));
}

/** Sets a door leaf's hinge side ('left' / 'right'), or clears it with null. */
export function setFaceHinge(face, path, hinge) {
  const target = getFaceNode(face, path);
  if (target?.type !== 'door') return face;
  if (hinge !== null && hinge !== 'left' && hinge !== 'right') return face;
  if ((target.hinge ?? null) === hinge) return face;
  return replaceAt(face, path, (node) => {
    const next = { ...node };
    if (hinge) next.hinge = hinge;
    else delete next.hinge;
    return next;
  });
}

/**
 * Turns "no rail or mullion" on or off for one seam of a group (SPEC-36.3): seam i is between sections i
 * and i + 1, and both must be leaves. The faces on either side then share one frame opening.
 */
export function setSeamNoRail(face, path, seam, value) {
  const target = getFaceNode(face, path);
  if (!target?.children || !Number.isInteger(seam) || seam < 0 || seam > target.children.length - 2) return face;
  if (!target.children[seam].type || !target.children[seam + 1].type) return face;
  const seams = target.noRail ?? [];
  if (seams.includes(seam) === Boolean(value)) return face;
  const next = value ? [...seams, seam].sort((a, b) => a - b) : seams.filter((entry) => entry !== seam);
  return replaceAt(face, path, (node) => withSeams(node, next));
}
