import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CABINET_TYPE_IDS, findCell, resolveWall, runItems, runScene } from '../../model/index.js';
import elevationReducer, { splitCell } from '../../store/elevationSlice.js';
import { auto, run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn(), useMemo: (fn) => fn(), useRef: () => ({ current: null }) }));
vi.mock('../ElevationCanvas.jsx', () => ({ default: 'elevation-canvas' }));
vi.mock('../../plan/PlanCanvas.jsx', () => ({ default: 'plan-canvas' }));
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
let RunProperties, CabinetProperties, CellProperties, PieceProperties;
let DesignerEditor, RoomStylePanel, RoomDoorStylesPanel, RoomPartNumbersPanel, WallList, RoomSettingsPanel;
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
      if (element.type === Component || renderedComponents.includes(element.type)
        || ['EndProperties', 'InteriorFillerProperties', 'RoomDoorStylesContent'].includes(element.type?.name)) {
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
  ({ default: DesignerEditor } = await import('../../DesignerEditor.jsx'));
  ({ default: RoomStylePanel } = await import('../RoomStylePanel.jsx'));
  ({ default: RoomDoorStylesPanel } = await import('../RoomDoorStylesPanel.jsx'));
  ({ default: RoomPartNumbersPanel } = await import('../RoomPartNumbersPanel.jsx'));
  ({ default: WallList } = await import('../WallList.jsx'));
  ({ default: RoomSettingsPanel } = await import('../RoomSettingsPanel.jsx'));
  ({ default: PanelSection } = await import('../panel/PanelSection.jsx'));
  ({ default: PanelTabs } = await import('../panel/PanelTabs.jsx'));
  ({ default: HeightBands } = await import('../HeightBands.jsx'));
  ({ default: RoomHeightsPanel } = await import('../RoomHeightsPanel.jsx'));
  ({ default: WallHeightProperties } = await import('../properties/WallHeightProperties.jsx'));
  ({ default: RunHeightsSection } = await import('../properties/RunHeightsSection.jsx'));
  ({ default: SettingsPanel } = await import('../SettingsPanel.jsx'));
  ({ default: usePanelState } = await import('../panel/usePanelState.js'));
  ({ default: RunProperties } = await import('../properties/RunProperties.jsx'));
  const runSections = await Promise.all([
    import('../properties/RunGeometrySection.jsx'), import('../properties/RunEndsSection.jsx'),
    import('../properties/RunCabinetsSection.jsx'), import('../properties/RunPiecesSection.jsx'),
    import('../properties/RunBaseCutoutsSection.jsx'), import('../properties/RunBottomSection.jsx'),
    import('../properties/RunStyleFields.jsx'), import('../properties/PullPicks.jsx'),
  ]);
  ({ default: CabinetProperties } = await import('../properties/CabinetProperties.jsx'));
  ({ default: CellProperties } = await import('../properties/CellProperties.jsx'));
  ({ default: PieceProperties } = await import('../properties/PieceProperties.jsx'));
  const pieceSections = await Promise.all([
    import('../properties/CellKindSection.jsx'), import('../properties/CellDepthSection.jsx'),
    import('../properties/CellSplitSection.jsx'), import('../properties/CellWrapSection.jsx'),
    import('../properties/FaceProperties.jsx'), import('../properties/CabinetStyleProperties.jsx'),
    import('../properties/BoxConstructionFields.jsx'), import('../properties/InteriorFields.jsx'),
    import('../properties/DrawerBoxFields.jsx'), import('../properties/EndFields.jsx'),
    import('../properties/TeeProperties.jsx'),
  ]);
  const { RunFurnitureBaseSection } = await import('../properties/RunProperties.jsx');
  renderedComponents = [RoomHeightsPanel, RoomStylePanel, RoomDoorStylesPanel, RoomPartNumbersPanel, WallList,
    PanelSection, PanelTabs, HeightBands, RunHeightsSection,
    RunFurnitureBaseSection, ...pieceSections.map((module) => module.default), ...runSections.map((module) => module.default)];
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


const sectionTitles = (tree) => nodes(tree)
  .filter(({ type, props }) => type === 'section' && !props['data-height-band'])
  .map((section) => nodes(section).find(({ props }) => props['aria-expanded'] !== undefined))
  .filter(Boolean).map((toggle) => text(toggle.props.children[1]));
const sectionButton = (tree, title) => nodes(tree).find(({ type, props }) => type === 'button'
  && props['aria-expanded'] !== undefined && text(props.children[1]) === title);
const tabs = (tree) => nodes(tree).filter(({ props }) => props.role === 'tab');
const runPanel = (id = 'run-1') => {
  const room = state.rooms[0];
  const wall = resolveWall(room, room.walls[0]);
  const run = wall.runs.find((candidate) => candidate.id === id);
  const scene = runScene(room, wall, run, state.settings);
  return render(RunProperties, { room, wall, run, layout: scene.result, settings: state.settings, showMessage: vi.fn() });
};

describe('UI5 step b run tabs', () => {
  beforeEach(() => {
    state.rooms[0].walls[0].runs = [makeRun({ heightMode: 'auto', width: 36 })];
  });

  it('anchor 1: opens Layout with ordered sections and Pieces closed', () => {
    let tree = runPanel();
    expect(tabs(tree).map(text)).toEqual(['Layout', 'Heights & base', 'Style', 'Hardware']);
    expect(tabs(tree).map(({ props }) => props['aria-selected'])).toEqual([true, false, false, false]);
    expect(sectionTitles(tree)).toEqual(['Run', 'Geometry', 'Ends', 'Cabinets', 'Pieces']);
    expect(button(tree, 'Pieces').props['aria-expanded']).toBe(false);
    button(tree, 'Pieces').props.onClick();
    tree = runPanel();
    expect(button(tree, 'Pieces').props['aria-expanded']).toBe(true);
    expect(storage.get('ff.panel.run.pieces')).toBe('true');
    expect(nodes(tree).some(({ type }) => type === 'h3')).toBe(false);
  });

  it('anchor 2: remembers Heights & base across run selections and remounts', () => {
    state.rooms[0].walls[0].runs.push(makeRun({ id: 'run-2', x: 60, width: 36, heightMode: 'auto' }));
    button(runPanel(), 'Heights & base').props.onClick();
    expect(button(runPanel('run-2'), 'Heights & base').props['aria-selected']).toBe(true);
    expect(sectionTitles(runPanel('run-2'))).toEqual(['Heights', 'Below the run']);
    expect(storage.get('ff.panel.tab.run')).toBe('"heights"');
    sectionButton(runPanel('run-2'), 'Heights').props.onClick();
    unmount();
    const tree = runPanel();
    expect(button(tree, 'Heights & base').props['aria-selected']).toBe(true);
    expect(sectionButton(tree, 'Heights').props['aria-expanded']).toBe(false);
    expect(storage.get('ff.panel.run.heights')).toBe('false');
  });

  it('anchor 3: badges only set run overrides and adds one for manual mode', () => {
    const run = state.rooms[0].walls[0].runs[0];
    run.overrides = { toeKickHeight: 0, countertopThickness: 1.5, boxTop: null, crownProfileId: undefined };
    button(runPanel(), 'Heights & base').props.onClick();
    expect(text(sectionButton(runPanel(), 'Heights'))).toContain('2 overridden');
    run.heightMode = 'manual';
    expect(text(sectionButton(runPanel(), 'Heights'))).toContain('3 overridden');
    run.overrides = {};
    run.heightMode = 'auto';
    expect(text(sectionButton(runPanel(), 'Heights'))).not.toContain('overridden');
  });

  it('anchor 4: shows only Cabinet style without door styles and adds Door styles when available', () => {
    const room = state.rooms[0];
    room.doorStyles = [];
    button(runPanel(), 'Style').props.onClick();
    expect(sectionTitles(runPanel())).toEqual(['Cabinet style']);
    room.doorStyles = [{ id: 'door-style', name: 'Custom' }];
    const tree = runPanel();
    expect(sectionTitles(tree)).toEqual(['Cabinet style', 'Door styles']);
    expect(nodes(tree).some(({ type }) => type === 'h3')).toBe(false);
  });

  it('counts own style choices and nondefault flags and wraps Pulls without a duplicate heading', () => {
    const room = state.rooms[0];
    const run = room.walls[0].runs[0];
    room.style = { cabinetStyleId: 1, beadWidth: 0.25 };
    button(runPanel(), 'Style').props.onClick();
    expect(text(button(runPanel(), 'Cabinet style'))).not.toContain('overridden');
    run.style = { cabinetStyleId: 1, beadWidth: 0, stileWidth: null };
    run.hanging = true;
    run.upperBottom = 'counter';
    expect(text(button(runPanel(), 'Cabinet style'))).toContain('4 overridden');
    run.hanging = false;
    run.upperBottom = 'overhang';
    expect(text(button(runPanel(), 'Cabinet style'))).toContain('2 overridden');
    button(runPanel(), 'Hardware').props.onClick();
    const tree = runPanel();
    expect(sectionTitles(tree)).toEqual(['Pulls']);
    expect(nodes(tree).filter(({ props }) => props['aria-label'] === 'Run door pull')).toHaveLength(1);
    expect(nodes(tree).some(({ type }) => type === 'h3')).toBe(false);
    button(tree, 'Pulls').props.onClick();
    expect(storage.get('ff.panel.run.pulls')).toBe('false');
    expect(nodes(runPanel()).some(({ props }) => props['aria-label'] === 'Run door pull')).toBe(false);
  });

  it('omits unavailable base sections and keeps available base sections in order', () => {
    const room = state.rooms[0];
    button(runPanel(), 'Heights & base').props.onClick();
    expect(sectionTitles(runPanel())).toEqual(['Heights', 'Below the run']);
    room.profile = { baseKind: 'furniture_base', toeKickHeight: 4 };
    const titles = sectionTitles(runPanel());
    expect(titles).toEqual(['Heights', expect.stringMatching(/^Furniture base FB #/), 'Base cutouts', 'Below the run']);
    room.walls[0].runs[0].cabinetTypeId = CABINET_TYPE_IDS.UPPER;
    expect(sectionTitles(runPanel())).toEqual(['Heights', 'Below the run']);
  });
});


describe('UI6 step b cabinet and section tabs', () => {
  function setup() {
    state.facePath = null;
    state.rooms[0].walls[0].runs = [makeRun({ width: 60, autoCount: false, seamGap: 0,
      ends: { left: { type: 'filler', width: 1.5 }, right: { type: 'none' } },
      items: [auto('a'), auto('b')],
    })];
  }
  function pieceProps(id = 'a') {
    const room = state.rooms[0];
    const wall = resolveWall(room, room.walls[0]);
    const run = wall.runs[0];
    const scene = runScene(room, wall, run, state.settings);
    const piece = scene.cells.pieces.find((candidate) => candidate.id === id);
    return { room, wall, run, piece, item: runItems(run).find((candidate) => candidate.id === id) ?? findCell(run.grid, id)?.cell.node,
      settings: state.settings, layout: scene.result, cells: scene.cells };
  }
  const piecePanel = (id = 'a', Component = CabinetProperties) => render(Component, pieceProps(id));

  it('anchor 1: starts a door cabinet with Kind above Size, Faces & style and Inside tabs', () => {
    setup();
    const tree = piecePanel();
    expect(tabs(tree).map(text)).toEqual(['Size', 'Faces & style', 'Inside']);
    expect(button(tree, 'Size').props['aria-selected']).toBe(true);
    expect(sectionTitles(tree)).toEqual(['Kind', 'Cabinet', 'Pin', 'Remainder', 'Depth', 'Split', 'Wrap']);
    expect(nodes(tree).findIndex(({ props }) => props['aria-expanded'] !== undefined))
      .toBeLessThan(nodes(tree).findIndex(({ props }) => props.role === 'tablist'));
    expect(nodes(tree).some(({ type }) => type === 'h3')).toBe(false);
    button(tree, 'Faces & style').props.onClick();
    expect(sectionTitles(piecePanel())).toEqual(['Kind', 'Cabinet style', 'Faces']);
    button(piecePanel(), 'Inside').props.onClick();
    expect(sectionTitles(piecePanel())).toEqual(['Kind', 'Box', 'Interior']);
  });

  it('anchor 2: remembers Inside across cabinets and split sections and falls back for empty tabs', () => {
    setup();
    button(piecePanel(), 'Inside').props.onClick();
    expect(button(piecePanel('b'), 'Inside').props['aria-selected']).toBe(true);
    state = structuredClone(elevationReducer(state, splitCell({ wallId: 'wall-1', runId: 'run-1',
      cellId: 'a', direction: 'down', count: 2 })));
    expect(button(piecePanel('a', CellProperties), 'Inside').props['aria-selected']).toBe(true);
    expect(sectionTitles(piecePanel('a', CellProperties))).toEqual(['Kind', 'Box', 'Interior']);
    button(piecePanel('a', CellProperties), 'Interior').props.onClick();
    unmount();
    expect(button(piecePanel('b'), 'Inside').props['aria-selected']).toBe(true);
    expect(button(piecePanel('b'), 'Interior').props['aria-expanded']).toBe(false);
    const leaf = findCell(state.rooms[0].walls[0].runs[0].grid, 'a').cell.node;
    leaf.kind = 'void';
    expect(tabs(piecePanel('a', CellProperties)).map(text)).toEqual(['Size']);
    expect(button(piecePanel('a', CellProperties), 'Size').props['aria-selected']).toBe(true);
    expect(sectionTitles(piecePanel('a', CellProperties))).toEqual(['Kind', 'Size', 'Split']);
    leaf.kind = 'shelves';
    leaf.shelves = { count: 2, back: false };
    button(piecePanel('a', CellProperties), 'Inside').props.onClick();
    expect(tabs(piecePanel('a', CellProperties)).map(text)).toEqual(['Size', 'Inside']);
    expect(sectionTitles(piecePanel('a', CellProperties))).toEqual(['Kind', 'Shelves']);
    expect(nodes(piecePanel('a', CellProperties)).some(({ props }) => props['aria-label'] === 'Shelf count')).toBe(true);
  });

  it('anchor 3: badges typed width and gap right as 2 overridden, counting a zero gap', () => {
    setup();
    const run = state.rooms[0].walls[0].runs[0];
    run.grid.cols[0].size = 27;
    run.grid.cols[0].gap = 0;
    expect(text(sectionButton(piecePanel(), 'Cabinet'))).toContain('2 overridden');
    run.grid.cols[0].gap = null;
    expect(text(sectionButton(piecePanel(), 'Cabinet'))).toContain('1 overridden');
    run.grid.cols[0].size = null;
    expect(text(sectionButton(piecePanel(), 'Cabinet'))).not.toContain('overridden');
  });

  it('anchor 4: keeps a left end piece untabbed with collapsible controls; fillers and tees also collapse', () => {
    setup();
    const props = pieceProps();
    const endPiece = props.layout.pieces.find(({ role }) => role === 'end-left');
    const endProps = { ...props, selectionContext: { piece: endPiece, side: 'left' } };
    const tree = render(PieceProperties, endProps);
    expect(tabs(tree).map(text)).toEqual([]);
    expect(sectionTitles(tree)).toEqual(['left end piece']);
    expect(nodes(tree).some(({ props }) => props['aria-label'] === 'left end type')).toBe(true);
    button(tree, 'left end piece').props.onClick();
    expect(button(render(PieceProperties, endProps), 'left end piece').props['aria-expanded']).toBe(false);
    expect(nodes(render(PieceProperties, endProps)).some(({ props }) => props['aria-label'] === 'left end type')).toBe(false);
    const filler = { ...props.piece, kind: 'filler', width: 2 };
    const fillerTree = render(PieceProperties, { ...props, selectionContext: { piece: filler, item: filler } });
    expect(tabs(fillerTree)).toEqual([]);
    expect(sectionTitles(fillerTree)).toEqual(['Interior filler']);
    const tee = { id: 'tee', orientation: 'vertical', partWidth: 3, height: 30 };
    const teeTree = render(PieceProperties, { ...props, selectionContext: { piece: filler, tee } });
    expect(tabs(teeTree)).toEqual([]);
    expect(sectionTitles(teeTree)).toEqual(['Vertical T-filler']);
    expect(nodes(teeTree).some(({ type }) => type === 'h3')).toBe(false);
  });
});


describe('UI7 step a left panel sections', () => {
  const editor = (props = {}) => render(DesignerEditor, { mode: 'room', ...props });
  const aside = (tree) => nodes(tree).find(({ type }) => type === 'aside');

  it('anchor 1: orders the left sections before Room settings and Settings and locks editable content', () => {
    for (const mode of ['room', 'lab']) {
      const tree = editor({ mode, readOnly: true });
      const left = aside(tree);
      const blocks = nodes(left).filter(({ type, props }) =>
        (type === 'section' && !props['data-height-band'] && nodes(props.children).some(({ props }) => props['aria-expanded'] !== undefined))
        || [RoomSettingsPanel, SettingsPanel].includes(type));
      expect(blocks.map((block) => block.type === RoomSettingsPanel ? 'Room settings'
        : block.type === SettingsPanel ? 'Settings' : text(nodes(block).find(({ props }) => props['aria-expanded'] !== undefined).props.children[1])))
        .toEqual(['Walls', 'Room heights', 'Style & door styles', 'Part numbers & report', 'Room settings', 'Settings']);
      expect(nodes(left).some(({ type }) => type === 'h2' || type === 'h3')).toBe(false);
      if (mode === 'room') {
        const locked = nodes(left).find(({ type }) => type === 'fieldset');
        expect(locked.props).toMatchObject({ disabled: true, className: 'contents' });
        expect(button(locked, 'Add wall')).toBeDefined();
        expect(nodes(locked).find(({ type }) => type === RoomSettingsPanel)).toBeDefined();
        button(left, 'Style & door styles').props.onClick();
        button(left, 'Part numbers & report').props.onClick();
        const expanded = nodes(aside(editor({ mode, readOnly: true }))).find(({ type }) => type === 'fieldset');
        expect(nodes(expanded).find(({ props }) => props['aria-label'] === 'Draw door details')).toBeDefined();
        expect(nodes(expanded).find(({ props }) => props['aria-label'] === 'Part number start')).toBeDefined();
        // Restore the defaults before checking the lab layout.
        button(aside(editor()), 'Style & door styles').props.onClick();
        button(aside(editor()), 'Part numbers & report').props.onClick();
      }
    }
  });

  it('anchor 2: defaults Walls and heights open, style and parts closed, and persists each section with badges', () => {
    const room = state.rooms[0];
    room.profile = { toeKickHeight: 0, crownProfileId: null, baseKind: 'toe_kick', unused: undefined };
    room.style = { cabinetStyleId: 1, profiledEdge: false, beadWidth: 0, stileWidth: null, railWidth: undefined };
    room.settingsOverrides = { bandDepths: { crownProjection: 2 } };
    let left = aside(editor());
    const titles = ['Walls', 'Room heights', 'Style & door styles', 'Part numbers & report'];
    expect(titles.map((title) => sectionButton(left, title).props['aria-expanded'])).toEqual([true, true, false, false]);
    expect(text(sectionButton(left, 'Room heights'))).toContain('3 overridden');
    expect(text(sectionButton(left, 'Style & door styles'))).toContain('3 overridden');
    expect(text(sectionButton(left, 'Walls'))).not.toContain('overridden');
    expect(text(sectionButton(left, 'Part numbers & report'))).not.toContain('overridden');
    titles.forEach((title) => sectionButton(left, title).props.onClick());
    expect(['walls', 'heights', 'style', 'parts'].map((id) => storage.get(`ff.panel.left.${id}`)))
      .toEqual(['false', 'false', 'true', 'true']);
    unmount();
    left = aside(editor());
    expect(titles.map((title) => sectionButton(left, title).props['aria-expanded'])).toEqual([false, false, true, true]);
    room.profile = {};
    room.style = {};
    expect(text(sectionButton(aside(editor()), 'Room heights'))).not.toContain('overridden');
    expect(text(sectionButton(aside(editor()), 'Style & door styles'))).not.toContain('overridden');
  });

  it('anchor 3: shows cabinet style before a light Door styles section containing both styles and display controls', () => {
    state.rooms[0].doorStyles = [
      { id: 'style-a', label: 'A', name: 'First style', designId: 'design-a', thickness: 0.75 },
      { id: 'style-b', label: 'B', name: 'Second style', designId: 'design-b', thickness: 0.875 },
    ];
    button(aside(editor()), 'Style & door styles').props.onClick();
    let left = aside(editor());
    const fieldsIndex = nodes(left).findIndex(({ type }) => type?.name === 'StyleFields');
    const doorIndex = nodes(left).findIndex(({ type, props }) => type === 'button' && props['aria-expanded'] !== undefined && text(props.children[1]) === 'Door styles');
    expect(fieldsIndex).toBeGreaterThan(-1);
    expect(fieldsIndex).toBeLessThan(doorIndex);
    const doorToggle = sectionButton(left, 'Door styles');
    expect(doorToggle.props.className).toContain('text-[11px]');
    expect(doorToggle.props['aria-expanded']).toBe(true);
    expect(text(left)).toContain('First style');
    expect(text(left)).toContain('Second style');
    for (const label of ['Draw door details', 'Show style tags', 'Show swing marks', 'Show pulls']) {
      expect(nodes(left).filter(({ type, props }) => type === 'input' && props.type === 'checkbox' && props['aria-label'] === label)).toHaveLength(1);
    }
    expect(nodes(left).some(({ type }) => type === 'h3')).toBe(false);
    doorToggle.props.onClick();
    left = aside(editor());
    expect(text(left)).not.toContain('First style');
    expect(nodes(left).some(({ props }) => props['aria-label'] === 'Draw door details')).toBe(false);
    expect(storage.get('ff.panel.left.doorStyles')).toBe('false');
  });
});
