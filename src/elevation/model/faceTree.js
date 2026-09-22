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
  return replaceAt(face, path, (node) => ({ ...node, type }));
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
  if (parent && parent.direction === direction) {
    const index = indexesOf(path).at(-1);
    return replaceAt(face, parentPath, (node) => ({
      ...node,
      children: [...node.children.slice(0, index), ...copies, ...node.children.slice(index + 1)],
    }));
  }
  return replaceAt(face, path, (node) => ({ direction, size: node.size, children: copies }));
}

/** Replace a leaf with a nested vertical stack of drawer fronts. */
export function makeDrawerStack(face, path, count) {
  const target = getFaceNode(face, path);
  if (!target?.type || !Number.isFinite(count)) return face;
  const n = Math.min(MAX_FACE_SPLIT, Math.max(2, Math.round(count)));
  const children = Array.from({ length: n }, () => ({ type: 'drawer_front', size: null }));
  return replaceAt(face, path, (node) => ({
    direction: 'vertical',
    size: node.size,
    children,
  }));
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
    return { ...node, children };
  });
}

/** Remove a section. A group left with one child collapses into it, keeping the group's size. */
export function removeFace(face, path) {
  const parentPath = parentFacePath(path);
  if (parentPath === null || !getFaceNode(face, path)) return face;
  const index = indexesOf(path).at(-1);
  return replaceAt(face, parentPath, (node) => {
    const children = node.children.filter((_, childIndex) => childIndex !== index);
    return children.length === 1 ? { ...children[0], size: node.size } : { ...node, children };
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
