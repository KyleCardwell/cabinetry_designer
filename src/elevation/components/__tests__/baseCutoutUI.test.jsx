import HeightBands from '../HeightBands.jsx';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { runScene } from '../../model/runScene.js';
import { toElevationDocument } from '../../store/persistence.js';
import elevationReducer from '../../store/elevationSlice.js';
import { fixed, run as fixtureRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import InchInput from '../InchInput.jsx';
import SettingsPanel from '../SettingsPanel.jsx';
import ShopHeightsPanel from '../ShopHeightsPanel.jsx';
import SettingGroups from '../SettingGroups.jsx';
import SettingField from '../SettingField.jsx';
import RoomHeightsPanel from '../RoomHeightsPanel.jsx';
import OverrideField from '../OverrideField.jsx';
import OverrideInput from '../OverrideInput.jsx';
import BaseCutoutRow from '../properties/BaseCutoutRow.jsx';
import AddBaseCutoutButton from '../properties/AddBaseCutoutButton.jsx';
import RunBaseCutoutsSection from '../properties/RunBaseCutoutsSection.jsx';
import WallHeightProperties from '../properties/WallHeightProperties.jsx';

vi.mock('react', async (original) => ({
  ...await original(), useState: vi.fn(), useEffect: vi.fn(), useMemo: (callback) => callback(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const cut1 = { id: 'cut1', name: 'Cutout cove', kind: 'base_cutout', geometry: { units: 'in',
  points: { a: [0, 0], b: [1.5, 1.5] }, loops: [{ id: 'L1', closed: false,
    segs: [{ type: 'arc', from: 'a', to: 'b', center: [0, 1.5], ccw: true }] }] } };
let state;
const dispatch = vi.fn((action) => { state = structuredClone(elevationReducer(state, action)); });
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const run = () => wall().runs[0];
const props = () => ({ room: room(), wall: wall(), run: run(), settings: state.settings });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object'
    ? tree.type === ShopHeightsPanel || tree.type === HeightBands || tree.type === OverrideInput || tree.type === OverrideField || tree.type === SettingGroups || tree.type === SettingField
      ? nodes(tree.type(tree.props)) : [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : text(tree?.props?.children ?? []);
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const expandCutoutRows = (tree) => {
  if (Array.isArray(tree)) return tree.map(expandCutoutRows);
  if (!tree || typeof tree !== 'object') return tree;
  if (tree.type === BaseCutoutRow) return expandCutoutRows(BaseCutoutRow(tree.props));
  return { ...tree, props: { ...tree.props, children: expandCutoutRows(tree.props.children) } };
};
const render = (extra = {}) => expandCutoutRows(RunBaseCutoutsSection({ ...props(), ...extra }));
const commit = (label, value, panel = render) => field(panel(), `Cutout 1 ${label}`).props.onCommit(value);
const add = (id = 'c1') => {
  const scene = runScene(room(), wall(), run(), state.settings);
  const piece = scene.cells.pieces.find((piece) => piece.id === id);
  AddBaseCutoutButton({ ...props(), piece }).props.onClick();
};
const panels = [
  ['Default', () => SettingsPanel(), () => state.settings.defaultProfile],
  ['Room', () => RoomHeightsPanel(), () => room().profile],
  ['Wall', () => WallHeightProperties({ room: room(), wall: wall(), plan: false }), () => wall().profile],
];

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(fixtureRun({ x: 30, width: 36, autoCount: false,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [fixed('c1', 18), fixed('c2', 18)],
  }));
  room().profile = {};
  Object.assign(state.settings.defaultProfile, { baseKind: 'furniture_base', toeKickHeight: 4 });
  state.settings.sectionProfiles = structuredClone([cut1, { ...cut1, id: 'archived', archived: true }, { ...cut1, id: 'wrong', kind: 'crown' }]);
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  useState.mockImplementation(() => [true, vi.fn()]);
});

describe('Step 494 base cutout controls', () => {

  it('case 3: keeps Left 2 and Right 5, then centres Width 24 by clearing both clearances', () => {
    add();
    commit('Left', 2);
    commit('Right', 5);
    const refs = { id: run().baseCutouts[0].id, from: 'c1', to: 'c1' };
    expect(run().baseCutouts[0]).toEqual({ ...refs, left: 2, right: 5 });
    commit('Width', 24);
    expect(run().baseCutouts[0]).toEqual({ ...refs, width: 24 });
  });

  it('case 4: clears Width 24 when Right 1 is typed alongside Left 4 (and mirrors this for Left)', () => {
    add();
    commit('Width', 24);
    commit('Left', 4);
    expect(run().baseCutouts[0]).toMatchObject({ width: 24, left: 4 });
    commit('Right', 1);
    const refs = { id: run().baseCutouts[0].id, from: 'c1', to: 'c1' };
    expect(run().baseCutouts[0]).toEqual({ ...refs, left: 4, right: 1 });
    commit('Left', null);
    commit('Width', 24);
    expect(run().baseCutouts[0]).toEqual({ ...refs, width: 24, right: 1 });
    commit('Left', 2);
    expect(run().baseCutouts[0]).toEqual({ ...refs, left: 2, right: 1 });
  });

  it('accepts zero clearances, rejects negative and nonfinite dimensions, and removes cleared keys', () => {
    add();
    for (const label of ['Left', 'Right', 'Width']) {
      for (const value of [-1, Infinity, NaN]) expect(commit(label, value)).toBe(false);
    }
    for (const label of ['Left', 'Right']) {
      commit(label, 0);
      expect(run().baseCutouts[0][label.toLowerCase()]).toBe(0);
      useState.mockReturnValueOnce(['', vi.fn()]);
      InchInput(field(render(), `Cutout 1 ${label}`).props).props.onBlur();
      expect(run().baseCutouts[0]).not.toHaveProperty(label.toLowerCase());
    }
    expect(toElevationDocument(state).rooms[0].walls[0].runs[0].baseCutouts[0])
      .toEqual({ id: expect.any(String), from: 'c1', to: 'c1' });
  });

  for (const [code, changes, message] of [
    ['orphaned', { to: 'missing' }, 'A selected cabinet is missing or is no longer on the bottom row.'],
    ['no-base', {}, 'This run has no furniture base.'],
    ['profile-bad', { profileId: 'missing' }, 'The profile must be an open line from the floor to its highest point; square notch used.'],
    ['too-narrow', { profileId: 'cut1', width: 1 }, 'The cutout is too narrow for its profile or feet.'],
    ['too-tall', {}, 'The cutout must be shorter than the base.'],
    ['overlap', { width: 40 }, 'The cutout overlaps another cutout or extends past the base ends.'],
  ]) {
  }

  for (const [scope, panel, target] of panels) {
  }

});
