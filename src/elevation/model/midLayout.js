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
