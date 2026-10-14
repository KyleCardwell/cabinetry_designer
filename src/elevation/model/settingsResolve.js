import { DEFAULT_SETTINGS } from './constants.js';
import { SETTINGS_REGISTRY, allowedAt, registryEntry } from './settingsRegistry.js';

function leafValue(values, key) {
  let value = values;
  for (const part of key.split('.')) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, part)) return undefined;
    value = value[part];
  }
  return value;
}

function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child)]));
  }
  return value;
}

function writeLeaf(values, parts, value, remove = false) {
  const result = { ...values };
  const [part, ...rest] = parts;
  if (rest.length) {
    const child = writeLeaf(values?.[part], rest, value, remove);
    if (Object.keys(child).length) result[part] = child;
    else delete result[part];
  } else if (remove) delete result[part];
  else Object.defineProperty(result, part, { value, enumerable: true, writable: true, configurable: true });
  return result;
}

/** Resolve supplied layers leaf by leaf, including deliberate pins equal to inherited values.
 * Managed profile leaves can be supplied by their existing room.profile mechanism.
 * Validation of editable overrides belongs to cleanOverrides.
 */
export function resolveSetting(key, chain = []) {
  let value = leafValue(DEFAULT_SETTINGS, key);
  let source = { level: 'default' };
  const known = Boolean(registryEntry(key));
  for (const layer of chain) {
    if (!known && layer.level !== 'team') continue;
    const candidate = leafValue(layer.values, key);
    if (candidate === undefined) continue;
    value = candidate;
    source = { level: layer.level, ...(layer.id === undefined ? {} : { id: layer.id }) };
  }
  return { value, source };
}

/** Preserve today's settings shape, taking non-registry values only from the team layer. */
export function resolveSettings(chain = []) {
  let result = copy(DEFAULT_SETTINGS);
  for (const layer of chain) {
    if (layer.level === 'team') result = { ...result, ...copy(layer.values) };
  }
  for (const { key } of SETTINGS_REGISTRY) {
    result = writeLeaf(result, key.split('.'), copy(resolveSetting(key, chain).value));
  }
  return result;
}

/** Set or remove a dotted leaf without mutating the input; prune empty parents on removal. */
export function withOverride(values, key, value) {
  // Dotted paths may come from external input; never permit prototype traversal.
  const parts = key.split('.');
  if (parts.some((part) => !part || ['__proto__', 'prototype', 'constructor'].includes(part))) return { ...values };
  return writeLeaf(values, parts, value, value === null || value === undefined);
}

function validValue(entry, value) {
  switch (entry.kind) {
    case 'number': return Number.isFinite(value);
    case 'bool': return typeof value === 'boolean';
    case 'choice': return entry.choices.includes(value);
    case 'id': return value === null || typeof value === 'string';
    default: return false;
  }
}

/** Keep editable, well-typed leaves only, pruning rejected parents. */
export function cleanOverrides(values, level) {
  let result = {};
  for (const entry of SETTINGS_REGISTRY) {
    const value = leafValue(values, entry.key);
    if (!entry.managedBy && allowedAt(entry.key, level) && validValue(entry, value)) {
      result = writeLeaf(result, entry.key.split('.'), value);
    }
  }
  return result;
}
