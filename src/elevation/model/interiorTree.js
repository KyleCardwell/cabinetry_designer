import { isPlainObject } from '@reduxjs/toolkit';
import { INTERIOR_DIVIDERS } from './constants.js';
import { MAX_FACE_SPLIT, parentFacePath } from './faceTree.js';
import { ROOT_FACE_PATH } from './faces.js';

function isDivider(divider, direction) {
  return isPlainObject(divider)
    && Object.keys(divider).every((key) => ['kind', 'at', 'from', 'depth'].includes(key))
    && INTERIOR_DIVIDERS[direction].includes(divider.kind)
    && (!Object.hasOwn(divider, 'at') || (Number.isFinite(divider.at) && divider.at > 0))
    && (!Object.hasOwn(divider, 'depth') || (Number.isFinite(divider.depth) && divider.depth > 0))
    && (!Object.hasOwn(divider, 'from')
      || (direction === 'horizontal' && divider.from === 'right' && Object.hasOwn(divider, 'at')));
}

/** An empty section or a valid interior group, recursively. */
export function isInteriorNode(node) {
  if (!isPlainObject(node)) return false;
  if (Object.keys(node).length === 0) return true;
  return Object.keys(node).every((key) => ['direction', 'children', 'dividers'].includes(key))
    && ['vertical', 'horizontal'].includes(node.direction)
    && Array.isArray(node.children)
    && node.children.length >= 2 && node.children.length <= MAX_FACE_SPLIT
    && Array.from(node.children).every(isInteriorNode)
    && Array.isArray(node.dividers)
    && node.dividers.length === node.children.length - 1
    && Array.from(node.dividers).every((divider) => isDivider(divider, node.direction));
}

/** Only groups are stored; one section is represented by an absent interior key. */
export function isStoredInterior(value) {
  return isInteriorNode(value) && Object.hasOwn(value, 'direction');
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
    const next = replacer(interior ?? {});
    return next.children ? next : null;
  }
  const parentPath = parentFacePath(path);
  const index = Number(path.split('.').at(-1));
  return replaceAt(interior, parentPath, (parent) => ({
    ...parent,
    children: parent.children.map((child, i) => i === index ? replacer(child) : child),
  }));
}

/** Same-direction splits add siblings, keeping existing seams on either side. */
export function splitSection(interior, path, direction, count, kind) {
  const target = getInteriorNode(interior, path);
  if (!target || target.children || !Object.hasOwn(INTERIOR_DIVIDERS, direction)
    || !Number.isFinite(count)) return interior;
  const dividerKind = kind === undefined ? INTERIOR_DIVIDERS[direction][0] : kind;
  if (!INTERIOR_DIVIDERS[direction].includes(dividerKind)) return interior;
  const n = Math.min(MAX_FACE_SPLIT, Math.max(2, Math.round(count)));
  const children = Array.from({ length: n }, () => ({}));
  const dividers = Array.from({ length: n - 1 }, () => ({ kind: dividerKind }));
  const parentPath = parentFacePath(path);
  const parent = parentPath === null ? null : getInteriorNode(interior, parentPath);
  if (parent?.direction === direction) {
    if (parent.children.length + n - 1 > MAX_FACE_SPLIT) return interior;
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

/** Merge only adjacent sections; a collapsed root is no stored interior. */
export function removeDivider(interior, groupPath, index) {
  const group = dividerGroup(interior, groupPath, index);
  if (!group || group.children[index].children || group.children[index + 1].children) return interior;
  return replaceAt(interior, groupPath, (node) => node.children.length === 2 ? {} : ({
    ...node,
    children: [...node.children.slice(0, index), {}, ...node.children.slice(index + 2)],
    dividers: node.dividers.filter((_, i) => i !== index),
  }));
}

function editDivider(interior, path, index, edit) {
  const group = dividerGroup(interior, path, index);
  if (!group) return interior;
  const current = group.dividers[index];
  const next = edit(current, group.direction);
  if (!next || (Object.keys(current).length === Object.keys(next).length
    && Object.keys(current).every((key) => current[key] === next[key]))) return interior;
  return replaceAt(interior, path, (node) => ({
    ...node,
    dividers: node.dividers.map((divider, i) => i === index ? next : divider),
  }));
}

export function setDividerKind(interior, groupPath, index, kind) {
  return editDivider(interior, groupPath, index, (divider, direction) => (
    INTERIOR_DIVIDERS[direction].includes(kind) ? { ...divider, kind } : null
  ));
}

function autoPosition(divider) {
  const next = { ...divider };
  delete next.at;
  delete next.from;
  return next;
}

/** Positions are kept as typed; only partitions accept an origin side. */
export function setDividerPosition(interior, groupPath, index, at, from) {
  if (at !== null && !(Number.isFinite(at) && at > 0)) return interior;
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
  if (depth !== null && !(Number.isFinite(depth) && depth > 0)) return interior;
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
  if (!group?.children || !group.dividers.some((divider) => Object.hasOwn(divider, 'at'))) return interior;
  return replaceAt(interior, groupPath, (node) => ({
    ...node, dividers: node.dividers.map(autoPosition),
  }));
}

export function clearSplit(interior, groupPath) {
  if (!getInteriorNode(interior, groupPath)?.children) return interior;
  return replaceAt(interior, groupPath, () => ({}));
}
