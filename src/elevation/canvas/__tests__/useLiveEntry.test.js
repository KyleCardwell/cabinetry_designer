import { describe, expect, it, vi } from 'vitest';
import { createLiveEntryController } from '../useLiveEntry.js';

function config(overrides = {}) {
  return {
    kind: 'test',
    label: 'Distance',
    value: 5,
    min: 0,
    max: 10,
    onCommit: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

describe('useLiveEntry state', () => {
  it('ignores pointer updates once the user has typed', () => {
    const live = createLiveEntryController();
    live.begin(config());
    live.update(7);
    live.setTyped('8 1/2');
    live.update(9);

    expect(live.entry).toMatchObject({ value: 7, typed: '8 1/2' });
  });

  it('prefers a parseable typed value and falls back to the live value', () => {
    const typed = config();
    const live = createLiveEntryController();
    live.begin(typed);
    live.setTyped('7 1/2');
    live.commit();
    expect(typed.onCommit).toHaveBeenCalledWith(7.5);
    expect(live.entry).toBeNull();

    const fallback = config({ value: 4 });
    live.begin(fallback);
    live.setTyped('not inches');
    live.commit();
    expect(fallback.onCommit).toHaveBeenCalledWith(4);
  });

  it('clamps initial, pointer, and typed commit values', () => {
    const initial = config({ value: -4 });
    const live = createLiveEntryController();
    live.begin(initial);
    expect(live.entry.value).toBe(0);
    live.update(20);
    expect(live.entry.value).toBe(10);
    live.setTyped('18');
    live.commit();
    expect(initial.onCommit).toHaveBeenCalledWith(10);
  });

  it('cancels the first entry before beginning a second one', () => {
    const first = config({ kind: 'first' });
    const second = config({ kind: 'second' });
    const live = createLiveEntryController();

    live.begin(first);
    live.begin(second);

    expect(first.onCancel).toHaveBeenCalledOnce();
    expect(second.onCancel).not.toHaveBeenCalled();
    expect(live.entry.kind).toBe('second');
  });

  it('87. cycles through live-entry modes', () => {
    const live = createLiveEntryController();
    live.begin(config({
      modes: [
        { key: 'first', label: 'First', value: 4, min: 1, max: 8 },
        { key: 'second', label: 'Second', value: 12, min: 10, max: 20 },
      ],
    }));

    expect(live.entry).toMatchObject({ label: 'First', value: 4, min: 1, max: 8 });
    live.cycle();
    expect(live.entry).toMatchObject({ label: 'Second', value: 12, min: 10, max: 20 });
    live.cycle();
    expect(live.entry).toMatchObject({ label: 'First', value: 4, min: 1, max: 8 });
  });

  it('88. clears typed text on cycle and commits the active mode key', () => {
    const entry = config({
      modes: [
        { key: 'first', label: 'First', value: 4, min: 1, max: 8 },
        { key: 'second', label: 'Second', value: 12, min: 10, max: 20 },
      ],
    });
    const live = createLiveEntryController();
    live.begin(entry);
    live.setTyped('7');
    live.cycle();

    expect(live.entry.typed).toBeNull();
    live.commit();
    expect(entry.onCommit).toHaveBeenCalledWith(12, 'second');
  });
});
