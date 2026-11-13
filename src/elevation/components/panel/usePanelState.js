import { useEffect, useState } from 'react';

const memory = new Map();
const listeners = new Map();

function readValue(key, initial) {
  if (memory.has(key)) return memory.get(key);
  let value = initial;
  try {
    const stored = localStorage.getItem(`ff.panel.${key}`);
    if (stored !== null) value = JSON.parse(stored);
  } catch { /* Storage may be unavailable; keep session state in memory. */ }
  memory.set(key, value);
  return value;
}

export default function usePanelState(key, initial) {
  const [value, setValue] = useState(() => readValue(key, initial));

  useEffect(() => {
    const subscribers = listeners.get(key) ?? new Set();
    listeners.set(key, subscribers);
    subscribers.add(setValue);
    setValue(readValue(key, initial));
    return () => {
      subscribers.delete(setValue);
      if (!subscribers.size) listeners.delete(key);
    };
  }, [key, initial]);

  const update = (next) => {
    const current = readValue(key, initial);
    const resolved = typeof next === 'function' ? next(current) : next;
    memory.set(key, resolved);
    try {
      localStorage.setItem(`ff.panel.${key}`, JSON.stringify(resolved));
    } catch { /* The shared memory value also survives a remount. */ }
    setValue(resolved);
    listeners.get(key)?.forEach((notify) => notify(resolved));
  };

  return [value, update];
}
