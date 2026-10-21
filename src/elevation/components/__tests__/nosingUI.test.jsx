import HeightBands from '../HeightBands.jsx';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { resolveProfile } from '../../model/profile.js';
import elevationReducer, { updateSettings } from '../../store/elevationSlice.js';
import { run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import SettingsPanel from '../SettingsPanel.jsx';
import RoomHeightsPanel from '../RoomHeightsPanel.jsx';
import OverrideField from '../OverrideField.jsx';
import OverrideInput from '../OverrideInput.jsx';
import WallHeightProperties from '../properties/WallHeightProperties.jsx';
import RunTopFields from '../properties/RunTopFields.jsx';

vi.mock('react', async (original) => ({
  ...await original(), useState: vi.fn(), useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

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
let state;
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const run = () => wall().runs[0];
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object'
    ? tree.type === HeightBands || tree.type === OverrideInput || tree.type === OverrideField
      ? nodes(tree.type(tree.props)) : [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : text(tree?.props?.children ?? []);
const panels = [
  ['Default', () => SettingsPanel(), () => state.settings.defaultProfile],
  ['Room', () => RoomHeightsPanel(), () => room().profile],
  ['Wall', () => WallHeightProperties({ room: room(), wall: wall(), plan: false }), () => wall().profile],
  ['Run', () => RunTopFields({ room: room(), wall: wall(), run: run(), settings: state.settings }), () => run().overrides],
];
const picker = (render, scope) => nodes(render()).find(({ props }) => (
  props['aria-label'] === `${scope} Nosing profile${scope === 'Wall' ? ' override' : ''}`
));
const pick = (render, scope, value) => picker(render, scope).props.onChange({ target: { value } });
const resolved = (scope) => resolveProfile(state.settings,
  scope === 'Default' ? undefined : room(), scope === 'Wall' || scope === 'Run' ? wall() : undefined);
const effective = (scope) => scope === 'Run' && run().overrides.nosingProfileId !== undefined
  ? run().overrides.nosingProfileId : resolved(scope).nosingProfileId;

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(makeRun({ top: 'wood' }));
  room().profile = {};
  state.settings.sectionProfiles = [
    nz1, { ...nz1, id: 'archived', archived: true }, { ...nz1, id: 'crown', kind: 'crown' },
  ];
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  useDispatch.mockReturnValue(dispatch);
  useState.mockImplementation(() => [true, vi.fn()]);
});

describe('SPEC-50.8 step 500 Nosing controls', () => {
  for (const [scope, render, target] of panels) {
    it(`${scope}: offers active nosing profiles and None, and commits the selected override`, () => {
      const options = nodes(picker(render, scope)).filter(({ type }) => type === 'option');
      expect(options.map(({ props }) => props.value)).toEqual(
        scope === 'Default' ? ['plain', 'nz1'] : ['', 'plain', 'nz1'],
      );
      expect(text(options.find(({ props }) => props.value === 'plain'))).toBe('None');
      pick(render, scope, 'nz1');
      expect(target().nosingProfileId).toBe('nz1');
      expect(picker(render, scope).props.value).toBe('nz1');
      expect(effective(scope)).toBe('nz1');
      pick(render, scope, 'plain');
      expect(target().nosingProfileId).toBeNull();
      expect(picker(render, scope).props.value).toBe('plain');
      expect(effective(scope)).toBeNull();
    });

    it(`${scope}: retains archived and missing picks as disabled options`, () => {
      for (const id of ['archived', 'missing']) {
        target().nosingProfileId = id;
        const field = picker(render, scope);
        expect(field.props.value).toBe(id);
        const option = nodes(field).find(({ type, props }) => type === 'option' && props.value === id);
        expect(option.props.disabled).toBe(true);
        expect(text(option)).toBe(`${id === 'archived' ? 'Chamfer nosing' : 'Missing profile'} (unavailable)`);
      }
    });
  }

  for (const [scope, render, target] of panels.slice(1)) {
    it(`${scope}: clears nosing picks according to scope and follows inherited changes`, () => {
      state.settings.defaultProfile.nosingProfileId = 'nz1';
      expect(picker(render, scope).props.value).toBe('');
      expect(effective(scope)).toBe('nz1');
      pick(render, scope, 'plain');
      expect(effective(scope)).toBeNull();
      pick(render, scope, 'nz1');
      pick(render, scope, '');
      expect(target()).not.toHaveProperty('nosingProfileId');
      expect(picker(render, scope).props.value).toBe('');
      expect(effective(scope)).toBe('nz1');
      dispatch(updateSettings({ defaultProfile: { nosingProfileId: null } }));
      expect(effective(scope)).toBeNull();
    });
  }

  it('shows the run override only for a wood top and preserves it when the top changes', () => {
    const [, render] = panels[3];
    pick(render, 'Run', 'nz1');
    const topPicker = () => nodes(render()).find(({ props }) => props['aria-label'] === 'Run top');
    for (const top of ['stone', 'crown', 'topMold', 'none', '']) {
      topPicker().props.onChange({ target: { value: top } });
      expect(picker(render, 'Run')).toBeUndefined();
      expect(run().overrides.nosingProfileId).toBe('nz1');
    }
    topPicker().props.onChange({ target: { value: 'wood' } });
    expect(picker(render, 'Run').props.value).toBe('nz1');
  });
});
