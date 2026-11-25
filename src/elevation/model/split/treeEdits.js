/*
 * Edits shared by the face tree, interior tree and mid layout (SPEC-E4). Each tree passes an adapter T that says how
 * it differs:
 *   root              root path ('r' or 'root'); child paths add '.index'
 *   axisKey           the group's split key ('direction' or 'split')
 *   flatMax           most children a flat split may leave (unset = no limit)
 *   seams(node)       what sits between children, one entry per gap (length children - 1)
 *   withSeams(n, s)   the node with that list stored the tree's own way
 *   newSeam()         the seam added when a count grows
 *   join(a, b)        the one seam left when a middle child is removed (unset = keep a)
 *   collapse(g, c, r) what replaces group g when only child c is left (r: g is the root)
 *   autoChild(c), autoSeam(s)  for Equal; return the same object when already auto (unset = unchanged)
 *   sizeOf(n), withSize(n, s)  for a typed size
 * Every edit returns the tree itself when nothing applies.
 */

export const MAX_SPLIT = 8;

export function clampCount(count, min) {
  return Math.min(MAX_SPLIT, Math.max(min, Math.round(count)));
}

export function nodeAt(tree, path, root) {
  if (typeof path !== 'string') return null;
  const [head, ...segments] = path.split('.');
  if (head !== root || !segments.every((segment) => /^(?:0|[1-9]\d*)$/.test(segment))) return null;
  let node = tree;
  for (const segment of segments) node = node?.children?.[Number(segment)];
  return node ?? null;
}

export function parentPath(path) {
  const dot = path.lastIndexOf('.');
  return dot < 0 ? null : path.slice(0, dot);
}

/** The last index in a child path ('r.2.1' → 1). */
export function lastIndex(path) {
  return Number(path.slice(path.lastIndexOf('.') + 1));
}

// Call with an accepted path; replacers must return a new node without mutating it.
export function replaceAt(tree, path, replacer) {
  const parent = parentPath(path);
  if (parent === null) return replacer(tree);
  const index = lastIndex(path);
  return replaceAt(tree, parent, (node) => ({
    ...node,
    children: node.children.map((child, i) => i === index ? replacer(child) : child),
  }));
}

export function splitChild(tree, path, T, { axis, children, seam, group }) {
  const node = nodeAt(tree, path, T.root);
  if (!node) return tree;
  const parent = parentPath(path);
  const parentNode = parent === null ? null : nodeAt(tree, parent, T.root);
  const added = children.length - 1;
  if (parentNode?.[T.axisKey] === axis) {
    if (T.flatMax && parentNode.children.length + added > T.flatMax) return tree;
    const index = lastIndex(path);
    const seams = T.seams(parentNode);
    return replaceAt(tree, parent, () => T.withSeams({
      ...parentNode,
      children: [
        ...parentNode.children.slice(0, index),
        ...children,
        ...parentNode.children.slice(index + 1),
      ],
    }, [
      ...seams.slice(0, index),
      ...Array.from({ length: added }, () => seam(seams, index)),
      ...seams.slice(index),
    ]));
  }
  return replaceAt(tree, path, () => T.withSeams({
    [T.axisKey]: axis,
    ...group(node),
    children,
  }, Array.from({ length: added }, () => seam([], 0))));
}

export function removeChild(tree, path, T) {
  if (!nodeAt(tree, path, T.root) || path === T.root) return tree;
  const parent = parentPath(path);
  const index = lastIndex(path);
  return replaceAt(tree, parent, (node) => {
    const children = [...node.children.slice(0, index), ...node.children.slice(index + 1)];
    if (children.length === 1) return T.collapse(node, children[0], parent === T.root);
    const seams = T.seams(node).slice();
    if (index === 0) seams.shift();
    else if (index === node.children.length - 1) seams.pop();
    else {
      seams[index - 1] = T.join ? T.join(seams[index - 1], seams[index]) : seams[index - 1];
      seams.splice(index, 1);
    }
    return T.withSeams({ ...node, children }, seams);
  });
}

export function setChildCount(tree, path, T, n, fill) {
  const node = nodeAt(tree, path, T.root);
  if (!node?.children || n === node.children.length) return tree;
  if (n === 1) return replaceAt(tree, path, () => T.collapse(node, node.children[0], path === T.root));
  const children = node.children.slice(0, n);
  const seams = T.seams(node).slice(0, n - 1);
  while (children.length < n) children.push(fill(node));
  while (seams.length < n - 1) seams.push(T.newSeam());
  return replaceAt(tree, path, () => T.withSeams({ ...node, children }, seams));
}

export function equalizeChildren(tree, path, T) {
  const node = nodeAt(tree, path, T.root);
  if (!node?.children) return tree;
  const oldSeams = T.seams(node);
  const children = node.children.map((child) => T.autoChild ? T.autoChild(child) : child);
  const seams = oldSeams.map((seam) => T.autoSeam ? T.autoSeam(seam) : seam);
  if (children.every((child, index) => child === node.children[index])
    && seams.every((seam, index) => seam === oldSeams[index])) return tree;
  return replaceAt(tree, path, () => T.withSeams({ ...node, children }, seams));
}

export function setChildSize(tree, path, T, size) {
  const node = nodeAt(tree, path, T.root);
  if (!node || path === T.root || (size !== null && (!Number.isFinite(size) || size <= 0))) return tree;
  if (T.sizeOf(node) === size) return tree;
  return replaceAt(tree, path, () => T.withSize(node, size));
}
