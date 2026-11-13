import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import elevationReducer from '../../store/elevationSlice.js';
import { run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import InchInput from '../InchInput.jsx';
import RunTopFields from '../properties/RunTopFields.jsx';

vi.mock('react', async (original) => ({
  ...await original(), useState: vi.fn(), useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

const nz1 = {
  id: 'nz1', name: 'Chamfer nosing', kind: 'nosing',
  geometry: {
    units: 'in', points: { a: [0, 0], b: [0.25, 0], c: [0.5, -0.25], d: [0.5, -1.5], e: [0, -1.5] },
    loops: [{ id: 'L1', closed: true, segs: ['a', 'b', 'c', 'd', 'e'].map((from, i, ids) => ({
      type: 'line', from, to: ids[(i + 1) % ids.length],
    })) }],
  },
  drawnPoints: { elevation: ['c'] },
};
const sides = ['front', 'back', 'left', 'right'];
let state;
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const run = () => wall().runs[0];
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const render = () => RunTopFields({ room: room(), wall: wall(), run: run(), settings: state.settings });
const field = (side) => nodes(render()).find(({ type, props }) => (
  type === InchInput && props['aria-label'] === `Run ${side} overhang`
));

// Exercise the existing fraction input's text entry and blur commit with this row's callback.
function enter(side, entry) {
  let text;
  useState.mockImplementation((initial) => {
    text ??= typeof initial === 'function' ? initial() : initial;
    return [text, (next) => { text = next; }];
  });
  const input = () => InchInput(field(side).props);
  input().props.onChange({ target: { value: entry } });
  input().props.onBlur();
  return text;
}

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(makeRun({ top: 'stone' }));
  state.settings.sectionProfiles = [nz1];
  useDispatch.mockReturnValue(dispatch);
});

describe('SPEC-50.9 step 503 Overhang controls', () => {

  for (const side of sides) {
    it(`${side}: commits inches, fractions and explicit zero, and removes only the cleared key`, () => {
      for (const [text, value] of [['12', 12], ['1 1/2', 1.5], ['0', 0]]) {
        enter(side, text);
        expect(run().topOverhang[side]).toBe(value);
        expect(field(side).props.value).toBe(value);
      }
      const other = sides.find((candidate) => candidate !== side);
      enter(other, '2');
      enter(side, '');
      expect(run().topOverhang).toEqual({ [other]: 2 });
      expect(field(side).props.value).toBeNull();
      enter(other, '');
      expect(run()).not.toHaveProperty('topOverhang');
    });
  }

  it('rejects negative and invalid text without changing the stored overhang', () => {
    enter('left', '12');
    dispatch.mockClear();
    for (const text of ['-1/4', 'garbage', 'Infinity', '1/0']) {
      expect(enter('left', text)).toBe('12');
      expect(run().topOverhang.left).toBe(12);
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

});
