import { describe, expect, it, vi } from 'vitest';
import { useReducer } from 'react';
import useProfileDraft from '../useProfileDraft.js';
import { newShape } from '../../../elevation/model/libraryShapes.js';

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal(),
  useReducer: vi.fn(),
  useEffect: vi.fn(),
  useCallback: (callback) => callback,
  useRef: (current) => ({ current }),
}));

describe('Step 497.1 profile draft top gap tracking', () => {
  it('marks top gap additions, changes and removals dirty and restores them with undo and redo', () => {
    const cut1 = { id: 'cut1', kind: 'base_cutout' };
    const cutg = { ...cut1, id: 'cutg', topGap: 2 };
    for (const [saved, next] of [
      [cut1, { ...cut1, topGap: 2 }],
      [cutg, { ...cutg, topGap: 3 }],
      [cutg, { id: 'cutg', kind: 'base_cutout' }],
    ]) {
      let state;
      useReducer.mockImplementation((reducer, initial, init) => {
        state ??= init(initial);
        return [state, (action) => { state = reducer(state, action); }];
      });
      const ProfileDraft = () => useProfileDraft(saved);
      expect(ProfileDraft().dirty).toBe(false);
      ProfileDraft().apply(next);
      expect(ProfileDraft()).toMatchObject({ dirty: true, canUndo: true, draft: next });
      ProfileDraft().undo();
      expect(ProfileDraft()).toMatchObject({ dirty: false, canRedo: true, draft: saved });
      ProfileDraft().redo();
      expect(ProfileDraft()).toMatchObject({ dirty: true, draft: next });
      expect(saved.topGap).toBe(saved === cut1 ? undefined : 2);
    }
  });
});

it('SH2 d tracks the optional shape key across header and geometry edits, undo, redo and Save', () => {
  const original = newShape([], 'shape');
  const key = (shape) => JSON.stringify([shape.name, shape.kind, shape.notes, shape.box, shape.views, shape.stretch]);
  for (const patch of [
    { name: 'Renamed' }, { kind: 'leg' }, { notes: 'Painted' },
    { box: { ...original.box, w: 30 } },
    { views: { front: { ...original.views.front, points: { ...original.views.front.points, p3: [30, 3] } } } },
    { stretch: { x: [[3, 9]] } },
  ]) {
    let state;
    let saved = original;
    useReducer.mockImplementation((reducer, initial, init) => {
      state ??= init(initial);
      return [state, (action) => { state = reducer(state, action); }];
    });
    const Draft = () => useProfileDraft(saved, key);
    const next = { ...original, ...patch };
    expect(Draft().dirty).toBe(false);
    Draft().apply(next);
    expect(Draft()).toMatchObject({ dirty: true, canUndo: true, draft: next });
    Draft().undo();
    expect(Draft()).toMatchObject({ dirty: false, canRedo: true, draft: original });
    Draft().redo();
    expect(Draft()).toMatchObject({ dirty: true, draft: next });
    saved = { ...next, version: 2 };
    expect(Draft().dirty).toBe(false);
  }
  expect(original.name).toBe('New shape');
});
