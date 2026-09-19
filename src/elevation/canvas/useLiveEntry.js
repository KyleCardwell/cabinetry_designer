import { useReducer, useRef } from 'react';
import { parseInches } from '../model/units.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Resolve the value currently represented by a live entry. */
export function resolveLiveEntryValue(entry) {
  if (!entry) return null;
  const parsed = entry.typed === null ? null : parseInches(entry.typed);
  const value = parsed === null ? entry.value : parsed;
  return clamp(value, entry.min, entry.max);
}

/**
 * Create the pure state controller used by useLiveEntry.
 * The optional notifier lets React request a render without owning the logic.
 */
export function createLiveEntryController(notify = () => {}) {
  let entry = null;
  let callbacks = null;

  const clear = () => {
    entry = null;
    callbacks = null;
    notify();
  };

  const cancel = () => {
    if (!entry) return;
    const onCancel = callbacks?.onCancel;
    clear();
    onCancel?.();
  };

  const begin = (config) => {
    if (entry) cancel();
    const min = Number.isFinite(config.min) ? config.min : -Infinity;
    const max = Number.isFinite(config.max) ? config.max : Infinity;
    entry = {
      kind: config.kind,
      label: config.label,
      value: clamp(config.value, min, max),
      typed: null,
      min,
      max,
      unit: 'in',
    };
    callbacks = {
      onCommit: config.onCommit,
      onCancel: config.onCancel,
    };
    notify();
  };

  const update = (value) => {
    if (!entry || entry.typed !== null || !Number.isFinite(value)) return;
    entry = { ...entry, value: clamp(value, entry.min, entry.max) };
    notify();
  };

  const setTyped = (text) => {
    if (!entry) return;
    entry = { ...entry, typed: String(text) };
    notify();
  };

  const commit = () => {
    if (!entry) return;
    const value = resolveLiveEntryValue(entry);
    const onCommit = callbacks?.onCommit;
    clear();
    onCommit?.(value);
  };

  return {
    get entry() {
      return entry;
    },
    begin,
    update,
    setTyped,
    commit,
    cancel,
  };
}

/** Manage one live numeric canvas entry at a time. */
export function useLiveEntry() {
  const [, render] = useReducer((value) => value + 1, 0);
  const controllerRef = useRef(null);
  if (controllerRef.current === null) {
    controllerRef.current = createLiveEntryController(render);
  }
  const controller = controllerRef.current;
  return {
    entry: controller.entry,
    begin: controller.begin,
    update: controller.update,
    setTyped: controller.setTyped,
    commit: controller.commit,
    cancel: controller.cancel,
  };
}

export default useLiveEntry;
