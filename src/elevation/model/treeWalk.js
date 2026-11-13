// Same root path as ROOT_FACE_PATH; kept local so this module has no imports.
const ROOT_PATH = 'r';

/** Pre-order rows with the original node references. */
export function treeRows(root) {
  if (root == null) return [];
  const rows = [];
  const walk = (node, path, depth) => {
    rows.push({ path, depth, node });
    if (Array.isArray(node.children)) {
      node.children.forEach((child, index) => walk(child, `${path}.${index}`, depth + 1));
    }
  };
  walk(root, ROOT_PATH, 0);
  return rows;
}

/** Leaf rows in pre-order; any children array marks a group, including an empty one. */
export function treeLeaves(root) {
  return treeRows(root).filter(({ node }) => !Array.isArray(node.children));
}
