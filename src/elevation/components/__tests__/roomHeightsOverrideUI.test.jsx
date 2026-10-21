import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import elevationReducer, { addWall, createInitialElevationState, setActiveRoom, setTool, updateSettings } from '../../store/elevationSlice.js';
import { cloneRoom } from '../../model/roomClone.js';
import RoomHeightsPanel from '../RoomHeightsPanel.jsx';
import ElevationToolbar from '../ElevationToolbar.jsx';
import { resolveProfile } from '../../model/profile.js';

vi.mock('../AddToolMenu.jsx', () => ({ default: () => null }));
vi.mock('../ExportDxfButton.jsx', () => ({ default: () => null }));
const { profiles } = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/sectionProfiles.json', import.meta.url), 'utf8'));

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children) : tree ?? '';
const options = (tree) => nodes(tree).filter(({ type }) => type === 'option').map(({ props }) => [props.value, props.children]);
let state;
let dispatch;
let hooks;
let currentHooks;
let hookIndex;
let effects;
let dirty;

// Keep hook state per component while walking the JSX, including InchInput's
// draft text and effects. This exercises blur/reset and room switches together
// with the real Redux reducer without requiring a browser DOM.
function render(Component = RoomHeightsPanel, props = {}) {
  let result;
  do {
    dirty = false;
    effects = [];
    const mounted = new Set();
    const walk = (element, path) => {
      if (Array.isArray(element)) return element.map((child, index) => walk(child, `${path}/${child?.key ?? index}`));
      if (!element || typeof element !== 'object') return element;
      if (typeof element.type === 'function') {
        const id = `${path}/${element.type.name}`;
        mounted.add(id);
        if (!hooks.has(id)) hooks.set(id, []);
        currentHooks = hooks.get(id);
        hookIndex = 0;
        return walk(element.type(element.props), id);
      }
      return { ...element, props: { ...element.props, children: walk(element.props.children, `${path}/children`) } };
    };
    result = walk({ type: Component, props }, 'root');
    for (const id of hooks.keys()) if (!mounted.has(id)) hooks.delete(id);
    effects.forEach((effect) => effect());
  } while (dirty);
  return result;
}

function commit(label, value, Component = RoomHeightsPanel, props = {}) {
  field(render(Component, props), label).props.onChange({ target: { value } });
  field(render(Component, props), label).props.onBlur();
  return render(Component, props);
}

beforeEach(() => {
  vi.clearAllMocks();
  state = structuredClone(elevationReducer(createInitialElevationState(null), addWall()));
  state.settings.defaultProfile.wallHeight = 96;
  state.settings.defaultSoffitMolding = 'crown';
  state.settings.sectionProfiles = profiles;
  state.tool = 'soffit';
  state.view = 'elevation';
  state.rooms = [state.rooms[0], { ...cloneRoom(state.rooms[0]), id: 'room-b' }];
  for (const room of state.rooms) { room.profile = {}; delete room.settingsOverrides; }
  state.activeRoomId = state.rooms[0].id;
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); return action; });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  hooks = new Map();
  useState.mockImplementation((initial) => {
    const slots = currentHooks;
    const index = hookIndex++;
    if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
    return [slots[index].value, (next) => {
      const value = typeof next === 'function' ? next(slots[index].value) : next;
      if (!Object.is(value, slots[index].value)) dirty = true;
      slots[index].value = value;
    }];
  });
  useEffect.mockImplementation((effect, deps) => {
    const index = hookIndex++;
    const previous = currentHooks[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      currentHooks[index] = { deps };
      effects.push(effect);
    }
  });
});

const room = () => state.rooms.find(({ id }) => id === state.activeRoomId);
const choose = (label, value) => field(render(), label).props.onChange({ target: { value } });
const soffitGroup = () => field(render(ElevationToolbar), 'Default soffit molding');
const soffitButton = (label) => nodes(soffitGroup()).find(({ type, props }) => type === 'button' && props.children === label);

describe('UI2 step a room field styling', () => {
  const labelRow = (tree) => nodes(tree).find(({ props }) => props.title?.includes('Shop standard: 4"')).props.children[0];
  const tag = (tree) => nodes(labelRow(tree)).find(({ type, props }) => type === 'span' && props.children === 'shop');

  beforeEach(() => { state.settings.defaultProfile.toeKickHeight = 4; });

  it('anchor 1: shows inherited shop base height 4 as a gray placeholder with a shop tag and no Reset', () => {
    const tree = render();
    const control = field(tree, 'Room Toe kick / base height');
    expect(control.props).toMatchObject({ value: '', placeholder: '4' });
    expect(control.props.className).toContain('border-gray-600');
    expect(control.props.className).toContain('placeholder:text-gray-500');
    expect(tag(tree).props.className).toBe('text-[10px] text-gray-500');
    expect(field(tree, 'Reset Toe kick / base height')).toBeUndefined();
  });

  it('anchor 2: types base height 4 1/2 with bright text, a teal border and Reset replacing the tag', () => {
    const tree = commit('Room Toe kick / base height', '4 1/2');
    const control = field(tree, 'Room Toe kick / base height');
    expect(room().profile.toeKickHeight).toBe(4.5);
    expect(control.props.value).toBe('4 1/2');
    expect(control.props.className).toContain('text-gray-100');
    expect(control.props.className).toContain('border-teal-500');
    expect(field(tree, 'Reset Toe kick / base height')).toBeDefined();
    expect(tag(tree)).toBeUndefined();
    field(tree, 'Reset Toe kick / base height').props.onClick();
    expect(tag(render())).toBeDefined();
  });
});

describe('DB2 e room heights and soffit overrides', () => {
  it('shows inherited wall height 96 in an empty grey box without Reset (anchor 1)', () => {
    const tree = render();
    expect(field(tree, 'Room Wall height').props).toMatchObject({ value: '', placeholder: '96' });
    expect(field(tree, 'Room Wall height').props.className).toContain('border-gray-600');
    expect(field(tree, 'Reset Wall height')).toBeUndefined();
    expect(nodes(tree).find(({ props }) => props.title === 'Shop standard: 96"')).toBeDefined();
  });

  it('stores typed wall height 100, with teal, Reset and the inherited title (anchor 2)', () => {
    const tree = commit('Room Wall height', '100');
    expect(room().profile).toEqual({ wallHeight: 100 });
    expect(field(tree, 'Room Wall height').props.value).toBe('100');
    expect(field(tree, 'Room Wall height').props.className).toContain('border-teal-500');
    expect(field(tree, 'Reset Wall height')).toBeDefined();
    expect(nodes(tree).find(({ props }) => props.title === 'Room override · Shop standard: 96"')).toBeDefined();
  });

  it('deletes a height override on Reset and empties the box (anchor 3)', () => {
    field(commit('Room Wall height', '100'), 'Reset Wall height').props.onClick();
    expect(room().profile).toEqual({});
    expect(field(render(), 'Room Wall height').props).toMatchObject({ value: '', placeholder: '96' });
    expect(field(render(), 'Reset Wall height')).toBeUndefined();
  });

  it('inherits Toe kick and marks a Furniture base choice teal (anchor 4)', () => {
    expect(options(field(render(), 'Room Base'))[0]).toEqual(['', 'Inherit (Toe kick)']);
    choose('Room Base', 'furniture_base');
    expect(room().profile.baseKind).toBe('furniture_base');
    expect(field(render(), 'Room Base').props.className).toContain('border-teal-500');
    field(render(), 'Reset Base').props.onClick();
    expect(room().profile).not.toHaveProperty('baseKind');
  });

  it('stores explicit Plain, None and Square overrides and deletes each on Reset (anchor 5)', () => {
    dispatch(updateSettings({ defaultProfile: { baseKind: 'furniture_base' } }));
    for (const [key, label, plain, inheritedId] of [
      ['topMoldProfileId', 'Top mold profile', 'Plain', 'tm3'],
      ['crownProfileId', 'Crown profile', 'Plain', 'cr45'],
      ['nosingProfileId', 'Nosing profile', 'None', null],
      ['furnitureBaseProfileId', 'Furniture base profile', 'Plain', 'fb4'],
      ['baseCutoutProfileId', 'Cutout profile', 'Square', null],
    ]) {
      dispatch(updateSettings({ defaultProfile: { [key]: inheritedId } }));
      const inheritedName = inheritedId ? profiles.find(({ id }) => id === inheritedId).name : plain;
      expect(options(field(render(), `Room ${label}`))[0]).toEqual(['', `Inherit (${inheritedName})`]);
      choose(`Room ${label}`, 'plain');
      const tree = render();
      expect(room().profile[key]).toBeNull();
      expect(resolveProfile(state.settings, room())[key]).toBeNull();
      expect(field(tree, `Room ${label}`).props.value).toBe('plain');
      expect(field(tree, `Room ${label}`).props.className).toContain('border-teal-500');
      expect(nodes(tree).find(({ props }) => props.title === `Room override · Shop standard: ${inheritedName}`)).toBeDefined();
      field(tree, `Reset ${label}`).props.onClick();
      expect(room().profile).not.toHaveProperty(key);
      expect(field(render(), `Room ${label}`).props.value).toBe('');
    }
  });

  it('shows profile-derived crown height read-only without teal or Reset (anchor 6)', () => {
    choose('Room Crown profile', 'cr45');
    const tree = render();
    expect(field(tree, 'Room Crown').props).toMatchObject({ value: '4 1/2', readOnly: true });
    expect(field(tree, 'Room Crown').props.className).not.toContain('border-teal-500');
    expect(field(tree, 'Reset Crown')).toBeUndefined();
    expect(text(tree)).not.toContain('from profile');
    const crownRow = nodes(tree).find(({ type, props }) => type === 'label' && nodes(props.children).includes(field(tree, 'Room Crown')));
    expect(nodes(crownRow).some(({ type, props }) => type === 'span' && props.children === 'profile')).toBe(true);
    expect(field(tree, 'Room Crown').props.className).toContain('text-gray-500 border-gray-700 border-dashed');
    expect(room().profile).not.toHaveProperty('crownHeight');
  });

  it('presses inherited Crown without a ring or Reset (anchor 7)', () => {
    expect(soffitButton('Crown').props['aria-pressed']).toBe(true);
    expect(soffitButton('Crown').props.className).not.toContain('ring-teal-500');
    expect(soffitGroup().props.title).toBe('Shop standard: Crown');
    expect(field(render(ElevationToolbar), 'Reset soffit molding')).toBeUndefined();
  });

  it('pins Top mold to room A and keeps the shop Crown standard (anchor 8)', () => {
    soffitButton('Top mold').props.onClick();
    expect(room().settingsOverrides.defaultSoffitMolding).toBe('topMold');
    expect(state.settings.defaultSoffitMolding).toBe('crown');
    expect(soffitButton('Top mold').props['aria-pressed']).toBe(true);
    expect(soffitButton('Top mold').props.className).toContain('ring-1 ring-teal-500');
    expect(soffitButton('Crown').props.className).not.toContain('ring-teal-500');
    expect(soffitGroup().props.title).toBe('Room override · Shop standard: Crown');
    expect(field(render(ElevationToolbar), 'Reset soffit molding')).toBeDefined();
  });

  it('resets room A to Crown and leaves room B inheriting Crown (anchor 9)', () => {
    soffitButton('Top mold').props.onClick();
    field(render(ElevationToolbar), 'Reset soffit molding').props.onClick();
    expect(room()).not.toHaveProperty('settingsOverrides');
    expect(soffitButton('Crown').props['aria-pressed']).toBe(true);
    expect(soffitButton('Crown').props.className).not.toContain('ring-teal-500');
    dispatch(setActiveRoom('room-b'));
    // Changing rooms returns to Select; reopen the soffit tool in the new room.
    dispatch(setTool('soffit'));
    expect(soffitButton('Crown').props['aria-pressed']).toBe(true);
    expect(soffitButton('Crown').props.className).not.toContain('ring-teal-500');
    expect(field(render(ElevationToolbar), 'Reset soffit molding')).toBeUndefined();
  });

  it('keeps equal-value pins, clears blank commits and follows inheritance across rooms', () => {
    commit('Room Wall height', '96');
    expect(room().profile.wallHeight).toBe(96);
    dispatch(updateSettings({ defaultProfile: { wallHeight: 108 } }));
    expect(field(render(), 'Room Wall height').props).toMatchObject({ value: '96', placeholder: '108' });
    dispatch(setActiveRoom('room-b'));
    expect(field(render(), 'Room Wall height').props).toMatchObject({ value: '', placeholder: '108' });
    dispatch(setActiveRoom(state.rooms[0].id));
    commit('Room Wall height', '');
    expect(room().profile).toEqual({});
    dispatch(setTool('soffit'));
    soffitButton('Crown').props.onClick();
    expect(room().settingsOverrides.defaultSoffitMolding).toBe('crown');
    expect(soffitButton('Crown').props.className).toContain('ring-1 ring-teal-500');
  });

  it('treats all editable numbers and Base proud as own values and keeps negative proud rejected', () => {
    for (const label of ['Wall height', 'Toe kick / base height', 'Base box height', 'Countertop thickness',
      'Upper clearance', 'Top of crown', 'Top mold', 'Crown', 'Crown total', 'Top mold overhang']) {
      expect(field(render(), `Room ${label}`).props.value).toBe('');
      expect(field(render(), `Reset ${label}`)).toBeUndefined();
      commit(`Room ${label}`, '0');
      expect(field(render(), `Room ${label}`).props.className).toContain('border-teal-500');
      field(render(), `Reset ${label}`).props.onClick();
    }
    dispatch(updateSettings({ defaultProfile: { baseKind: 'furniture_base', furnitureBaseProud: 0.5 } }));
    expect(field(render(), 'Room Base proud').props).toMatchObject({ value: '', placeholder: '1/2' });
    commit('Room Base proud', '0');
    commit('Room Base proud', '-1');
    expect(room().profile.furnitureBaseProud).toBe(0);
    expect(field(render(), 'Room Base proud').props.value).toBe('0');
    field(render(), 'Reset Base proud').props.onClick();
    expect(room().profile).not.toHaveProperty('furnitureBaseProud');
  });

  it('locks fixed top mold heights and allows stretch heights to be overridden', () => {
    const tm3 = profiles.find(({ id }) => id === 'tm3');
    const { stretch, ...fixed } = tm3;
    expect(stretch).toBeDefined();
    dispatch(updateSettings({ sectionProfiles: [fixed], defaultProfile: { topMoldProfileId: 'tm3' } }));
    expect(field(render(), 'Room Top mold').props).toMatchObject({ value: '3', readOnly: true });
    expect(field(render(), 'Room Top mold').props.className).not.toContain('border-teal-500');
    expect(field(render(), 'Reset Top mold')).toBeUndefined();
    dispatch(updateSettings({ sectionProfiles: [tm3] }));
    expect(field(render(), 'Room Top mold').props).toMatchObject({ value: '', placeholder: '3' });
    commit('Room Top mold', '5');
    expect(room().profile.topMoldHeight).toBe(5);
    expect(field(render(), 'Room Top mold').props.className).toContain('border-teal-500');
  });
});


const band = (tree, id) => nodes(tree).find(({ props }) => props['data-height-band'] === id);
const controls = (tree) => nodes(tree).filter(({ type }) => type === 'input' || type === 'select')
  .map(({ props }) => props['aria-label']);
const setbacks = ['Room Band depth toe kick setback', 'Room Band depth toe kick end panel setback', 'Room Band depth toe kick side setback'];

describe('UI1 step a room height bands', () => {
  it('orders all five bands and toe-kick fields without furniture rows (anchor 1)', () => {
    state.settings.sectionProfiles = [];
    const tree = render();
    expect(nodes(tree).filter(({ type }) => type === 'h3').map(text)).toEqual(['Wall', 'Crown', 'Uppers', 'Countertop', 'Base']);
    expect(controls(band(tree, 'base'))).toEqual(['Room Base', 'Room Toe kick / base height', 'Room Base box height', ...setbacks]);
  });

  it('shows furniture rows from the resolved base kind and retains the three setbacks last (anchor 2)', () => {
    state.settings.sectionProfiles = [];
    const expected = ['Room Base', 'Room Toe kick / base height', 'Room Base box height', 'Room Furniture base profile',
      'Room Base proud', 'Room Cutout profile', 'Room Cutout foot', 'Room Square cutout height', 'Room Furniture base scribe', ...setbacks];
    choose('Room Base', 'furniture_base');
    expect(controls(band(render(), 'base'))).toEqual(expected);
    field(render(), 'Reset Base').props.onClick();
    dispatch(updateSettings({ defaultProfile: { baseKind: 'furniture_base' } }));
    expect(controls(band(render(), 'base'))).toEqual(expected);
    choose('Room Base', 'toe_kick');
    expect(controls(band(render(), 'base'))).not.toContain('Room Furniture base profile');
  });

  it('pairs Crown controls in order with its overlap below and preserves scoped setting writes (anchor 3)', () => {
    state.settings.sectionProfiles = [];
    const crown = band(render(), 'crown');
    expect(controls(crown)).toEqual(['Room Top of crown', 'Room Crown total', 'Room Crown', 'Room Crown profile',
      'Room Top mold', 'Room Top mold profile', 'Room Top mold overhang', 'Room Band depth crown projection']);
    const rows = crown.props.children[1].props.children;
    expect(rows.slice(0, 3).map(controls)).toEqual([
      ['Room Top of crown', 'Room Crown total'], ['Room Crown', 'Room Crown profile'], ['Room Top mold', 'Room Top mold profile'],
    ]);
    expect(text(crown.props.children[2])).toMatch(/Overlap|Gap/);
    commit('Room Band depth crown projection', '4');
    expect(room().settingsOverrides.bandDepths.crownProjection).toBe(4);
    expect(state.settings.bandDepths.crownProjection).toBe(3);
  });
});
