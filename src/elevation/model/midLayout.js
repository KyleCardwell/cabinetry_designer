export const MAX_MID_SPLIT = 8;

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

function indexesOf(path) {
  return typeof path === 'string' && /^root(?:\.\d+)*$/.test(path)
    ? path.split('.').slice(1).map(Number) : null;
}

function getNode(layout, path) {
  const indexes = indexesOf(path);
  if (!indexes) return undefined;
  let node = layout;
  for (const index of indexes) node = node?.children?.[index];
  return node;
}

function replaceAt(layout, path, replacer) {
  const next = structuredClone(layout);
  let result;
  if (path === 'root') result = replacer(next);
  else {
    const parent = getNode(next, path.split('.').slice(0, -1).join('.'));
    parent.children[indexesOf(path).at(-1)] = replacer(getNode(next, path));
    result = next;
  }
  return result === undefined || isMidLayout(result) ? result : layout;
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

/** Split a panel, flattening new siblings when the parent already uses this split. */
export function splitLayout(layout, path, split, count) {
  if (!['rows', 'cols'].includes(split) || !Number.isFinite(count)) return layout;
  const n = Math.min(MAX_MID_SPLIT, Math.max(2, Math.round(count)));
  const children = Array.from({ length: n }, () => ({}));
  if (layout === undefined && path === 'root') return { split, children };
  const target = getNode(layout, path);
  if (!target || target.split) return layout;
  const parentPath = path.split('.').slice(0, -1).join('.');
  const parent = getNode(layout, parentPath);
  const index = indexesOf(path).at(-1);
  if (parent.split === split) {
    if (parent.children.length + n - 1 > MAX_MID_SPLIT) return layout;
    return replaceAt(layout, parentPath, (node) => {
      const mids = node.mids ?? Array.from({ length: node.children.length - 1 }, () => ({}));
      return withMids({
        ...node,
        children: [...node.children.slice(0, index), ...children, ...node.children.slice(index + 1)],
      }, [...mids.slice(0, index), ...Array.from({ length: n - 1 }, () => ({})), ...mids.slice(index)]);
    });
  }
  return replaceAt(layout, path, (node) => ({ ...node, split, children }));
}

/** Resize a split at its top/right end, or collapse it into its first child. */
export function setLayoutCount(layout, path, count) {
  const target = getNode(layout, path);
  if (!target?.split || !Number.isFinite(count)) return layout;
  const n = Math.min(MAX_MID_SPLIT, Math.max(1, Math.round(count)));
  if (n === target.children.length) return layout;
  return replaceAt(layout, path, (node) => {
    if (n === 1) return collapseGroup(node, node.children[0], path === 'root');
    const children = node.children.slice(0, n);
    while (children.length < n) children.push({});
    const mids = (node.mids ?? []).slice(0, n - 1);
    while (mids.length < n - 1) mids.push({});
    return withMids({ ...node, children }, mids);
  });
}

/** Remove a child and its following mid (the preceding mid for the last child). */
export function removeLayoutChild(layout, path) {
  if (path === 'root' || !getNode(layout, path)) return layout;
  const parentPath = path.split('.').slice(0, -1).join('.');
  const index = indexesOf(path).at(-1);
  return replaceAt(layout, parentPath, (node) => {
    const children = node.children.filter((_, childIndex) => childIndex !== index);
    if (children.length === 1) return collapseGroup(node, children[0], parentPath === 'root');
    const removedMid = Math.min(index, node.children.length - 2);
    return withMids({ ...node, children }, (node.mids ?? []).filter((_, i) => i !== removedMid));
  });
}

/** Set or clear a panel/group's typed size; the root has no size. */
export function setLayoutSize(layout, path, size) {
  const target = getNode(layout, path);
  if (!target || path === 'root' || (size !== null && !positive(size))
    || (target.size ?? null) === size) return layout;
  return replaceAt(layout, path, (node) => {
    if (size === null) delete node.size;
    else node.size = size;
    return node;
  });
}

/** Clear only the direct children's typed sizes. */
export function equalizeLayout(layout, path) {
  const target = getNode(layout, path);
  if (!target?.children?.some((child) => child.size !== undefined)) return layout;
  return replaceAt(layout, path, (node) => {
    node.children.forEach((child) => { delete child.size; });
    return node;
  });
}

/** Set or clear one mid's width, omitting the list when every mid is automatic. */
export function setLayoutMidWidth(layout, path, index, width) {
  const target = getNode(layout, path);
  if (!target?.split || !Number.isInteger(index) || index < 0 || index >= target.children.length - 1
    || (width !== null && !positive(width)) || (target.mids?.[index]?.width ?? null) === width) return layout;
  return replaceAt(layout, path, (node) => {
    const mids = node.mids ?? Array.from({ length: node.children.length - 1 }, () => ({}));
    mids[index] = width === null ? {} : { width };
    return withMids(node, mids);
  });
}

/** Position a mid using the preceding child's unmirrored bottom/left coordinate. */
export function setMidPosition(layout, path, index, at, nodes, width) {
  const target = getNode(layout, path);
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

    const space = (rows ? rect.height : rect.width) - mids.reduce((sum, mid) => sum + mid.width, 0);
    const sizes = node.children.map((child) => child.size ?? 0);
    const remainder = space - sizes.reduce((sum, size) => sum + size, 0);
    const autoCount = node.children.filter((child) => child.size === undefined).length;
    if (autoCount && remainder > EPSILON) {
      node.children.forEach((child, index) => {
        if (child.size === undefined) sizes[index] = remainder / autoCount;
      });
    } else {
      const lastTyped = node.children.findLastIndex((child) => child.size !== undefined);
      if (lastTyped !== -1) sizes[lastTyped] += remainder;
      if (remainder < -EPSILON || autoCount) warnings.push({ code: 'mid-layout-overfull', path });
    }

    // Keep references to bounding mids until their names can be assigned in coordinate order.
    const reversed = !rows && mirror;
    let cursor = rows ? rect.z : rect.x + (reversed ? rect.width : 0);
    node.children.forEach((child, index) => {
      const size = sizes[index];
      const start = reversed ? cursor - size : cursor;
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
      cursor += reversed ? -size : size;
      if (after) {
        after.at = cursor + (reversed ? -after.width / 2 : after.width / 2);
        members.push({ mid: after, across: rows ? rect.x : rect.z });
        cursor += reversed ? -after.width : after.width;
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
