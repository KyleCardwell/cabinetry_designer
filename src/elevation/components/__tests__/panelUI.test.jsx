import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' || typeof tree === 'number' ? tree : '';
const button = (tree, label) => nodes(tree).find(({ type, props }) => type === 'button' && text(props.children).includes(label));
const band = (tree, id) => nodes(tree).find(({ props }) => props['data-height-band'] === id);
const expanded = (tree, id) => nodes(band(tree, id)).find(({ type }) => type === 'button').props['aria-expanded'];
let PanelSection, PanelTabs, HeightBands, RoomHeightsPanel, WallHeightProperties, RunHeightsSection, SettingsPanel, usePanelState;
let hooks, slots, hookIndex, effects, dirty, state, storage, renderedComponents;

function unmount() {
  for (const componentSlots of hooks.values()) componentSlots.forEach((slot) => slot.cleanup?.());
  hooks.clear();
}

// Walk the panel components with state/effect lifetimes, leaving field controls
// as JSX. This exercises panel interactions without requiring a browser DOM.
function render(Component, props = {}) {
  let tree;
  do {
    dirty = false;
    effects = [];
    const mounted = new Set();
    const walk = (element, path) => {
      if (Array.isArray(element)) return element.map((child, index) => walk(child, `${path}/${child?.key ?? index}`));
      if (!element || typeof element !== 'object') return element;
      if (element.type === Component || renderedComponents.includes(element.type)) {
        const id = `${path}/${element.type.name}`;
        mounted.add(id);
        if (!hooks.has(id)) hooks.set(id, []);
        slots = hooks.get(id);
        hookIndex = 0;
        return walk(element.type(element.props), id);
      }
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

async function loadPanels() {
  ({ default: PanelSection } = await import('../panel/PanelSection.jsx'));
  ({ default: PanelTabs } = await import('../panel/PanelTabs.jsx'));
  ({ default: HeightBands } = await import('../HeightBands.jsx'));
  ({ default: RoomHeightsPanel } = await import('../RoomHeightsPanel.jsx'));
  ({ default: WallHeightProperties } = await import('../properties/WallHeightProperties.jsx'));
  ({ default: RunHeightsSection } = await import('../properties/RunHeightsSection.jsx'));
  ({ default: SettingsPanel } = await import('../SettingsPanel.jsx'));
  ({ default: usePanelState } = await import('../panel/usePanelState.js'));
  renderedComponents = [PanelSection, PanelTabs, HeightBands];
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  hooks = new Map();
  state = stateWithRun(makeRun());
  state.rooms[0].profile = {};
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key) => storage.get(key) ?? null),
    setItem: vi.fn((key, value) => storage.set(key, value)),
  });
  useDispatch.mockReturnValue(vi.fn());
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  useState.mockImplementation((initial) => {
    const componentSlots = slots;
    const index = hookIndex++;
    if (!componentSlots[index]) componentSlots[index] = { value: typeof initial === 'function' ? initial() : initial };
    const slot = componentSlots[index];
    slot.setValue ??= (next) => {
      const value = typeof next === 'function' ? next(slot.value) : next;
      if (!Object.is(value, slot.value)) dirty = true;
      slot.value = value;
    };
    return [slot.value, slot.setValue];
  });
  useEffect.mockImplementation((effect, deps) => {
    const index = hookIndex++;
    const componentSlots = slots;
    const previous = componentSlots[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      effects.push(() => {
        previous?.cleanup?.();
        componentSlots[index] = { deps, cleanup: effect() };
      });
    }
  });
  await loadPanels();
});

afterEach(() => { unmount(); vi.unstubAllGlobals(); });

describe('UI3 step a panel controls', () => {
  it('anchor 1: counts only own room, wall and run values; shop bands have no badge', () => {
    const room = state.rooms[0];
    const wall = room.walls[0];
    const run = wall.runs[0];
    room.profile = { toeKickHeight: 4, baseKind: 'toe_kick' };
    let tree = render(RoomHeightsPanel);
    expect(text(band(tree, 'base'))).toContain('2 overridden');
    expect(text(band(tree, 'crown'))).not.toContain('overridden');
    room.profile.crownProfileId = null; // Explicit Plain is an own choice.
    room.settingsOverrides = { bandDepths: { crownProjection: 0 } };
    expect(text(band(render(RoomHeightsPanel), 'crown'))).toContain('2 overridden');
    unmount();
    wall.profile = { toeKickHeight: 0, nosingProfileId: null };
    tree = render(WallHeightProperties, { room, wall, plan: false });
    expect(text(band(tree, 'base'))).toContain('1 overridden');
    expect(text(band(tree, 'countertop'))).toContain('1 overridden');
    expect(text(band(tree, 'crown'))).not.toContain('overridden');
    unmount();
    run.overrides = { toeKickHeight: 0, baseKind: 'toe_kick' };
    tree = render(RunHeightsSection, { room, wall, run, settings: state.settings, actionBase: {}, validateAndDispatch: vi.fn() });
    expect(text(band(tree, 'base'))).toContain('2 overridden');
    unmount();
    button(render(SettingsPanel), 'Settings').props.onClick();
    tree = render(SettingsPanel);
    expect(nodes(tree).filter(({ props }) => props['data-height-band']).length).toBeGreaterThan(0);
    expect(text(tree)).not.toContain('overridden');
  });

  it('anchor 2: shares collapsed Crown between room and wall and remembers it after reload', async () => {
    button(band(render(RoomHeightsPanel), 'crown'), 'Crown').props.onClick();
    expect(expanded(render(RoomHeightsPanel), 'crown')).toBe(false);
    expect(storage.get('ff.panel.band.crown')).toBe('false');
    unmount();
    const props = { room: state.rooms[0], wall: state.rooms[0].walls[0], plan: false };
    expect(expanded(render(WallHeightProperties, props), 'crown')).toBe(false);
    unmount();
    vi.resetModules(); // Reload also discards the shared in-memory map.
    await loadPanels();
    expect(expanded(render(WallHeightProperties, props), 'crown')).toBe(false);
    expect(localStorage.getItem).toHaveBeenCalledWith('ff.panel.band.crown');
  });

  it('anchor 3: sections and tabs work and survive remount when storage reads and writes throw', () => {
    localStorage.getItem.mockImplementation(() => { throw new Error('blocked'); });
    localStorage.setItem.mockImplementation(() => { throw new Error('quota'); });
    const sectionProps = { id: 'blocked', title: 'Blocked section', children: <span>Contents</span> };
    button(render(PanelSection, sectionProps), 'Blocked section').props.onClick();
    expect(text(render(PanelSection, sectionProps))).not.toContain('Contents');
    unmount();
    expect(button(render(PanelSection, sectionProps), 'Blocked section').props['aria-expanded']).toBe(false);
    button(render(PanelSection, sectionProps), 'Blocked section').props.onClick();
    expect(text(render(PanelSection, sectionProps))).toContain('Contents');
    unmount();
    const props = { id: 'blocked', tabs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], children: (id) => <p>{id}</p> };
    button(render(PanelTabs, props), 'B').props.onClick();
    expect(button(render(PanelTabs, props), 'B').props['aria-selected']).toBe(true);
    unmount();
    expect(button(render(PanelTabs, props), 'B').props['aria-selected']).toBe(true);
    button(render(PanelTabs, props), 'A').props.onClick();
    expect(button(render(PanelTabs, props), 'A').props['aria-selected']).toBe(true);
  });

  it('anchor 4: falls back to the first available tab and keeps panels independent', () => {
    const content = vi.fn((id) => <p>{`Content ${id}`}</p>);
    const props = { id: 't', tabs: [{ id: 'a', label: 'A', badge: 0 }, { id: 'b', label: 'B', badge: 2 }], children: content };
    let tree = render(PanelTabs, props);
    expect(nodes(tree).some(({ props }) => props.role === 'tablist')).toBe(true);
    expect(button(tree, 'A').props.role).toBe('tab');
    expect(text(button(tree, 'A'))).toBe('A');
    expect(text(button(tree, 'B'))).toBe('B2');
    button(tree, 'B').props.onClick();
    tree = render(PanelTabs, props);
    expect(button(tree, 'B').props.className).toContain('bg-blue-600');
    expect(content).toHaveBeenLastCalledWith('b');
    expect(storage.get('ff.panel.tab.t')).toBe('"b"');
    unmount();
    tree = render(PanelTabs, { ...props, tabs: [props.tabs[0], { id: 'c', label: 'C' }] });
    expect(button(tree, 'A').props['aria-selected']).toBe(true);
    expect(content).toHaveBeenLastCalledWith('a');
    unmount();
    expect(button(render(PanelTabs, { ...props, id: 'piece' }), 'A').props['aria-selected']).toBe(true);
  });

  it('keeps actions outside the toggle and supports light headers, string badges and malformed storage', () => {
    storage.set('ff.panel.details', '{invalid JSON');
    const onReset = vi.fn();
    const props = { id: 'details', title: 'Details', badge: 'Custom', defaultOpen: false, level: 2,
      actions: <button onClick={onReset}>Reset</button>, children: <input aria-label="Hidden field" /> };
    let tree = render(PanelSection, props);
    expect(nodes(tree).some(({ type }) => type === 'input')).toBe(false);
    expect(button(tree, 'Details').props.className).toContain('text-[11px]');
    expect(tree.props.className).toBeUndefined();
    expect(text(button(tree, 'Details'))).toContain('Custom');
    expect(nodes(button(tree, 'Details')).some(({ type, props }) => type === 'button' && text(props.children) === 'Reset')).toBe(false);
    button(tree, 'Reset').props.onClick();
    expect(onReset).toHaveBeenCalledOnce();
    expect(button(render(PanelSection, props), 'Details').props['aria-expanded']).toBe(false);
    button(tree, 'Details').props.onClick();
    tree = render(PanelSection, { ...props, badge: 0, level: 1 });
    expect(nodes(tree).some(({ type }) => type === 'input')).toBe(true);
    expect(tree.props.className).toContain('border-t');
    expect(text(tree)).not.toContain('overridden');
  });

  it('shares live values by key and handles functional setters and key changes', () => {
    function Viewer({ id }) {
      const [count, setCount] = usePanelState(id, 0);
      return <button onClick={() => { setCount((current) => current + 1); setCount((current) => current + 1); }}>{count}</button>;
    }
    function Pair() { return [<Viewer key="one" id="count" />, <Viewer key="two" id="count" />]; }
    renderedComponents.push(Viewer);
    const tree = render(Pair);
    tree[0].props.onClick();
    expect(render(Pair).map(text)).toEqual([2, 2]);
    unmount();
    expect(text(render(Viewer, { id: 'count' }))).toBe(2);
    expect(text(render(Viewer, { id: 'other' }))).toBe(0);
    expect(text(render(Viewer, { id: 'count' }))).toBe(2);
  });
});
