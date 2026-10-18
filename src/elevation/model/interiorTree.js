import { isPlainObject } from '@reduxjs/toolkit';
import { INTERIOR_DIVIDERS } from './constants.js';
import { MAX_FACE_SPLIT } from './faceTree.js';

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
