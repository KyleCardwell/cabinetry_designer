import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import elevationReducer, { updateSettings } from '../../store/elevationSlice.js';
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
const picker = (label) => nodes(render()).find(({ props }) => props['aria-label'] === label);
const pick = (label, value) => picker(label).props.onChange({ target: { value } });

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
  it('shows four blank fraction inputs with stone defaults, including a default stone top', () => {
    for (const top of ['stone', '']) {
      pick('Run top', top);
      for (const side of sides) {
        expect(field(side).props).toMatchObject({
          value: null, allowBlank: true, placeholder: side === 'back' ? '0' : '3/4',
        });
      }
    }
  });

  it('resolves default placeholders from the nosing pick and shop overhang independently of typed values', () => {
    room().profile.nosingProfileId = 'nz1';
    pick('Run top', 'wood');
    expect(sides.map((side) => field(side).props.placeholder)).toEqual(['0', '0', '0', '0']);
    enter('left', '12');
    expect(field('left').props).toMatchObject({ value: 12, placeholder: '0' });
    pick('Run Nosing profile', 'plain');
    expect(sides.map((side) => field(side).props.placeholder)).toEqual(['3/4', '0', '3/4', '3/4']);
    expect(field('left').props.value).toBe(12);
    dispatch(updateSettings({ bandDepths: { countertopOverhang: 1.25 } }));
    expect(field('left').props.placeholder).toBe('1 1/4');
    pick('Run Nosing profile', 'nz1');
    expect(field('left').props).toMatchObject({ value: 12, placeholder: '0' });
    enter('left', '');
    expect(run()).not.toHaveProperty('topOverhang');
    expect(field('left').props).toMatchObject({ value: null, placeholder: '0' });
  });

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

  it('hides the Overhang row for Crown and other non-countertops, retaining typed values', () => {
    enter('left', '12');
    for (const top of ['crown', 'topMold', 'none']) {
      pick('Run top', top);
      expect(nodes(render()).some(({ type, props }) => type === 'h4' && props.children === 'Overhang')).toBe(false);
      for (const side of sides) expect(field(side)).toBeUndefined();
      expect(run().topOverhang.left).toBe(12);
    }
    pick('Run top', 'wood');
    expect(field('left').props.value).toBe(12);
  });
});
