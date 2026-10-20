import { isPlainObject } from '@reduxjs/toolkit';
import { MAX_ACCESSORY_QTY, MAX_SECTION_ACCESSORIES } from './constants.js';

/** Accessory items are ordered, unique references; quantity one is implicit. */
export function isAccessoryItems(value, { placed = false } = {}) {
  return Array.isArray(value) && value.length >= 1 && value.length <= MAX_SECTION_ACCESSORIES
    && Array.from(value).every((item) => isPlainObject(item)
      && Reflect.ownKeys(item).every((key) => ['accessoryId', 'qty'].includes(key) || (placed && key === 'fromBottom'))
      && typeof item.accessoryId === 'string' && item.accessoryId.length > 0
      && (!Object.hasOwn(item, 'fromBottom') || (Number.isFinite(item.fromBottom) && item.fromBottom > 0))
      && (!Object.hasOwn(item, 'qty') || (Number.isInteger(item.qty) && item.qty >= 2 && item.qty <= MAX_ACCESSORY_QTY)))
    && new Set(value.map((item) => item.accessoryId)).size === value.length;
}

function withAccessoryQty(item, qty) {
  const next = { ...item };
  if (qty === 1) delete next.qty;
  else next.qty = Math.min(MAX_ACCESSORY_QTY, qty);
  return next;
}

/** Preserve first occurrence order and combine quantities when sections or references merge. */
export function mergeAccessoryItems(a, b) {
  if (!isItemInput(a) || !isItemInput(b)) return a;
  const items = [...(a ?? []), ...(b ?? [])];
  const merged = [];
  for (const item of items) {
    const index = merged.findIndex(({ accessoryId }) => accessoryId === item.accessoryId);
    if (index >= 0) {
      const first = merged[index];
      merged[index] = withAccessoryQty(first, (first.qty ?? 1) + (item.qty ?? 1));
      if (!Object.hasOwn(first, 'fromBottom') && Object.hasOwn(item, 'fromBottom')) {
        merged[index].fromBottom = item.fromBottom;
      }
    } else merged.push({ ...item });
  }
  if (merged.length > MAX_SECTION_ACCESSORIES) return a;
  return merged.length ? merged : undefined;
}

function isItemInput(items) {
  return items === undefined || (Array.isArray(items) && !items.length) || isAccessoryItems(items, { placed: true });
}

export function addAccessoryItem(items = [], accessoryId) {
  if (!isItemInput(items) || typeof accessoryId !== 'string' || !accessoryId.length) return items;
  const index = items.findIndex((item) => item.accessoryId === accessoryId);
  if (index >= 0) return setAccessoryItem(items, index, { qty: Math.min(MAX_ACCESSORY_QTY, (items[index].qty ?? 1) + 1) });
  if (items.length >= MAX_SECTION_ACCESSORIES) return items;
  return [...items, { accessoryId }];
}

/** Quantity one/null restores the implicit quantity; changing to an existing id merges into it. */
export function setAccessoryItem(items, index, patch) {
  if (!isItemInput(items) || !Number.isInteger(index) || index < 0
    || index >= (items?.length ?? 0) || !isPlainObject(patch)
    || !Reflect.ownKeys(patch).every((key) => key === 'accessoryId'
      ? typeof patch[key] === 'string' && patch[key].length > 0
      : key === 'fromBottom' ? patch[key] === null || (Number.isFinite(patch[key]) && patch[key] > 0)
        : key === 'qty' && (patch[key] === null || (Number.isInteger(patch[key]) && patch[key] >= 1 && patch[key] <= MAX_ACCESSORY_QTY)))) return items;
  const next = items.map((item) => ({ ...item }));
  const item = { ...next[index], ...patch };
  if (item.fromBottom === null) delete item.fromBottom;
  next[index] = withAccessoryQty(item, item.qty ?? 1);
  const duplicate = next.findIndex((entry, i) => i !== index && entry.accessoryId === item.accessoryId);
  if (duplicate >= 0) {
    next[duplicate] = withAccessoryQty(next[duplicate], (next[duplicate].qty ?? 1) + (next[index].qty ?? 1));
    next.splice(index, 1);
  }
  return next;
}

export function removeAccessoryItem(items, index) {
  if (!isItemInput(items) || !Number.isInteger(index) || index < 0
    || index >= (items?.length ?? 0)) return items;
  const next = items.filter((_, i) => i !== index);
  return next.length ? next : undefined;
}

