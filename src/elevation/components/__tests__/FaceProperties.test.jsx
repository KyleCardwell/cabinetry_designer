import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { findLeaf } from '../../model/cellTree.js';
import { CABINET_TYPE_IDS } from '../../model/constants.js';
import { resolveWall } from '../../model/room.js';
import { runScene } from '../../model/runScene.js';
import { runFaceLayouts } from '../../model/faceLayouts.js';
import { formatInches } from '../../model/units.js';
import elevationReducer from '../../store/elevationSlice.js';
import { run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import FaceProperties from '../properties/FaceProperties.jsx';
import CabinetProperties from '../properties/CabinetProperties.jsx';
import CellProperties from '../properties/CellProperties.jsx';
import CabinetStyleProperties from '../properties/CabinetStyleProperties.jsx';
import BoxConstructionFields from '../properties/BoxConstructionFields.jsx';
import InteriorFields from '../properties/InteriorFields.jsx';
import DrawerBoxFields from '../properties/DrawerBoxFields.jsx';
import PanelSection from '../panel/PanelSection.jsx';
import PanelTabs from '../panel/PanelTabs.jsx';
import InchInput from '../InchInput.jsx';

vi.mock('react', async (importOriginal) => ({ ...await importOriginal(), useState: vi.fn(), useEffect: vi.fn(), useMemo: (fn) => fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

let state;
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const room = () => state.rooms[0];
const run = () => room().walls[0].runs[0];
const item = () => findLeaf(run().grid, 'cabinet');
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : typeof tree === 'string' ? tree : text(tree?.props?.children ?? []);

function render(part = 'style') {
  const wall = resolveWall(room(), room().walls[0]);
  const scene = runScene(room(), wall, run(), state.settings);
  return FaceProperties({ part,
    wall, run: run(), item: item(),
    piece: scene.cells.pieces.find(({ id }) => id === 'cabinet'),
    layout: scene.result, cells: scene.cells, settings: state.settings,
  });
}

const picker = (label) => nodes(render()).find(({ props }) => props['aria-label'] === label);
const options = (label) => nodes(picker(label)).filter(({ type }) => type === 'option');
const values = (label) => options(label).map(({ props }) => props.value);
const pick = (label, value) => picker(label).props.onChange({ target: { value } });

const doorOverStack = () => ({ direction: 'vertical', size: null, children: [
  { type: 'door', size: null },
  { direction: 'vertical', size: null, children: [
    { type: 'drawer_front', size: 5.875 }, { type: 'drawer_front', size: 5.875 },
    { type: 'drawer_front', size: null }, { type: 'drawer_front', size: null },
  ] },
] });

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(makeRun({
    width: 18, autoCount: false,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [{ id: 'cabinet', kind: 'cabinet', width: 18 }],
  }));
  state.facePath = 'r';
  useState.mockImplementation(() => [2, vi.fn()]);
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

describe('HP1 step c face hinge and opens pickers', () => {
  it('anchor 1: defaults a single door to Swing and offers all five hinge options', () => {
    expect(picker('Opens').props.value).toBe('swing');
    expect(options('Opens').map(text)).toEqual(['Swing', 'Flipper', 'Pocket', 'Sliding', 'Pull-out']);
    expect(picker('Hinge').props.value).toBe('');
    expect(options('Hinge').map(text)).toEqual(['Auto (left)', 'Left', 'Right', 'Top', 'Bottom']);
    expect(values('Hinge')).toEqual(['', 'left', 'right', 'top', 'bottom']);
    const fields = nodes(render()).filter(({ type }) => type === 'select');
    expect(fields.map(({ props }) => props['aria-label']).slice(-3)).toEqual(['Opens', 'Panel', 'Hinge']);
    for (const hinge of ['left', 'right', 'top', 'bottom']) {
      pick('Hinge', hinge);
      expect(item().face.hinge).toBe(hinge);
      expect(picker('Hinge').props.value).toBe(hinge);
    }
    pick('Hinge', '');
    expect(item().face).not.toHaveProperty('hinge');
    expect(text(options('Hinge')[0])).toBe('Auto (left)');
  });

  it('anchor 2: stores Pull-out and Sliding, clears hinges, and hides the hinge picker', () => {
    for (const action of ['pullout', 'sliding']) {
      pick('Hinge', 'left');
      pick('Opens', action);
      expect(item().face.action).toBe(action);
      expect(item().face).not.toHaveProperty('hinge');
      expect(picker('Opens').props.value).toBe(action);
      expect(picker('Hinge')).toBeUndefined();
      pick('Opens', 'swing');
      expect(item().face).not.toHaveProperty('action');
      expect(picker('Hinge').props.value).toBe('');
      expect(values('Hinge')).toHaveLength(5);
    }
  });

  it('anchor 3: clears Top/Bottom for Flipper/Pocket and offers only side hinges', () => {
    for (const [hinge, action] of [['top', 'flipper'], ['bottom', 'pocket']]) {
      pick('Hinge', hinge);
      expect(item().face.hinge).toBe(hinge);
      pick('Opens', action);
      expect(item().face.action).toBe(action);
      expect(item().face).not.toHaveProperty('hinge');
      expect(options('Hinge').map(text)).toEqual(['Auto (left)', 'Left', 'Right']);
      expect(values('Hinge')).toEqual(['', 'left', 'right']);
      pick('Hinge', 'right');
      expect(item().face.hinge).toBe('right');
      pick('Opens', 'swing');
      expect(item().face).not.toHaveProperty('action');
      expect(item().face.hinge).toBe('right');
    }
  });

  it('anchor 4: offers pair door actions without Pull-out and never shows a hinge picker', () => {
    item().face = { type: 'pair_door', size: null };
    expect(picker('Opens').props.value).toBe('swing');
    expect(options('Opens').map(text)).toEqual(['Swing', 'Flipper', 'Pocket', 'Sliding']);
    expect(picker('Hinge')).toBeUndefined();
    for (const action of ['flipper', 'pocket', 'sliding']) {
      pick('Opens', action);
      expect(item().face.action).toBe(action);
      expect(picker('Opens').props.value).toBe(action);
      expect(picker('Hinge')).toBeUndefined();
    }
    pick('Opens', 'swing');
    expect(item().face).not.toHaveProperty('action');
    expect(picker('Opens').props.value).toBe('swing');
  });
});

describe('IN14 step b panel picker', () => {
  it('anchor 1: stores Glass, removes Standard, and skips unchanged commits', () => {
    expect(picker('Panel').props.value).toBe('');
    expect(options('Panel').map(text)).toEqual(['Standard', 'Glass']);
    expect(values('Panel')).toEqual(['', 'glass']);
    pick('Panel', '');
    expect(dispatch).not.toHaveBeenCalled();
    pick('Panel', 'glass');
    expect(item().face.panelMaterial).toBe('glass');
    expect(picker('Panel').props.value).toBe('glass');
    dispatch.mockClear();
    pick('Panel', 'glass');
    expect(dispatch).not.toHaveBeenCalled();
    pick('Panel', '');
    expect(item().face).not.toHaveProperty('panelMaterial');
    expect(picker('Panel').props.value).toBe('');
  });

  it('anchor 2: shows Panel on pair doors and hides it on pull-outs, other leaves and groups', () => {
    item().face = { direction: 'vertical', size: null, children: [
      { type: 'pair_door', size: null }, { type: 'drawer_front', size: null },
    ] };
    expect(picker('Panel')).toBeUndefined();
    state.facePath = 'r.0';
    expect(picker('Panel')).toBeDefined();
    pick('Panel', 'glass');
    expect(item().face.children[0].panelMaterial).toBe('glass');
    state = structuredClone(state);
    item().face = { type: 'door', size: null, action: 'pullout' };
    state.facePath = 'r';
    expect(picker('Panel')).toBeUndefined();
    for (const type of ['drawer_front', 'false_front', 'open']) {
      item().face = { type, size: null };
      expect(picker('Panel')).toBeUndefined();
    }
    state.facePath = null;
    expect(picker('Panel')).toBeUndefined();
  });

  it('anchor 4: warns about glass on a slab-style door using the material label', () => {
    state.settings.teamDoorStyle = { ...state.settings.teamDoorStyle, designId: 'slab' };
    item().face = { type: 'door', size: null, panelMaterial: 'glass' };
    expect(text(render())).toContain("A glass panel needs a 5-piece door — this face's style is a slab here.");
  });
});

describe('IN7.3 step b match base drawers', () => {
  const tick = (checked) => picker('Match base drawers').props.onChange({ target: { checked } });
  const tallStack = () => {
    run().cabinetTypeId = CABINET_TYPE_IDS.TALL;
    run().height = 90;
    item().face = doorOverStack();
    state.facePath = 'r.1';
  };

  it('anchors 1–2: ticking matches the bank; typing 29 clears the match and tick', () => {
    tallStack();
    expect(picker('Match base drawers').props.checked).toBe(false);
    tick(true);
    expect(item().face.children[1]).toMatchObject({ match: 'base', size: null });
    expect(picker('Face size r.1').props.placeholder).toBe('base (30 1/8")');
    expect(picker('Match base drawers').props.checked).toBe(true);
    expect(picker('Face size r.1').props.onCommit(29)).toBe(true);
    expect(item().face.children[1].size).toBe(29);
    expect(item().face.children[1]).not.toHaveProperty('match');
    expect(picker('Match base drawers').props.checked).toBe(false);
    expect(picker('Face size r.1').props.placeholder).toBe('auto');
    tick(true);
    tick(false);
    expect(item().face.children[1].size).toBeNull();
    expect(item().face.children[1]).not.toHaveProperty('match');
  });

  it('anchor 3: prints the wood-top base mismatch with the resolved heights', () => {
    tallStack();
    tick(true);
    state = structuredClone(state);
    room().walls[0].runs.push(makeRun({ id: 'base', x: 30, width: 18, autoCount: false, top: 'wood',
      ends: { left: { type: 'none' }, right: { type: 'none' } },
      items: [{ id: 'base-cabinet', kind: 'cabinet', width: 18, face: doorOverStack().children[1] }],
    }));
    expect(text(render())).toContain('Base drawers on this wall are 30 1/4"; this stack matches the 30 1/8" standard.');
  });

  it('anchor 4: the same base on stone has no mismatch warning', () => {
    tallStack();
    tick(true);
    state = structuredClone(state);
    room().walls[0].runs.push(makeRun({ id: 'base', x: 30, width: 18, autoCount: false, top: 'stone',
      ends: { left: { type: 'none' }, right: { type: 'none' } },
      items: [{ id: 'base-cabinet', kind: 'cabinet', width: 18, face: doorOverStack().children[1] }],
    }));
    expect(text(render())).not.toContain('Base drawers on this wall');
  });

  it('anchor 5: hides the tick for root groups, width-sized groups, and leaves', () => {
    tallStack();
    state.facePath = 'r';
    expect(picker('Match base drawers')).toBeUndefined();
    item().face.direction = 'horizontal';
    state.facePath = 'r.1';
    expect(picker('Match base drawers')).toBeUndefined();
    state.facePath = 'r.0';
    expect(picker('Match base drawers')).toBeUndefined();
  });

  it('anchor 6: Drawer stack (4) defaults to match only in a height-sized tall section', () => {
    for (const [type, path, direction, matched] of [
      [CABINET_TYPE_IDS.TALL, 'r.1', 'vertical', true],
      [CABINET_TYPE_IDS.BASE, 'r.1', 'vertical', false],
      [CABINET_TYPE_IDS.TALL, 'r', 'vertical', false],
      [CABINET_TYPE_IDS.TALL, 'r.1', 'horizontal', false],
    ]) {
      state = structuredClone(state);
      run().cabinetTypeId = type;
      run().height = type === CABINET_TYPE_IDS.TALL ? 90 : 30.5;
      item().face = path === 'r' ? { type: 'door', size: null } : {
        direction, size: null, children: [{ type: 'door', size: null }, { type: 'door', size: null }],
      };
      state.facePath = path;
      useState.mockImplementation(() => [4, vi.fn()]);
      nodes(render()).find((node) => node.type === 'button' && text(node) === 'Drawer stack').props.onClick();
      const stack = path === 'r' ? item().face : item().face.children[1];
      expect(stack.children).toHaveLength(4);
      expect(stack.match === 'base').toBe(matched);
      if (matched) expect(picker('Match base drawers').props.checked).toBe(true);
    }
  });
});

// Render the real input with its hook state, including the blur/parse/commit path.
function sizeInput(path, typed) {
  const field = picker(`Face size ${path}`);
  const setText = vi.fn();
  useState.mockImplementationOnce((initial) => [typed ?? initial(), setText]);
  return { input: InchInput(field.props), setText };
}

function faceLayouts() {
  const wall = resolveWall(room(), room().walls[0]);
  return runFaceLayouts(room(), wall, run(), state.settings).get('cabinet');
}

function preset(label) {
  nodes(render()).find((node) => node.type === 'button' && text(node) === label).props.onClick();
  state = structuredClone(state);
}

describe('IN7.4 step b rule-made sizes in the face list', () => {
  beforeEach(() => {
    run().top = 'wood';
    preset('4Df');
    state = { ...state, facePath: 'r.0' };
  });

  it('anchor 1: shows empty gray inputs with resolved standard and auto heights', () => {
    const standard = sizeInput('r.0').input;
    expect(standard.props.value).toBe('');
    expect(standard.props.placeholder).toBe('std (5 15/16")');
    expect(standard.props.className).toContain('placeholder:text-gray-500');
    const auto = sizeInput('r.2').input;
    expect(auto.props.value).toBe('');
    expect(auto.props.placeholder).toBe('auto (9")');
    expect(auto.props.className).toContain('placeholder:text-gray-500');
  });

  it('anchor 2: typing 5 7/8 pins the white value and the canvas height', () => {
    sizeInput('r.0', '5 7/8').input.props.onBlur();
    expect(item().face.children[0]).toEqual({ type: 'drawer_front', size: 5.875 });
    const input = sizeInput('r.0').input;
    expect(input.props.value).toBe('5 7/8');
    expect(input.props.className).toContain('text-gray-100');
    expect(faceLayouts().faces.find(({ path }) => path === 'r.0').height).toBe(5.875);
  });

  it.each(['std', 'standard', ' StD ', ' STANDARD '])('anchor 3: typing %s restores standard', (typed) => {
    sizeInput('r.0', '5 7/8').input.props.onBlur();
    const { input, setText } = sizeInput('r.0', typed);
    input.props.onBlur();
    expect(setText).toHaveBeenLastCalledWith('');
    expect(item().face.children[0]).toEqual({ type: 'drawer_front', size: null, match: 'standard' });
    expect(sizeInput('r.0').input.props.value).toBe('');
    expect(sizeInput('r.0').input.props.placeholder).toBe('std (5 15/16")');
  });

  it('anchor 4: std on a door reverts without dispatching', () => {
    preset('Df/D');
    state = { ...state, facePath: 'r.1' };
    sizeInput('r.1', '12').input.props.onBlur();
    dispatch.mockClear();
    const { input, setText } = sizeInput('r.1', 'std');
    input.props.onBlur();
    expect(setText).toHaveBeenLastCalledWith('12');
    expect(dispatch).not.toHaveBeenCalled();
    expect(picker('Standard')).toBeUndefined();
  });

  it('anchor 5: a tall D/4Df stack shows the resolved base bank height', () => {
    run().cabinetTypeId = CABINET_TYPE_IDS.TALL;
    run().height = 90;
    preset('D/4Df');
    const input = sizeInput('r.1').input;
    expect(input.props.value).toBe('');
    expect(input.props.placeholder).toBe('base (30 1/8")');
  });

  it('anchor 6: the Standard tick turns an auto drawer to standard and back to auto', () => {
    state = { ...state, facePath: 'r.2' };
    expect(picker('Standard').props.checked).toBe(false);
    picker('Standard').props.onChange({ target: { checked: true } });
    expect(item().face.children[2]).toEqual({ type: 'drawer_front', size: null, match: 'standard' });
    expect(picker('Standard').props.checked).toBe(true);
    picker('Standard').props.onChange({ target: { checked: false } });
    expect(item().face.children[2]).toEqual({ type: 'drawer_front', size: null });
    expect(picker('Standard').props.checked).toBe(false);
  });

  it.each(['', 'auto', ' AUTO '])('clears standard and base matches with %j', (typed) => {
    sizeInput('r.0', typed).input.props.onBlur();
    expect(item().face.children[0]).toEqual({ type: 'drawer_front', size: null });
    expect(sizeInput('r.0').input.props.value).toBe('');
    expect(sizeInput('r.0').input.props.placeholder).toMatch(/^auto \(/);
    state = structuredClone(state);
    run().cabinetTypeId = CABINET_TYPE_IDS.TALL;
    run().height = 90;
    preset('D/4Df');
    sizeInput('r.1', typed).input.props.onBlur();
    expect(item().face.children[1].size).toBeNull();
    expect(item().face.children[1]).not.toHaveProperty('match');
    expect(sizeInput('r.1').input.props.placeholder).toBe('auto');
  });

  it('uses width for auto leaves in a horizontal parent and keeps auto groups plain', () => {
    item().face = { direction: 'vertical', size: null, children: [
      { direction: 'horizontal', size: null, children: [
        { type: 'drawer_front', size: null }, { type: 'false_front', size: null },
      ] },
      { type: 'door', size: null },
    ] };
    expect(sizeInput('r.0').input.props.placeholder).toBe('auto');
    const resolved = faceLayouts().faces.find(({ path }) => path === 'r.0.0');
    expect(sizeInput('r.0.0').input.props.placeholder).toBe(`auto (${formatInches(resolved.width)})`);
    state = { ...state, facePath: 'r.0.0' };
    expect(picker('Standard')).toBeUndefined();
    const { input, setText } = sizeInput('r.0.0', 'std');
    dispatch.mockClear();
    input.props.onBlur();
    expect(setText).toHaveBeenLastCalledWith('');
    expect(dispatch).not.toHaveBeenCalled();
    state = { ...state, facePath: 'r.0' };
    expect(picker('Standard')).toBeDefined();
    sizeInput('r.0', 'std').input.props.onBlur();
    expect(item().face.children[0].match).toBe('standard');
    expect(sizeInput('r.0').input.props.placeholder).toBe('std (6")');
    expect(picker('Standard').props.checked).toBe(true);
    state = { ...state, facePath: 'r' };
    expect(picker('Standard')).toBeUndefined();
  });

  it('allows a false front but rejects a horizontal group containing a door', () => {
    item().face = { direction: 'vertical', size: null, children: [
      { type: 'false_front', size: null },
      { direction: 'horizontal', size: null, children: [
        { type: 'drawer_front', size: null }, { type: 'door', size: null },
      ] },
    ] };
    sizeInput('r.0', 'std').input.props.onBlur();
    expect(item().face.children[0].match).toBe('standard');
    expect(picker('Standard')).toBeDefined();
    state = { ...state, facePath: 'r.1' };
    expect(picker('Standard')).toBeUndefined();
    dispatch.mockClear();
    sizeInput('r.1', 'std').input.props.onBlur();
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('InchInput standard opt-in', () => {
  it('keeps std invalid for other callers', () => {
    const onCommit = vi.fn();
    const onStandard = vi.fn();
    const setText = vi.fn();
    useState.mockReturnValueOnce(['std', setText]);
    InchInput({ value: 5, onCommit, onStandard }).props.onBlur();
    expect(setText).toHaveBeenCalledWith('5');
    expect(onCommit).not.toHaveBeenCalled();
    expect(onStandard).not.toHaveBeenCalled();
  });

  it('reverts when the standard callback rejects the edit', () => {
    const setText = vi.fn();
    const onStandard = vi.fn(() => false);
    useState.mockReturnValueOnce(['standard', setText]);
    InchInput({ value: 5, allowStandard: true, onStandard }).props.onBlur();
    expect(onStandard).toHaveBeenCalledOnce();
    expect(setText).toHaveBeenCalledWith('5');
  });
});


describe('UI6 step a face property parts', () => {
  const drawerBank = () => {
    item().face = { direction: 'vertical', size: null, children: Array.from({ length: 3 }, () => (
      { type: 'drawer_front', size: null }
    )) };
  };
  const panels = (tree) => nodes(tree).filter(({ type }) => [CabinetStyleProperties,
    BoxConstructionFields, InteriorFields, DrawerBoxFields, PanelSection].includes(type))
    .map((element) => element.type === PanelSection ? element : element.type(element.props));

  it('anchor 1: style on a door cabinet contains Cabinet style and Faces, without inside controls', () => {
    let tree = render('style');
    expect(panels(tree).map(({ props }) => [props.id, props.title, props.badge])).toEqual([
      ['piece.style', 'Cabinet style', 0], ['piece.faces', 'Faces', 0],
    ]);
    expect(nodes(tree).some(({ type }) => [BoxConstructionFields, InteriorFields, DrawerBoxFields].includes(type))).toBe(false);
    const faces = nodes(tree).find(({ type }) => type === PanelSection);
    expect(text(faces.props.actions)).toBe('Default');
    expect(picker('Opens').props.value).toBe('swing');
    expect(picker('Panel')).toBeDefined();
    expect(picker('Hinge')).toBeDefined();

    // An own preset adds a badge; Reset still clears it and the face selection.
    item().face = { type: 'door', size: null };
    item().style = { cabinetStyleId: 1, beadWidth: 0, stileWidth: null };
    item().doorStyleId = 'custom';
    item().drawerPullId = 'none';
    tree = render('style');
    const [style, editedFaces] = panels(tree);
    expect(style.props.badge).toBe(4);
    expect(editedFaces.props.badge).toBe(1);
    expect(text(editedFaces.props.actions)).toBe('Reset');
    editedFaces.props.actions.props.onClick();
    expect(item().face).toBeNull();
    expect(state.facePath).toBeNull();
  });

  it('anchor 2: inside on a drawer bank contains Box, Interior and Drawer boxes, without Faces', () => {
    drawerBank();
    const tree = render('inside');
    expect(panels(tree).map(({ props }) => [props.id, props.title])).toEqual([
      ['piece.box', 'Box'], ['piece.interior', 'Interior'], ['piece.drawerBoxes', 'Drawer boxes'],
    ]);
    expect(nodes(tree).some(({ type }) => type === CabinetStyleProperties || type === PanelSection)).toBe(false);
    expect(nodes(tree).some(({ props }) => props['aria-label']?.startsWith('Face type'))).toBe(false);
    const drawerFields = nodes(tree).find(({ type }) => type === DrawerBoxFields);
    expect(drawerFields.props.itemIds).toEqual(['cabinet']);
    expect(drawerFields.props.faceLayout.faces.every(({ type }) => type === 'drawer_front')).toBe(true);

    // The existing conditional still omits Drawer boxes for a door-only cabinet.
    item().face = { type: 'door', size: null };
    expect(panels(render('inside')).map(({ props }) => props.title)).toEqual(['Box', 'Interior']);
  });

  it('both callers retain the style and inside controls in their respective tabs', () => {
    drawerBank();
    const wall = resolveWall(room(), room().walls[0]);
    const scene = runScene(room(), wall, run(), state.settings);
    const props = { room: room(), wall, run: run(), item: item(),
      piece: scene.cells.pieces.find(({ id }) => id === 'cabinet'),
      layout: scene.result, cells: scene.cells, settings: state.settings };
    for (const Component of [CabinetProperties, CellProperties]) {
      const tabs = nodes(Component(props)).find(({ type }) => type === PanelTabs);
      const parts = ['style', 'inside'].flatMap((active) => nodes(tabs.props.children(active)))
        .filter(({ type }) => type === FaceProperties);
      expect(parts.map(({ props }) => props.part)).toEqual(['style', 'inside']);
      for (const part of parts) {
        for (const key of ['wall', 'run', 'piece', 'item', 'layout', 'cells', 'settings']) {
          expect(part.props[key]).toBe(props[key]);
        }
      }
      const sections = parts.flatMap((part) => panels(FaceProperties(part.props)));
      expect(sections.map(({ props }) => props.title)).toEqual([
        'Cabinet style', 'Faces', 'Box', 'Interior', 'Drawer boxes',
      ]);
      expect(sections.every(({ type }) => type === PanelSection)).toBe(true);
      expect(nodes(sections).some(({ type }) => type === 'h3')).toBe(false);
      const labels = nodes(sections).map(({ props }) => props['aria-label']).filter(Boolean);
      expect(labels).toEqual(expect.arrayContaining([
        'Cabinet purpose', 'Face type r.0', 'Face type r.1', 'Face type r.2',
        'Back', 'Top', 'Bottom', 'Left side', 'Right side', 'Finished top', 'Finished bottom',
        'Interior sections', 'Drawer height r.0', 'Drawer depth r.0',
      ]));
    }
  });
});
