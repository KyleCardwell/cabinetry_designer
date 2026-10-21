import HeightBands from '../HeightBands.jsx';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CABINET_TYPE_IDS } from '../../model/constants.js';
import { runBase } from '../../model/furnitureBase.js';
import elevationReducer, { updateSettings } from '../../store/elevationSlice.js';
import { run as fixtureRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import SettingsPanel from '../SettingsPanel.jsx';
import ShopHeightsPanel from '../ShopHeightsPanel.jsx';
import RoomHeightsPanel from '../RoomHeightsPanel.jsx';
import OverrideField from '../OverrideField.jsx';
import OverrideInput from '../OverrideInput.jsx';
import WallHeightProperties from '../properties/WallHeightProperties.jsx';
import RunHeightsSection from '../properties/RunHeightsSection.jsx';

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal(), useState: vi.fn(), useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const { profiles } = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const fb4 = profiles.find(({ id }) => id === 'fb4');
let state;
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const run = () => wall().runs[0];
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object'
    ? tree.type === ShopHeightsPanel || tree.type === HeightBands || tree.type === OverrideInput || tree.type === OverrideField
      ? nodes(tree.type(tree.props)) : [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : text(tree?.props?.children ?? []);
const field = (tree, scope, label) => nodes(tree).find(({ props }) => props['aria-label'] === `${scope} ${label}${['Wall', 'Run'].includes(scope) ? ' override' : ''}`);
const options = (picker) => nodes(picker).filter(({ type }) => type === 'option');
const pick = (render, scope, label, value) => field(render(), scope, label).props.onChange({ target: { value } });
const panels = [
  ['Default', () => SettingsPanel(), () => state.settings.defaultProfile],
  ['Room', () => RoomHeightsPanel(), () => room().profile],
  ['Wall', () => WallHeightProperties({ room: room(), wall: wall(), plan: false }), () => wall().profile],
];
const runPanel = () => RunHeightsSection({
  room: room(), wall: wall(), run: run(), settings: state.settings,
  actionBase: { roomId: room().id, wallId: wall().id, runId: run().id }, validateAndDispatch: vi.fn(),
});
const warnings = (tree) => nodes(tree).filter(({ type, props }) => type === 'p' && props.className?.includes('text-amber-400')).map(text);
const shortNote = "The furniture base is shorter than its profile's stretch line; drawn at its own size.";
const mismatchNote = 'The furniture base profile height differs from the base height; drawn at its own size.';

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(fixtureRun());
  state.settings.sectionProfiles = [fb4, { ...fb4, id: 'archived', archived: true }, { ...fb4, id: 'wrong-kind', kind: 'crown' }];
  room().profile = {};
  // These tests edit fixtures in place; give memoized selectors a fresh settings reference per render.
  useSelector.mockImplementation((selector) => selector({
    elevation: { ...state, settings: { ...state.settings } },
  }));
  useDispatch.mockReturnValue(dispatch);
  useState.mockImplementation(() => [true, vi.fn()]);
});

describe('Step 491 furniture base height panels', () => {
  it('shows bad-cut and extra-cut notes at default, room, wall and run scopes', () => {
    const cut = profiles.find(({ id }) => id === 'fb4cut');
    Object.assign(state.settings.defaultProfile, { baseKind: 'furniture_base', furnitureBaseProfileId: cut.id });
    const bad = structuredClone(cut);
    bad.geometry.points.b[0] = 0.125;
    const extra = structuredClone(cut);
    extra.geometry.loops.push({ ...extra.geometry.loops[0], id: 'extra' });
    for (const [profile, note] of [
      [bad, 'The furniture base cut goes outside the board; plain board used.'],
      [extra, 'The furniture base profile has extra open lines; only the first cut is used.'],
    ]) {
      state.settings.sectionProfiles = [profile];
      for (const render of [...panels.map(([, render]) => render), runPanel]) {
        expect(warnings(render())).toEqual([note]);
      }
    }
  });

  for (const [scope, render, target] of panels) {
    it(`${scope}: switches base kind and saves the active furniture profile and proud`, () => {
      expect(field(render(), scope, 'Furniture base profile')).toBeUndefined();
      expect(field(render(), scope, 'Base proud')).toBeUndefined();
      expect(field(render(), scope, 'Toe kick / base height')).toBeDefined();
      expect(options(field(render(), scope, 'Base')).map(({ props }) => props.value))
        .toEqual(scope === 'Default' ? ['toe_kick', 'furniture_base'] : ['', 'toe_kick', 'furniture_base']);
      pick(render, scope, 'Base', 'furniture_base');
      expect(options(field(render(), scope, 'Furniture base profile')).map(({ props }) => props.value))
        .toEqual(scope === 'Default' ? ['plain', 'fb4'] : ['', 'plain', 'fb4']);
      pick(render, scope, 'Furniture base profile', 'fb4');
      field(render(), scope, 'Base proud').props.onCommit(0);
      expect(target()).toMatchObject({ baseKind: 'furniture_base', furnitureBaseProfileId: 'fb4', furnitureBaseProud: 0 });
      expect(field(render(), scope, 'Base proud').props.onCommit(-0.5)).toBe(false);
      expect(target().furnitureBaseProud).toBe(0);
      pick(render, scope, 'Furniture base profile', 'plain');
      expect(target().furnitureBaseProfileId).toBeNull();
      pick(render, scope, 'Base', 'toe_kick');
      expect(target().baseKind).toBe('toe_kick');
      expect(field(render(), scope, 'Furniture base profile')).toBeUndefined();
    });

    it(`${scope}: shows runBase warnings and retains an archived pick`, () => {
      Object.assign(state.settings.defaultProfile, { baseKind: 'furniture_base', furnitureBaseProfileId: 'fb4', toeKickHeight: 1 });
      expect(warnings(render())).toContain(shortNote);
      const { stretch, ...fixed } = fb4;
      void stretch;
      state.settings.sectionProfiles = [fixed];
      expect(warnings(render())).toContain(mismatchNote);
      state.settings.defaultProfile.furnitureBaseProfileId = 'missing';
      expect(warnings(render())).toContain('The picked profile is missing; plain molding used.');
      state.settings.sectionProfiles = [{ ...fb4, archived: true }];
      state.settings.defaultProfile.toeKickHeight = 4;
      target().furnitureBaseProfileId = 'fb4';
      const picker = field(render(), scope, 'Furniture base profile');
      expect(picker.props.value).toBe('fb4');
      expect(options(picker).find(({ props }) => props.value === 'fb4').props.disabled).toBe(true);
      expect(warnings(render())).toEqual([]);
    });
  }

  for (const [scope, render, target] of panels.slice(1)) {
    it(`${scope}: inherits and clears proud, kind and profile picks according to scope`, () => {
      Object.assign(state.settings.defaultProfile, { baseKind: 'furniture_base', furnitureBaseProfileId: 'fb4', furnitureBaseProud: 0.8125 });
      expect(field(render(), scope, 'Base').props.value).toBe('');
      expect(field(render(), scope, 'Base proud').props).toMatchObject({ value: null, allowBlank: true, placeholder: '13/16' });
      pick(render, scope, 'Furniture base profile', 'plain');
      expect(target().furnitureBaseProfileId).toBeNull();
      expect(field(render(), scope, 'Furniture base profile').props.value).toBe('plain');
      pick(render, scope, 'Furniture base profile', '');
      expect(target()).not.toHaveProperty('furnitureBaseProfileId');
      field(render(), scope, 'Base proud').props.onCommit(1);
      field(render(), scope, 'Base proud').props.onCommit(null);
      expect(target()).not.toHaveProperty('furnitureBaseProud');
      pick(render, scope, 'Base', 'toe_kick');
      pick(render, scope, 'Base', '');
      expect(target()).not.toHaveProperty('baseKind');
      expect(field(render(), scope, 'Furniture base profile')).toBeDefined();
      dispatch(updateSettings({ defaultProfile: { baseKind: 'toe_kick' } }));
      expect(field(render(), scope, 'Furniture base profile')).toBeUndefined();
    });
  }
});

describe('Step 491 run base overrides', () => {
  it('offers controls on floor-standing base and tall runs in either height mode', () => {
    for (const cabinetTypeId of [CABINET_TYPE_IDS.BASE, CABINET_TYPE_IDS.TALL]) {
      for (const heightMode of ['auto', 'manual']) {
        Object.assign(run(), { cabinetTypeId, heightMode });
        expect(field(runPanel(), 'Run', 'Base')).toBeDefined();
      }
    }
    run().cabinetTypeId = CABINET_TYPE_IDS.UPPER;
    expect(field(runPanel(), 'Run', 'Base')).toBeUndefined();
    run().cabinetTypeId = CABINET_TYPE_IDS.BASE;
    run().stack = { below: { runId: 'lower', offset: 0 } };
    expect(field(runPanel(), 'Run', 'Base')).toBeUndefined();
  });

  it('saves Toe kick and clears it, preserves Plain, and clears profile and proud overrides', () => {
    Object.assign(room().profile, { baseKind: 'furniture_base', furnitureBaseProfileId: 'fb4', furnitureBaseProud: 0.8125 });
    expect(field(runPanel(), 'Run', 'Furniture base profile').props.value).toBe('');
    expect(options(field(runPanel(), 'Run', 'Furniture base profile')).map(({ props }) => props.value))
      .toEqual(['', 'plain', 'fb4']);
    pick(runPanel, 'Run', 'Base', 'toe_kick');
    expect(run().overrides.baseKind).toBe('toe_kick');
    expect(field(runPanel(), 'Run', 'Furniture base profile')).toBeUndefined();
    pick(runPanel, 'Run', 'Base', '');
    expect(run().overrides).not.toHaveProperty('baseKind');
    pick(runPanel, 'Run', 'Furniture base profile', 'plain');
    expect(run().overrides.furnitureBaseProfileId).toBeNull();
    expect(runBase(room(), wall(), run(), state.settings).picked).toBeNull();
    pick(runPanel, 'Run', 'Furniture base profile', 'fb4');
    expect(run().overrides.furnitureBaseProfileId).toBe('fb4');
    pick(runPanel, 'Run', 'Furniture base profile', '');
    expect(run().overrides).not.toHaveProperty('furnitureBaseProfileId');
    expect(runBase(room(), wall(), run(), state.settings).picked.profile.id).toBe('fb4');
    const proud = field(runPanel(), 'Run', 'Base proud');
    expect(proud.props).toMatchObject({ value: null, allowBlank: true, placeholder: '13/16' });
    proud.props.onCommit(0);
    expect(run().overrides.furnitureBaseProud).toBe(0);
    expect(proud.props.onCommit(-1)).toBe(false);
    proud.props.onCommit(null);
    expect(run().overrides).not.toHaveProperty('furnitureBaseProud');
  });

  it('uses run height overrides for warnings and retains archived profile choices', () => {
    Object.assign(run().overrides, { baseKind: 'furniture_base', furnitureBaseProfileId: 'fb4', toeKickHeight: 1 });
    expect(warnings(runPanel())).toEqual([shortNote]);
    const { stretch, ...fixed } = fb4;
    void stretch;
    state.settings.sectionProfiles = [fixed];
    expect(warnings(runPanel())).toEqual([mismatchNote]);
    run().overrides.furnitureBaseProfileId = 'missing';
    expect(warnings(runPanel())).toEqual(['The picked profile is missing; plain molding used.']);
    run().overrides.furnitureBaseProfileId = 'fb4';
    run().overrides.toeKickHeight = 4;
    state.settings.sectionProfiles = [{ ...fb4, archived: true }];
    expect(options(field(runPanel(), 'Run', 'Furniture base profile')).find(({ props }) => props.value === 'fb4').props.disabled).toBe(true);
    expect(warnings(runPanel())).toEqual([]);
  });
});
