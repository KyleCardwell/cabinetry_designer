import { ROOT_FACE_PATH, resolveFaces } from './faces.js';

const group = (direction, children, dividers) => ({ direction, children, dividers });

function columnShelves(tree) {
  if (!tree) return [];
  if (tree.direction !== 'vertical' || tree.dividers.some(({ kind }) => kind !== 'fixed')) return null;
  const dividers = [];
  for (let i = 0; i < tree.children.length; i += 1) {
    const nested = tree.children[i].children ? columnShelves(tree.children[i]) : [];
    if (!nested) return null;
    dividers.push(...nested);
    if (i < tree.dividers.length) dividers.push(tree.dividers[i]);
  }
  return dividers;
}

function drawerAtBottom(node) {
  if (node.children) {
    return node.direction === 'vertical'
      ? drawerAtBottom(node.children.at(-1)) : node.children.some(drawerAtBottom);
  }
  return ['drawer_front', 'false_front'].includes(node.type)
    || (node.type === 'door' && node.action === 'pullout');
}

// A seam's height is affine in the column height. Compare both its proportional and typed
// parts, so equal auto columns and equal typed sizes match without needing a cabinet height.
function shelfLevels(face, dividers, path) {
  const levels = [0, 1].map((height) => {
    const { faces } = resolveFaces(face, { x: 0, z: 0, width: 1, height }, {
      horizontal: 0, vertical: 0,
    });
    return dividers.map(({ seam }) => {
      const [parent, index] = seam.split(':');
      const prefix = `${parent.slice(path.length)}.${index}`;
      const above = faces.filter((entry) => {
        const relative = entry.path.slice(ROOT_FACE_PATH.length);
        return relative === prefix || relative.startsWith(`${prefix}.`);
      });
      return Math.min(...above.map(({ z }) => z));
    });
  });
  return levels[0].map((offset, i) => ({ offset, fraction: levels[1][i] - offset }));
}

/** Structure derived from faces; null means one clear section. Face paths survive merged sections. */
export function autoInterior(faceTree, boxWidth, { nosing } = {}) {
  const wide = boxWidth > 36 && !nosing;
  const walk = (face, path, inColumns = false) => {
    if (!face.children) {
      return wide && !inColumns && face.type === 'pair_door'
        ? group('horizontal', [{}, {}], [{ kind: 'partition', seam: `${path}:pair` }]) : null;
    }
    const columns = face.direction === 'horizontal';
    const trees = face.children.map((child, index) => walk(child, `${path}.${index}`, inColumns || columns));
    if (columns) {
      if (!wide) {
        if (trees.every((tree) => tree === null)) return null;
        const shelves = trees.map(columnShelves);
        const levels = shelves.map((dividers, index) => dividers
          ? shelfLevels(face.children[index], dividers, `${path}.${index}`) : null);
        if (levels[0]?.length && levels.every((entries) => entries && entries.length === levels[0].length
          && entries.every((level, i) => Math.abs(level.fraction - levels[0][i].fraction) < 1e-9
            && Math.abs(level.offset - levels[0][i].offset) <= 1 / 16 + 1e-9))) {
          return group('vertical', Array.from({ length: shelves[0].length + 1 }, () => ({})), shelves[0]);
        }
      }
      return group('horizontal', trees.map((tree) => tree ?? {}),
        face.children.slice(1).map((_, index) => ({ kind: 'partition', seam: `${path}:${index}` })));
    }
    const dividers = [];
    const children = [];
    let first = 0;
    for (let i = 0; i < face.children.length - 1; i += 1) {
      const kind = !drawerAtBottom(face.children[i]) ? 'fixed'
        : trees[i] || trees[i + 1] ? 'stretcher' : null;
      if (!kind) continue;
      children.push(first === i ? trees[i] ?? {} : {});
      dividers.push({ kind, seam: `${path}:${i}` });
      first = i + 1;
    }
    if (!dividers.length) return null;
    children.push(first === trees.length - 1 ? trees[first] ?? {} : {});
    return group('vertical', children, dividers);
  };
  return walk(faceTree, ROOT_FACE_PATH);
}
