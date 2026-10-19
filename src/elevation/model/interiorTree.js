import { isPlainObject } from '@reduxjs/toolkit';
import { INTERIOR_DIVIDERS, SHELF_NOSINGS } from './constants.js';
import { MAX_FACE_SPLIT, parentFacePath } from './faceTree.js';
import { ROOT_FACE_PATH } from './faces.js';

const BANDED_KINDS = ['fixed', 'double_fixed'];

function isDivider(divider, direction) {
  return isPlainObject(divider)
    && Object.keys(divider).every((key) => ['kind', 'at', 'from', 'depth', 'seam', 'banding'].includes(key))
    && INTERIOR_DIVIDERS[direction].includes(divider.kind)
    && (!Object.hasOwn(divider, 'at') || (Number.isFinite(divider.at) && divider.at > 0))
    && (!Object.hasOwn(divider, 'depth') || (Number.isFinite(divider.depth) && divider.depth > 0))
    && (!Object.hasOwn(divider, 'seam') || (typeof divider.seam === 'string'
      && /^r(\.\d+)*:(\d+|pair)$/.test(divider.seam)
      && (direction === 'horizontal' || !divider.seam.endsWith(':pair'))))
    && (!Object.hasOwn(divider, 'banding') || (BANDED_KINDS.includes(divider.kind)
      && typeof divider.banding === 'boolean'))
    && (!Object.hasOwn(divider, 'from')
      || (direction === 'horizontal' && divider.from === 'right' && Object.hasOwn(divider, 'at')));
}

function isShelfValue(key, value, allowCount) {
  return key === 'glass' ? typeof value === 'boolean'
    : key === 'nosing' ? SHELF_NOSINGS.includes(value)
      : key === 'count' && allowCount && Number.isInteger(value) && value >= 0 && value <= 20;
}

/** Stored shelf picks are nonempty; only sections may specify a count. */
export function isShelfSettings(shelves, allowCount = false) {
  return isPlainObject(shelves) && Object.keys(shelves).length > 0
    && Object.entries(shelves).every(([key, value]) => isShelfValue(key, value, allowCount));
}

/** Null resets one pick. An invalid patch returns null; an empty result is pruned by the caller. */
export function patchShelfSettings(shelves, patch, allowCount = false) {
  if (!isPlainObject(patch) || !Object.entries(patch).every(([key, value]) =>
    ['glass', 'nosing', ...(allowCount ? ['count'] : [])].includes(key)
      && (value === null || isShelfValue(key, value, allowCount)))) return null;
  const next = { ...shelves };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

/** A plain or customized leaf section, or a valid interior group, recursively. */
export function isInteriorNode(node) {
  if (!isPlainObject(node)) return false;
  if (!Object.hasOwn(node, 'children')) {
    return Object.keys(node).every((key) => ['shelves', 'hinges', 'lineBore'].includes(key))
      && (!Object.hasOwn(node, 'shelves') || isShelfSettings(node.shelves, true))
      && ['hinges', 'lineBore'].every((key) => !Object.hasOwn(node, key) || typeof node[key] === 'boolean');
  }
  return Object.keys(node).every((key) => ['direction', 'children', 'dividers'].includes(key))
    && ['vertical', 'horizontal'].includes(node.direction)
    && Array.isArray(node.children)
    && node.children.length >= 2 && node.children.length <= MAX_FACE_SPLIT
    && Array.from(node.children).every(isInteriorNode)
    && Array.isArray(node.dividers)
    && node.dividers.length === node.children.length - 1
    && Array.from(node.dividers).every((divider) => isDivider(divider, node.direction));
}

/** Stored {} is a hand-edited section; an absent interior key means auto. */
export function isStoredInterior(value) {
  return isInteriorNode(value);
}

/** An absent interior is one empty root section. Missing paths return null. */
export function getInteriorNode(interior, path) {
  if (typeof path !== 'string' || !/^r(?:\.(?:0|[1-9]\d*))*$/.test(path)) return null;
  let node = interior ?? {};
  for (const index of path.split('.').slice(1).map(Number)) node = node?.children?.[index];
  return node ?? null;
}

/** Pre-order rows for the interior outline. */
export function interiorOutline(interior) {
  const rows = [];
  const walk = (node, path, depth) => {
    rows.push({ path, depth, node });
    node.children?.forEach((child, index) => walk(child, `${path}.${index}`, depth + 1));
  };
  walk(interior ?? {}, ROOT_FACE_PATH, 0);
  return rows;
}

function replaceAt(interior, path, replacer) {
  if (path === ROOT_FACE_PATH) {
    return replacer(interior ?? {});
  }
  const parentPath = parentFacePath(path);
  const index = Number(path.split('.').at(-1));
  return replaceAt(interior, parentPath, (parent) => ({
    ...parent,
    children: parent.children.map((child, i) => i === index ? replacer(child) : child),
  }));
}

/** Shelf overrides belong only to leaf sections; explicit default picks remain stored. */
export function setSectionShelves(interior, path, patch) {
  const target = getInteriorNode(interior, path);
  if (!target || target.children) return interior ?? {};
  const shelves = patchShelfSettings(target.shelves, patch, true);
  if (!shelves) return interior ?? {};
  const next = { ...target };
  if (Object.keys(shelves).length) next.shelves = shelves;
  else delete next.shelves;
  return replaceAt(interior, path, () => next);
}

export function setSectionFlag(interior, path, key, value) {
  const target = getInteriorNode(interior, path);
  if (!target || target.children || !['hinges', 'lineBore'].includes(key)
    || (value !== null && typeof value !== 'boolean')) return interior ?? {};
  const next = { ...target };
  if (value === null) delete next[key];
  else next[key] = value;
  return replaceAt(interior, path, () => next);
}

function withoutShelfCount(section) {
  const next = { ...section };
  if (section.shelves) {
    next.shelves = { ...section.shelves };
    delete next.shelves.count;
    if (!Object.keys(next.shelves).length) delete next.shelves;
  }
  return next;
}

/** Same-direction splits add siblings, keeping existing seams on either side. */
export function splitSection(interior, path, direction, count, kind) {
  const target = getInteriorNode(interior, path);
  if (!target || target.children || !Object.hasOwn(INTERIOR_DIVIDERS, direction)
    || !Number.isFinite(count)) return interior ?? {};
  const dividerKind = kind === undefined ? INTERIOR_DIVIDERS[direction][0] : kind;
  if (!INTERIOR_DIVIDERS[direction].includes(dividerKind)) return interior ?? {};
  const n = Math.min(MAX_FACE_SPLIT, Math.max(2, Math.round(count)));
  const children = Array.from({ length: n }, () => withoutShelfCount(target));
  const dividers = Array.from({ length: n - 1 }, () => ({ kind: dividerKind }));
  const parentPath = parentFacePath(path);
  const parent = parentPath === null ? null : getInteriorNode(interior, parentPath);
  if (parent?.direction === direction) {
    if (parent.children.length + n - 1 > MAX_FACE_SPLIT) return interior ?? {};
    const index = Number(path.split('.').at(-1));
    return replaceAt(interior, parentPath, (node) => ({
      ...node,
      children: [...node.children.slice(0, index), ...children, ...node.children.slice(index + 1)],
      dividers: [...node.dividers.slice(0, index), ...dividers, ...node.dividers.slice(index)],
    }));
  }
  return replaceAt(interior, path, () => ({ direction, children, dividers }));
}

function dividerGroup(interior, path, index) {
  const group = getInteriorNode(interior, path);
  return group?.children && Number.isInteger(index) && index >= 0 && index < group.dividers.length
    ? group : null;
}

/** Merge only adjacent sections, retaining the first section's picks without count. */
export function removeDivider(interior, groupPath, index) {
  const group = dividerGroup(interior, groupPath, index);
  if (!group || group.children[index].children || group.children[index + 1].children) return interior ?? {};
  const merged = withoutShelfCount(group.children[index]);
  return replaceAt(interior, groupPath, (node) => node.children.length === 2 ? merged : ({
    ...node,
    children: [...node.children.slice(0, index), merged, ...node.children.slice(index + 2)],
    dividers: node.dividers.filter((_, i) => i !== index),
  }));
}

function editDivider(interior, path, index, edit) {
  const group = dividerGroup(interior, path, index);
  if (!group) return interior ?? {};
  const current = group.dividers[index];
  const next = edit(current, group.direction);
  if (!next || (Object.keys(current).length === Object.keys(next).length
    && Object.keys(current).every((key) => current[key] === next[key]))) return interior ?? {};
  return replaceAt(interior, path, (node) => ({
    ...node,
    dividers: node.dividers.map((divider, i) => i === index ? next : divider),
  }));
}

export function setDividerKind(interior, groupPath, index, kind) {
  return editDivider(interior, groupPath, index, (divider, direction) => {
    if (!INTERIOR_DIVIDERS[direction].includes(kind)) return null;
    const next = { ...divider, kind };
    if (!BANDED_KINDS.includes(kind)) delete next.banding;
    return next;
  });
}

/** A stored pick overrides automatic banding; null restores the default. */
export function setDividerBanding(interior, groupPath, index, value) {
  if (value !== null && typeof value !== 'boolean') return interior ?? {};
  return editDivider(interior, groupPath, index, (divider) => {
    if (!BANDED_KINDS.includes(divider.kind)) return null;
    const next = { ...divider };
    if (value === null) delete next.banding;
    else next.banding = value;
    return next;
  });
}

function autoPosition(divider) {
  const next = { ...divider };
  delete next.at;
  delete next.from;
  return next;
}

/** Positions are kept as typed; only partitions accept an origin side. */
export function setDividerPosition(interior, groupPath, index, at, from) {
  if (at !== null && !(Number.isFinite(at) && at > 0)) return interior ?? {};
  return editDivider(interior, groupPath, index, (divider, direction) => {
    if (from !== undefined && (direction !== 'horizontal' || !['left', 'right'].includes(from))) return null;
    const next = autoPosition(divider);
    if (at !== null) {
      next.at = at;
      if (from === 'right') next.from = from;
    }
    return next;
  });
}

export function setDividerDepth(interior, groupPath, index, depth) {
  if (depth !== null && !(Number.isFinite(depth) && depth > 0)) return interior ?? {};
  return editDivider(interior, groupPath, index, (divider) => {
    const next = { ...divider };
    if (depth === null) delete next.depth;
    else next.depth = depth;
    return next;
  });
}

/** Clear positions in this group only, retaining kinds and depth overrides. */
export function equalizeDividers(interior, groupPath) {
  const group = getInteriorNode(interior, groupPath);
  if (!group?.children || !group.dividers.some((divider) => Object.hasOwn(divider, 'at'))) return interior ?? {};
  return replaceAt(interior, groupPath, (node) => ({
    ...node, dividers: node.dividers.map(autoPosition),
  }));
}

export function clearSplit(interior, groupPath) {
  if (!getInteriorNode(interior, groupPath)?.children) return interior ?? {};
  return replaceAt(interior, groupPath, () => ({}));
}
