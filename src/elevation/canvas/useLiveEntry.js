import { useReducer, useRef } from 'react';
import { parseInches } from '../model/units.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeMode(mode) {
  const min = Number.isFinite(mode.min) ? mode.min : -Infinity;
  const max = Number.isFinite(mode.max) ? mode.max : Infinity;
  return {
    ...mode,
    unit: mode.unit ?? 'in',
    value: clamp(mode.value, min, max),
    min,
    max,
  };
}

/** Resolve the value currently represented by a live entry. */
export function resolveLiveEntryValue(entry) {
  if (!entry) return null;
  const parsed = entry.typed === null || entry.typed.trim() === ''
    ? null
    : (entry.unit === '°'
      ? (Number.isFinite(Number(entry.typed)) ? Number(entry.typed) : null)
      : parseInches(entry.typed));
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
    const modes = Array.isArray(config.modes) && config.modes.length > 0
      ? config.modes.map(normalizeMode)
      : null;
    const activeMode = modes?.[0] ?? normalizeMode(config);
    entry = {
      kind: config.kind,
      label: activeMode.label,
      value: activeMode.value,
      typed: null,
      min: activeMode.min,
      max: activeMode.max,
      unit: activeMode.unit,
      locked: {},
      ...(modes ? {
        modes,
        modeIndex: 0,
        modeKey: activeMode.key,
      } : {}),
    };
    callbacks = {
      onCommit: config.onCommit,
      onCancel: config.onCancel,
    };
    notify();
  };

  const update = (value, modeKey = entry?.modeKey) => {
    if (!entry || !Number.isFinite(value)) return;
    const modes = entry.modes?.map((mode) => mode.key === modeKey
      ? { ...mode, value: clamp(value, mode.min, mode.max) }
      : mode);
    const active = modeKey === entry.modeKey && (entry.typed === null || entry.typed.trim() === '');
    const nextValue = active ? clamp(value, entry.min, entry.max) : entry.value;
    if (nextValue === entry.value && (!modes || modes.every((mode, i) => mode.value === entry.modes[i].value))) return;
    entry = { ...entry, value: nextValue, ...(modes ? { modes } : {}) };
    notify();
  };

  const setTyped = (text) => {
    if (!entry) return;
    const locked = { ...entry.locked };
    if (String(text).trim() === '') delete locked[entry.modeKey];
    const empty = String(text).trim() === '';
    const mode = entry.modes?.[entry.modeIndex];
    entry = {
      ...entry,
      typed: String(text),
      value: empty && mode ? mode.value : entry.value,
      locked,
    };
    notify();
  };

  const cycle = () => {
    if (!entry?.modes || entry.modes.length < 2) return;
    const locked = { ...entry.locked };
    if (entry.typed?.trim()) locked[entry.modeKey] = resolveLiveEntryValue(entry);
    const modeIndex = (entry.modeIndex + 1) % entry.modes.length;
    const mode = entry.modes[modeIndex];
    entry = {
      ...entry,
      label: mode.label,
      value: mode.value,
      typed: locked[mode.key] === undefined ? null : String(locked[mode.key]),
      locked,
      unit: mode.unit,
      min: mode.min,
      max: mode.max,
      modeIndex,
      modeKey: mode.key,
    };
    notify();
  };

  const commit = () => {
    if (!entry) return;
    const value = resolveLiveEntryValue(entry);
    const modeKey = entry.modeKey;
    const locked = { ...entry.locked };
    if (modeKey !== undefined && entry.typed?.trim()) locked[modeKey] = value;
    const onCommit = callbacks?.onCommit;
    clear();
    onCommit?.(value, modeKey, locked);
  };

  return {
    get entry() {
      return entry;
    },
    begin,
    update,
    setTyped,
    cycle,
    commit,
    cancel,
  };
}

/** Manage one live numeric canvas entry at a time. */
function useLiveEntry() {
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
    cycle: controller.cycle,
    commit: controller.commit,
    cancel: controller.cancel,
  };
}

export default useLiveEntry;
