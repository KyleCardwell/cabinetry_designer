import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { BAND_SETTING_KEYS } from '../../model/heightBands.js';
import { groupsFor } from '../../model/settingGroups.js';
import { registryEntry } from '../../model/settingsRegistry.js';
import elevationReducer, { createInitialElevationState } from '../../store/elevationSlice.js';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn(), useRef: vi.fn(), useMemo: (fn) => fn() }));
vi.mock('react-router-dom', () => ({ Link: 'a' }));
vi.mock('../../../library/WorkspaceSourceBar.jsx', () => ({ default: () => null, useShopReadOnly: () => false, useSandboxHidden: () => false }));
vi.mock('../ElevationCanvas.jsx', () => ({ default: 'elevation-canvas' }));
vi.mock('../../plan/PlanCanvas.jsx', () => ({ default: 'plan-canvas' }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' && !tree.props.hidden ? [tree, ...nodes(tree.props.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? tree.props.hidden ? '' : text(tree.props.children)
    : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const button = (tree, label) => nodes(tree).find(({ type, props }) => type === 'button' && text(props.children).includes(label));
const group = (tree, label) => nodes(tree).find(({ type, props }) => type === 'section'
  && [props.children].flat().some((child) => child?.type === 'button' && text(child).includes(label)));
const controls = (tree) => nodes(tree).filter(({ type }) => ['input', 'select'].includes(type));
let SettingsDrawer, DesignerEditor, SettingsPage, usePanelState, state, storage, hooks, slots, hookIndex, effects, dirty, focus;

// Use the same component/hook walk as the panel tests, including effect cleanup
// and search focus, without needing a browser DOM.
function render(props = {}, Component = SettingsDrawer) {
  let tree;
  do {
    dirty = false;
    effects = [];
    const mounted = new Set();
    const walk = (element, path) => {
      if (Array.isArray(element)) return element.map((child, index) => walk(child, `${path}/${child?.key ?? index}`));
      if (!element || typeof element !== 'object') return element;
      if (typeof element.type === 'function') {
        // Expand only the editor and drawer here; unrelated viewer panels stay as JSX.
        if (Component === DesignerEditor && ![DesignerEditor, SettingsDrawer].includes(element.type)
          && !path.includes('/SettingsDrawer')) return element;
        const id = `${path}/${element.type.name}`;
        mounted.add(id);
        if (!hooks.has(id)) hooks.set(id, []);
        slots = hooks.get(id);
        hookIndex = 0;
        return walk(element.type(element.props), id);
      }
      if (element.ref) element.ref.current = { focus };
      return { ...element, props: { ...element.props, children: walk(element.props.children, `${path}/children`) } };
    };
    tree = walk({ type: Component, props }, 'root');
    for (const [id, componentSlots] of hooks) {
      if (!mounted.has(id)) {
        componentSlots.forEach((slot) => slot.cleanup?.());
        hooks.delete(id);
      }
    }
    effects.forEach((effect) => effect());
  } while (dirty);
  return tree;
}

function search(query, props = {}) {
  field(render(props), 'Search settings').props.onChange({ target: { value: query } });
  return render(props);
}

function Viewer(props) {
  const [open, setOpen] = usePanelState('settingsDrawer', false);
  return <><button onClick={() => setOpen(!open)}>Settings toggle</button><SettingsDrawer {...props} /></>;
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  state = createInitialElevationState(null);
  storage = new Map([['ff.panel.settingsDrawer', 'true']]);
  hooks = new Map();
  focus = vi.fn();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key) => storage.get(key) ?? null),
    setItem: vi.fn((key, value) => storage.set(key, value)),
  });
  vi.stubGlobal('window', new EventTarget());
  useDispatch.mockReturnValue((action) => { state = elevationReducer(state, action); });
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  useState.mockImplementation((initial) => {
    const componentSlots = slots;
    const index = hookIndex++;
    if (!componentSlots[index]) componentSlots[index] = { value: typeof initial === 'function' ? initial() : initial };
    return [componentSlots[index].value, (next) => {
      const value = typeof next === 'function' ? next(componentSlots[index].value) : next;
      if (!Object.is(value, componentSlots[index].value)) dirty = true;
      componentSlots[index].value = value;
    }];
  });
  useRef.mockImplementation((initial) => {
    const index = hookIndex++;
    if (!slots[index]) slots[index] = { current: initial };
    return slots[index];
  });
  useEffect.mockImplementation((effect, deps) => {
    const componentSlots = slots;
    const index = hookIndex++;
    const previous = componentSlots[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      effects.push(() => {
        previous?.cleanup?.();
        componentSlots[index] = { deps, cleanup: effect() };
      });
    }
  });
  ({ default: SettingsDrawer } = await import('../SettingsDrawer.jsx'));
  ({ default: DesignerEditor } = await import('../../DesignerEditor.jsx'));
  ({ default: SettingsPage } = await import('../../../library/SettingsPage.jsx'));
  ({ default: usePanelState } = await import('../panel/usePanelState.js'));
});

afterEach(() => {
  for (const componentSlots of hooks.values()) componentSlots.forEach((slot) => slot.cleanup?.());
  vi.unstubAllGlobals();
});

describe('UI8 step a settings drawer', () => {
  it('anchor 1: searches reveal case-insensitively, opening Reveals and all other matching room fields only', () => {
    state.rooms[0].settingsOverrides = { capturedSingleReveal: 0 };
    const tree = search('ReVeAl', { shopStandards: false });
    const expected = groupsFor('room').filter(({ label, keys }) => label.toLowerCase().includes('reveal')
      || keys.some((key) => !BAND_SETTING_KEYS.includes(key) && registryEntry(key).label.toLowerCase().includes('reveal')));
    expect(nodes(tree).filter(({ type }) => type === 'section').map((section) => text(button(section, ''))))
      .toHaveLength(expected.length + 1); // Room section plus its matching groups.
    for (const { label, keys } of expected) {
      const section = group(tree, label);
      expect(button(section, label).props['aria-expanded']).toBe(true);
      const matching = keys.filter((key) => !BAND_SETTING_KEYS.includes(key)
        && (label === 'Reveals' || registryEntry(key).label.toLowerCase().includes('reveal')));
      expect(controls(section).map(({ props }) => props['aria-label']))
        .toEqual(matching.map((key) => `Room ${registryEntry(key).label}`));
    }
    expect(text(group(tree, 'Reveals'))).toContain('1 overridden');
    expect(button(tree, 'Drawer boxes')).toBeUndefined();
    expect(button(tree, 'Cabinets & depths')).toBeUndefined();
    expect(text(tree)).not.toContain('No settings match');
  });

  it('anchor 2: a group-label search shows the entire Drawer boxes group in room and shop scopes', () => {
    const tree = search('drawer boxes');
    const sections = nodes(tree).filter(({ type, props }) => type === 'section'
      && props.children[0]?.type === 'button');
    expect(sections).toHaveLength(2);
    for (const [index, scope] of ['room', 'team'].entries()) {
      const section = sections[index];
      const expected = groupsFor(scope).find(({ id }) => id === 'drawer-boxes').keys;
      expect(button(section, 'Drawer boxes').props['aria-expanded']).toBe(true);
      expect(controls(section)).toHaveLength(expected.length);
    }
    expect(button(tree, 'Reveals')).toBeUndefined();
  });

  it('anchor 3: reports no matches for zzz and filters View labels and its group name', () => {
    expect(text(search('zzz'))).toContain('No settings match "zzz".');
    expect(controls(search('zzz'))).toHaveLength(1); // Search remains usable.
    expect(text(search('Countertop overhang'))).toContain('No settings match "Countertop overhang".');
    let tree = search('PDF PAPER');
    expect(controls(tree).map(({ props }) => props['aria-label'])).toEqual(['Search settings', 'PDF paper']);
    field(tree, 'PDF paper').props.onChange({ target: { value: 'letter' } });
    expect(state.prefs.paperSize).toBe('letter');
    tree = search('view');
    expect(controls(tree).map(({ props }) => props['aria-label'])).toEqual([
      'Search settings', 'Drawing scale', 'PDF paper', 'Orthogonal plan walls', 'Plan grid', 'Opening snap', 'Corner snap distance',
    ]);
    tree = search('snap');
    expect(field(tree, 'Opening snap')).toBeDefined();
    expect(field(tree, 'Corner snap distance')).toBeDefined();
    expect(field(tree, 'Plan grid')).toBeUndefined();
  });

  it('anchor 4: clearing search restores group and section expansion without rewriting remembered state', () => {
    button(render(), 'Drawer boxes').props.onClick();
    expect(button(render(), 'Drawer boxes').props['aria-expanded']).toBe(true);
    expect(button(render(), 'Reveals').props['aria-expanded']).toBe(false);
    let tree = search('reveal');
    button(tree, 'Reveals').props.onClick(); // Forced-open search results cannot change the remembered group state.
    tree = search('');
    expect(button(tree, 'Drawer boxes').props['aria-expanded']).toBe(true);
    expect(button(tree, 'Reveals').props['aria-expanded']).toBe(false);
    button(tree, 'View').props.onClick();
    expect(storage.get('ff.panel.drawer.view')).toBe('false');
    expect(field(search('paper'), 'PDF paper')).toBeDefined();
    expect(button(search(''), 'View').props['aria-expanded']).toBe(false);
    expect(storage.get('ff.panel.drawer.view')).toBe('false');
  });

  it('focuses on open, shares the viewer toggle, closes on Escape and ×, and locks only room fields', () => {
    storage.delete('ff.panel.settingsDrawer');
    let tree = render({ readOnly: true, shopStandards: false }, Viewer);
    expect(nodes(tree).some(({ props }) => props.role === 'dialog')).toBe(false);
    button(tree, 'Settings toggle').props.onClick();
    tree = render({ readOnly: true, shopStandards: false }, Viewer);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(nodes(tree).filter(({ type, props }) => type === 'section' && props.children[0]?.type === 'div')
      .map((section) => text(button(section, ''))))
      .toEqual(['▾Room settings', '▾View']);
    const locked = nodes(tree).find(({ type }) => type === 'fieldset');
    expect(locked.props.disabled).toBe(true);
    expect(text(locked)).not.toContain('Drawing scale');
    field(tree, 'Drawing scale').props.onChange({ target: { value: '32' } });
    expect(state.prefs.plotScale).toBe(32);
    const roomGroups = nodes(tree).find(({ props }) => props.className?.includes('@container'));
    expect(roomGroups.props.className).toContain('grid-cols-1');
    const escape = new Event('keydown', { cancelable: true });
    Object.defineProperty(escape, 'key', { value: 'Escape' });
    window.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(field(render({}, Viewer), 'Search settings')).toBeUndefined();
    button(render({}, Viewer), 'Settings toggle').props.onClick();
    tree = render({}, Viewer);
    expect(focus).toHaveBeenCalledTimes(2);
    field(tree, 'Close settings').props.onClick();
    expect(field(render({}, Viewer), 'Search settings')).toBeUndefined();
    button(render({}, Viewer), 'Settings toggle').props.onClick();
    render({}, Viewer);
    button(render({}, Viewer), 'Settings toggle').props.onClick();
    expect(field(render({}, Viewer), 'Search settings')).toBeUndefined();
    expect(storage.get('ff.panel.settingsDrawer')).toBe('false');
  });
});


describe('UI8 step b settings integration', () => {
  it('anchor 1/3: replaces sidebar settings with a bottom button and overlays only the canvas in lab and room modes', () => {
    storage.delete('ff.panel.settingsDrawer');
    for (const mode of ['lab', 'room']) {
      let tree = render({ mode }, DesignerEditor);
      const left = nodes(tree).find(({ type }) => type === 'aside');
      expect(nodes(left).filter(({ props }) => ['Room settings', 'Settings'].includes(props.title))).toEqual([]);
      expect(left.props.children.at(-1).type).toBe('button');
      expect(text(left.props.children.at(-1))).toBe('Settings');
      expect(button(left, 'Settings').props['aria-expanded']).toBe(false);
      expect(nodes(tree).some(({ props }) => props.role === 'dialog')).toBe(false);
      button(left, 'Settings').props.onClick();
      tree = render({ mode }, DesignerEditor);
      const dialog = nodes(tree).find(({ props }) => props.role === 'dialog');
      const canvasArea = nodes(tree).find(({ props }) => props.className === 'relative min-h-0 flex-1');
      expect(nodes(canvasArea)).toContain(dialog);
      expect(nodes(left)).not.toContain(dialog);
      expect(dialog.props.className).toContain('absolute inset-y-0 left-0');
      const sections = nodes(dialog).filter(({ type, props }) => type === 'section' && props.children[0]?.type === 'div');
      expect(sections.map((section) => text(button(section, '')).replace('▾', '')))
        .toEqual(mode === 'lab' ? ['Room settings', 'Shop standards', 'View'] : ['Room settings', 'View']);
      button(nodes(tree).find(({ type }) => type === 'aside'), 'Settings').props.onClick();
      expect(nodes(render({ mode }, DesignerEditor)).some(({ props }) => props.role === 'dialog')).toBe(false);
    }
  });

  it('anchor 2: the real editor button opens focused search, Escape closes it, and the button reopens it', () => {
    storage.delete('ff.panel.settingsDrawer');
    let tree = render({ mode: 'room', readOnly: true }, DesignerEditor);
    button(tree, 'Settings').props.onClick();
    tree = render({ mode: 'room', readOnly: true }, DesignerEditor);
    expect(field(tree, 'Search settings')).toBeDefined();
    expect(focus).toHaveBeenCalledTimes(1);
    const dialog = nodes(tree).find(({ props }) => props.role === 'dialog');
    const roomFields = nodes(dialog).find(({ type }) => type === 'fieldset');
    expect(roomFields.props.disabled).toBe(true);
    expect(field(roomFields, 'Drawing scale')).toBeUndefined();
    expect(field(dialog, 'Drawing scale')).toBeDefined();
    const escape = new Event('keydown', { cancelable: true });
    Object.defineProperty(escape, 'key', { value: 'Escape' });
    window.dispatchEvent(escape);
    tree = render({ mode: 'room', readOnly: true }, DesignerEditor);
    expect(field(tree, 'Search settings')).toBeUndefined();
    expect(button(tree, 'Settings').props['aria-expanded']).toBe(false);
    button(tree, 'Settings').props.onClick();
    tree = render({ mode: 'room', readOnly: true }, DesignerEditor);
    expect(field(tree, 'Search settings')).toBeDefined();
    expect(focus).toHaveBeenCalledTimes(2);
    field(tree, 'Close settings').props.onClick();
    expect(field(render({ mode: 'room', readOnly: true }, DesignerEditor), 'Search settings')).toBeUndefined();
  });

  it('anchor 4: the library Settings page shows shop standards and default height bands without a settings toggle', () => {
    let tree = render({}, SettingsPage);
    expect(text(tree)).toContain('Shop standards');
    expect(text(tree)).toContain('Default height profile');
    expect(button(tree, 'Settings')).toBeUndefined();
    expect(nodes(tree).filter(({ props }) => props['data-height-band']).length).toBeGreaterThan(0);
    expect(field(tree, 'Default Wall height')).toBeDefined();
    button(tree, 'Cabinets & depths').props.onClick();
    tree = render({}, SettingsPage);
    expect(field(tree, 'Base depth')).toBeDefined();
    expect(field(tree, 'Room Base depth')).toBeUndefined();
  });
});
