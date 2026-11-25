import { splitLine } from './split/splitLine.js';
import {
  MAX_SPLIT, clampCount, equalizeChildren, nodeAt, removeChild, replaceAt,
  setChildCount, setChildSize, splitChild,
} from './split/treeEdits.js';

export const MAX_MID_SPLIT = MAX_SPLIT;

const EPSILON = 1e-6;
const positive = (value) => Number.isFinite(value) && value > 0;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOnly = (value, keys) => object(value)
  && Reflect.ownKeys(value).every((key) => keys.includes(key));

/** Validate a stored split tree; an absent layout is handled separately by the resolver. */
export function isMidLayout(layout) {
  const check = (node, parentSplit) => {
    if (!hasOnly(node, parentSplit ? ['size', 'split', 'children', 'mids'] : ['split', 'children', 'mids'])) {
      return false;
    }
    if (node.size !== undefined && !positive(node.size)) return false;
    if (parentSplit && node.split === undefined) return hasOnly(node, ['size']);
    if (!['rows', 'cols'].includes(node.split) || node.split === parentSplit) return false;
    if (!Array.isArray(node.children) || node.children.length < 2
      || node.children.length > MAX_MID_SPLIT) return false;
    if (!Array.from(node.children).every((child) => check(child, node.split))) return false;
    return node.mids === undefined || (Array.isArray(node.mids)
      && node.mids.length === node.children.length - 1
      && Array.from(node.mids).every((mid) => hasOnly(mid, ['width'])
        && (mid.width === undefined || positive(mid.width))));
  };
  return check(layout, null);
}

function checked(layout, next) {
  return next === undefined || isMidLayout(next) ? next : layout;
}

function withMids(node, mids) {
  const next = { ...node };
  if (mids.some((mid) => mid.width !== undefined)) next.mids = mids;
  else delete next.mids;
  return next;
}

function collapseGroup(node, child, root) {
  if (root && !child.split) return undefined;
  const next = { ...child };
  if (!root && node.size !== undefined) next.size = node.size;
  else delete next.size;
  return next;
}

const MID_TREE = {
  root: 'root',
  axisKey: 'split',
  flatMax: MAX_MID_SPLIT,
  seams: (node) => node.mids ?? Array.from({ length: node.children.length - 1 }, () => ({})),
  withSeams: withMids,
  newSeam: () => ({}),
  collapse: collapseGroup,
  autoChild: (child) => Object.hasOwn(child, 'size') ? MID_TREE.withSize(child, null) : child,
  sizeOf: (node) => node.size ?? null,
  withSize: (node, size) => {
    const next = { ...node };
    if (size === null) delete next.size;
    else next.size = size;
    return next;
  },
};

/** Split a panel, flattening new siblings when the parent already uses this split. */
export function splitLayout(layout, path, split, count) {
  if (!['rows', 'cols'].includes(split) || !Number.isFinite(count)) return layout;
  const n = clampCount(count, 2);
  const children = Array.from({ length: n }, () => ({}));
  if (layout === undefined && path === 'root') return checked(layout, { split, children });
  const target = nodeAt(layout, path, MID_TREE.root);
  if (!target || target.split) return layout;
  return checked(layout, splitChild(layout, path, MID_TREE, {
    axis: split, children, seam: () => ({}), group: (node) => node,
  }));
}

/** Resize a split at its top/right end, or collapse it into its first child. */
export function setLayoutCount(layout, path, count) {
  const target = nodeAt(layout, path, MID_TREE.root);
  if (!target?.split || !Number.isFinite(count)) return layout;
  return checked(layout, setChildCount(layout, path, MID_TREE, clampCount(count, 1), () => ({})));
}

/** Remove a child and its following mid (the preceding mid for the last child). */
export function removeLayoutChild(layout, path) {
  return checked(layout, removeChild(layout, path, MID_TREE));
}

/** Set or clear a panel/group's typed size; the root has no size. */
export function setLayoutSize(layout, path, size) {
  return checked(layout, setChildSize(layout, path, MID_TREE, size));
}

/** Clear only the direct children's typed sizes. */
export function equalizeLayout(layout, path) {
  return checked(layout, equalizeChildren(layout, path, MID_TREE));
}

/** Set or clear one mid's width, omitting the list when every mid is automatic. */
export function setLayoutMidWidth(layout, path, index, width) {
  const target = nodeAt(layout, path, MID_TREE.root);
  if (!target?.split || !Number.isInteger(index) || index < 0 || index >= target.children.length - 1
    || (width !== null && !positive(width)) || (target.mids?.[index]?.width ?? null) === width) return layout;
  return checked(layout, replaceAt(layout, path, (node) => {
    const mids = node.mids ? node.mids.slice() : Array.from({ length: node.children.length - 1 }, () => ({}));
    mids[index] = width === null ? {} : { width };
    return withMids(node, mids);
  }));
}

/** Position a mid using the preceding child's unmirrored bottom/left coordinate. */
export function setMidPosition(layout, path, index, at, nodes, width) {
  const target = nodeAt(layout, path, MID_TREE.root);
  if (!target?.split || !Number.isInteger(index) || index < 0 || index >= target.children.length - 1
    || !Number.isFinite(at) || !Number.isFinite(width) || width < 0 || !Array.isArray(nodes)) return layout;
  const childPath = `${path}.${index}`;
  const child = nodes.find((node) => node.path === childPath);
  const size = at - width / 2 - (target.split === 'rows' ? child?.z : child?.x);
  return Number.isFinite(size) && size > EPSILON ? setLayoutSize(layout, childPath, size) : layout;
}

/** Resolve a valid layout into core-local panels and named, bounded mid members. */
export function resolveMidLayout(layout, area, widths, { mirror = false } = {}) {
  const nodes = [];
  const panels = [];
  const members = [];
  const warnings = [];

  const place = (node, rect, path, bounds) => {
    const resolved = { path, ...rect };
    nodes.push(resolved);
    if (!node?.split) {
      if (rect.width > EPSILON && rect.height > EPSILON) panels.push(resolved);
      return;
    }

    const rows = node.split === 'rows';
    const kind = rows ? 'rail' : 'stile';
    const mids = node.children.slice(1).map((_, index) => {
      const typed = node.mids?.[index]?.width;
      const width = typed ?? widths[kind];
      return {
        kind, path, index, width,
        source: typed === undefined ? widths.source[kind] : 'part',
        ...(widths.over > 0 ? { overall: width + 2 * widths.over } : {}),
        from: rows ? bounds.left : bounds.bottom,
        to: rows ? bounds.right : bounds.top,
      };
    });

    const { sizes, starts, remainder, autoCount } = splitLine(
      node.children, rows ? rect.height : rect.width,
      { gaps: mids.map((mid) => mid.width), short: 'lastTyped' },
    );
    if ((autoCount > 0 && remainder <= EPSILON) || remainder < -EPSILON) {
      warnings.push({ code: 'mid-layout-overfull', path });
    }

    // Keep references to bounding mids until their names can be assigned in coordinate order.
    const reversed = !rows && mirror;
    node.children.forEach((child, index) => {
      const size = sizes[index];
      const start = reversed
        ? rect.x + rect.width - starts[index] - size
        : (rows ? rect.z : rect.x) + starts[index];
      const childRect = rows
        ? { x: rect.x, z: start, width: rect.width, height: size }
        : { x: start, z: rect.z, width: size, height: rect.height };
      const before = mids[index - 1];
      const after = mids[index];
      const childBounds = rows
        ? { ...bounds, bottom: before ?? bounds.bottom, top: after ?? bounds.top }
        : reversed
          ? { ...bounds, left: after ?? bounds.left, right: before ?? bounds.right }
          : { ...bounds, left: before ?? bounds.left, right: after ?? bounds.right };
      place(child, childRect, `${path}.${index}`, childBounds);
      if (after) {
        after.at = reversed
          ? rect.x + rect.width - starts[index] - size - after.width / 2
          : (rows ? rect.z : rect.x) + starts[index] + size + after.width / 2;
        members.push({ mid: after, across: rows ? rect.x : rect.z });
      }
    });
  };

  place(layout, area, 'root', { left: 'LS', right: 'RS', bottom: 'BR', top: 'TR' });
  const sorted = ['rail', 'stile'].flatMap((kind) => {
    const group = members.filter(({ mid }) => mid.kind === kind)
      .sort((a, b) => a.mid.at - b.mid.at || a.across - b.across);
    group.forEach(({ mid }, index) => {
      mid.name = `${kind === 'rail' ? 'MR' : 'MS'}${index + 1}`;
    });
    return group;
  });
  const mids = sorted.map(({ mid }) => {
    const from = typeof mid.from === 'string' ? mid.from : mid.from.name;
    const to = typeof mid.to === 'string' ? mid.to : mid.to.name;
    return {
      ...mid, from, to,
      full: mid.kind === 'rail' ? from === 'LS' && to === 'RS' : from === 'BR' && to === 'TR',
    };
  });
  return { nodes, panels, mids, warnings };
}
