import HeightBands from '../HeightBands.jsx';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { resolveProfile } from '../../model/profile.js';
import elevationReducer, { updateSettings } from '../../store/elevationSlice.js';
import { stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import InchInput from '../InchInput.jsx';
import SettingsPanel from '../SettingsPanel.jsx';
import ShopHeightsPanel from '../ShopHeightsPanel.jsx';
import RoomHeightsPanel from '../RoomHeightsPanel.jsx';
import OverrideField from '../OverrideField.jsx';
import OverrideInput from '../OverrideInput.jsx';
import WallHeightProperties from '../properties/WallHeightProperties.jsx';
import Field from '../properties/Field.jsx';

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal(), useState: vi.fn(), useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const { profiles } = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const tm3 = profiles.find(({ id }) => id === 'tm3');
const cr45 = profiles.find(({ id }) => id === 'cr45');
let state;
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object'
    ? tree.type === Field || tree.type === ShopHeightsPanel || tree.type === HeightBands || tree.type === OverrideInput || tree.type === OverrideField
      ? nodes(tree.type(tree.props)) : [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : typeof tree === 'string' || typeof tree === 'number' ? String(tree)
    : [ShopHeightsPanel, HeightBands, Field].includes(tree?.type) ? text(tree.type(tree.props)) : text(tree?.props?.children ?? []);
const panels = [
  ['Default', () => SettingsPanel()],
  ['Room', () => RoomHeightsPanel()],
  ['Wall', () => WallHeightProperties({ room: room(), wall: wall(), plan: false })],
];
const field = (tree, scope, label) => nodes(tree).find(({ props }) => props['aria-label'] === `${scope} ${label}${scope === 'Wall' ? ' override' : ''}`);
const options = (picker) => nodes(picker).filter(({ type }) => type === 'option');
const pick = (render, scope, label, value) => field(render(), scope, label).props.onChange({ target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun();
  state.settings.sectionProfiles = [tm3, cr45, { ...tm3, id: 'archived', archived: true }];
  room().profile = {};
  // These tests edit fixtures in place; give memoized selectors a fresh settings reference per render.
  useSelector.mockImplementation((selector) => selector({
    elevation: { ...state, settings: { ...state.settings } },
  }));
  useDispatch.mockReturnValue(dispatch);
  useState.mockImplementation(() => [true, vi.fn()]);
});

describe('Step 473 molding height panels', () => {
  it('DB2 e: displays inherited room heights as placeholders before editing and after clearing', () => {
    expect(room().profile).toEqual({});
    expect(field(RoomHeightsPanel(), 'Room', 'Wall height').props).toMatchObject({ value: null, placeholder: '96' });
    dispatch(updateSettings({ defaultProfile: { wallHeight: 108 } }));
    expect(field(RoomHeightsPanel(), 'Room', 'Wall height').props).toMatchObject({ value: null, placeholder: '108' });
    field(RoomHeightsPanel(), 'Room', 'Wall height').props.onCommit(100);
    expect(field(RoomHeightsPanel(), 'Room', 'Wall height').props.value).toBe(100);
    field(RoomHeightsPanel(), 'Room', 'Wall height').props.onCommit(null);
    expect(room().profile).toEqual({});
    expect(field(RoomHeightsPanel(), 'Room', 'Wall height').props).toMatchObject({ value: null, placeholder: '108' });
  });

  for (const [scope, render] of panels) {
    it(`${scope}: offers active profiles by kind, None, and scoped unpicked or Inherit; commits picks and overhang`, () => {
      const tree = render();
      expect(options(field(tree, scope, 'Top mold profile')).map(({ props }) => props.value))
        .toEqual(['', 'none', 'tm3']);
      expect(options(field(tree, scope, 'Crown profile')).map(({ props }) => props.value))
        .toEqual(['', 'none', 'cr45']);
      pick(render, scope, 'Top mold profile', 'tm3');
      pick(render, scope, 'Crown profile', 'cr45');
      const overhang = field(render(), scope, 'Top mold overhang');
      expect(overhang.type).toBe(InchInput);
      overhang.props.onCommit(0);
      const resolved = resolveProfile(state.settings, scope === 'Default' ? undefined : room(), scope === 'Wall' ? wall() : undefined);
      expect(resolved).toMatchObject({ topMoldProfileId: 'tm3', crownProfileId: 'cr45', topMoldOverhang: 0 });
    });

    it(`${scope}: locks profile-derived heights, keeps stretch height editable and preserves typed values`, () => {
      state.settings.defaultProfile = { ...state.settings.defaultProfile, topMoldProfileId: 'tm3', crownProfileId: 'cr45', crownHeight: 9, topMoldHeight: 8 };
      let tree = render();
      expect(field(tree, scope, 'Crown').props).toMatchObject({ value: 4.5, readOnly: true });
      field(tree, scope, 'Crown').props.onCommit(4.5);
      expect(dispatch).not.toHaveBeenCalled();
      expect(field(tree, scope, 'Top mold').props.readOnly).toBe(false);
      state.settings.sectionProfiles = [(({ stretch, ...fixed }) => { void stretch; return fixed; })(tm3), cr45];
      tree = render();
      expect(field(tree, scope, 'Top mold').props).toMatchObject({ value: 3, readOnly: true });
      expect(text(tree)).not.toContain('from profile');
      for (const label of ['Crown', 'Top mold']) {
        const wrapper = nodes(tree).find(({ type, props }) => type === 'label'
          && nodes(props.children).some(({ props }) => props['aria-label'] === `${scope} ${label}${scope === 'Wall' ? ' override' : ''}`));
        expect(nodes(wrapper).some(({ type, props }) => type === 'span' && props.children === 'profile'
          && props.className === 'text-[10px] text-gray-500')).toBe(true);
        expect(InchInput(field(tree, scope, label).props).props.className).toContain('text-gray-500 border-gray-700 border-dashed');
      }
      expect(text(tree)).toContain('Overlap 1 1/2"');
      pick(render, scope, 'Top mold profile', 'none');
      pick(render, scope, 'Crown profile', 'none');
      expect(field(render(), scope, 'Top mold').props.readOnly).toBe(true);
      expect(field(render(), scope, 'Crown').props.readOnly).toBe(true);
      dispatch.mockClear();
      for (const label of ['Crown', 'Top mold']) {
        const control = field(render(), scope, label);
        expect(InchInput(control.props).props.className).toContain('text-gray-500');
        control.props.onCommit(12);
        const picker = field(render(), scope, `${label} profile`);
        expect(options(picker).filter(({ props }) => props.value === 'none')).toHaveLength(1);
        expect(options(picker).find(({ props }) => props.value === 'none').props.disabled).toBeUndefined();
      }
      expect(dispatch).not.toHaveBeenCalled();
      expect(field(render(), scope, 'Crown total').props.readOnly).toBe(false);
      expect(state.settings.defaultProfile).toMatchObject({ topMoldHeight: 8, crownHeight: 9 });
    });

    it(`${scope}: displays amber gap, too-short, above-total and missing-pick notes from resolved moldings`, () => {
      state.settings.defaultProfile = { ...state.settings.defaultProfile, topMoldProfileId: 'tm3', crownProfileId: 'cr45', topMoldHeight: 1 };
      const warnings = (tree) => nodes(tree).filter(({ type, props }) => type === 'p' && props.className?.includes('text-amber-400')).map(text);
      expect(warnings(render())).toEqual([
        "The top mold is shorter than its profile's stretch line; drawn at its own size.",
        'The top mold doesn\'t reach the crown (gap of 1/2").',
      ]);
      state.settings.defaultProfile.topMoldHeight = 7;
      expect(warnings(render())).toEqual(['The top mold is taller than the crown total.']);
      state.settings.defaultProfile.topMoldHeight = 3;
      state.settings.defaultProfile.crownProfileId = 'missing';
      expect(warnings(render())).toEqual(['The picked profile is missing; plain molding used.']);
      expect(field(render(), scope, 'Crown').props.readOnly).toBe(false);
      state.settings.defaultProfile.crownProfileId = 'tm3';
      expect(warnings(render())).toEqual(['The picked profile is missing; plain molding used.']);
    });

    it(`${scope}: retains archived selections and resolves their heights`, () => {
      const target = scope === 'Default' ? state.settings.defaultProfile : scope === 'Room' ? room().profile : wall().profile;
      target.topMoldProfileId = 'archived';
      const picker = field(render(), scope, 'Top mold profile');
      expect(picker.props.value).toBe('archived');
      expect(options(picker).find(({ props }) => props.value === 'archived').props.disabled).toBe(true);
      expect(text(render())).not.toContain('The picked profile is missing');
    });
  }

  for (const [scope, render] of panels.slice(1)) {
    it(`${scope}: clears profile picks according to scope and follows inherited changes`, () => {
      state.settings.defaultProfile = { ...state.settings.defaultProfile, topMoldProfileId: 'tm3', crownProfileId: 'cr45', topMoldOverhang: 0.5 };
      expect(field(render(), scope, 'Crown profile').props.value).toBe('');
      expect(field(render(), scope, 'Crown').props).toMatchObject({ value: 4.5, readOnly: true });
      const overhang = field(render(), scope, 'Top mold overhang');
      expect(overhang.props).toMatchObject({ value: null, allowBlank: true, placeholder: '1/2' });
      pick(render, scope, 'Crown profile', 'none');
      expect(field(render(), scope, 'Crown profile').props.value).toBe('none');
      expect(field(render(), scope, 'Crown').props.readOnly).toBe(true);
      pick(render, scope, 'Crown profile', '');
      expect(scope === 'Room' ? room().profile : wall().profile).not.toHaveProperty('crownProfileId');
      expect(field(render(), scope, 'Crown').props.readOnly).toBe(true);
      dispatch(updateSettings({ defaultProfile: { crownProfileId: null } }));
      expect(field(render(), scope, 'Crown').props.readOnly).toBe(false);
      expect(field(render(), scope, 'Crown profile').props.value).toBe('');
    });
  }
});


describe('DM4 step b picker anchors', () => {
  it('anchor 1: room Crown offers Inherit with the profile name, None, and cr45', () => {
    state.settings.defaultProfile.crownProfileId = 'cr45';
    const picker = field(RoomHeightsPanel(), 'Room', 'Crown profile');
    expect(options(picker).map(({ props }) => [props.value, text(props.children)]))
      .toEqual([['', `Inherit (${cr45.name})`], ['none', 'None'], ['cr45', cr45.name]]);
    for (const [scope, render] of panels.slice(1)) {
      for (const label of ['Crown', 'Top mold']) {
        const key = label === 'Crown' ? 'crownProfileId' : 'topMoldProfileId';
        for (const [value, name] of [['none', 'None'], [null, 'Not picked'], [undefined, 'Not picked']]) {
          state.settings.defaultProfile[key] = value;
          const tree = render();
          expect(text(options(field(tree, scope, `${label} profile`))[0])).toBe(`Inherit (${name})`);
          expect(field(tree, scope, label).props.readOnly).toBe(value === 'none');
        }
      }
    }
  });

  it('anchor 2: unpicked shop Top mold offers Pick a profile, None, and tm3 with empty value', () => {
    for (const label of ['Top mold', 'Crown']) {
      const key = label === 'Crown' ? 'crownProfileId' : 'topMoldProfileId';
      const profile = label === 'Crown' ? cr45 : tm3;
      for (const value of [null, undefined]) {
        dispatch(updateSettings({ defaultProfile: { [key]: value } }));
        const picker = field(ShopHeightsPanel({}), 'Default', `${label} profile`);
        expect(picker.props.value).toBe('');
        expect(options(picker).map(({ props }) => [props.value, text(props.children)]))
          .toEqual([['', 'Pick a profile'], ['none', 'None'], [profile.id, profile.name]]);
      }
      pick(() => ShopHeightsPanel({}), 'Default', `${label} profile`, 'none');
      expect(state.settings.defaultProfile[key]).toBe('none');
      pick(() => ShopHeightsPanel({}), 'Default', `${label} profile`, '');
      expect(state.settings.defaultProfile[key]).toBeNull();
    }
  });

  it('anchor 3: room Crown None stores none and wall follows the room choice', () => {
    state.settings.defaultProfile.crownProfileId = 'cr45';
    pick(RoomHeightsPanel, 'Room', 'Crown profile', 'none');
    expect(room().profile.crownProfileId).toBe('none');
    expect(field(RoomHeightsPanel(), 'Room', 'Crown').props.readOnly).toBe(true);
    const renderWall = panels[2][1];
    expect(text(options(field(renderWall(), 'Wall', 'Crown profile'))[0])).toBe('Inherit (None)');
    expect(field(renderWall(), 'Wall', 'Crown').props.readOnly).toBe(true);
    pick(renderWall, 'Wall', 'Crown profile', 'cr45');
    expect(field(renderWall(), 'Wall', 'Crown').props.value).toBe(4.5);
    pick(renderWall, 'Wall', 'Crown profile', '');
    expect(wall().profile).not.toHaveProperty('crownProfileId');
    expect(field(renderWall(), 'Wall', 'Crown').props.readOnly).toBe(true);
  });
});
