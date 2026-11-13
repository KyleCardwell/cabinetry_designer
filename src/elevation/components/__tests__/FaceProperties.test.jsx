import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { findLeaf } from '../../model/cellTree.js';
import { CABINET_TYPE_IDS } from '../../model/constants.js';
import { resolveWall } from '../../model/room.js';
import { runScene } from '../../model/runScene.js';
import { runFaceLayouts } from '../../model/faceLayouts.js';
import elevationReducer from '../../store/elevationSlice.js';
import { run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import FaceProperties from '../properties/FaceProperties.jsx';
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

describe('match base drawers (IN7.3)', () => {
  const tick = (checked) => picker('Match base drawers').props.onChange({ target: { checked } });
  const tallStack = () => {
    run().cabinetTypeId = CABINET_TYPE_IDS.TALL;
    run().height = 90;
    item().face = doorOverStack();
    state.facePath = 'r.1';
  };

  it('ticking matches the bank; typing 29 clears the match and tick', () => {
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

describe('rule-made sizes in the face list (IN7.4)', () => {
  beforeEach(() => {
    run().top = 'wood';
    preset('4Df');
    state = { ...state, facePath: 'r.0' };
  });

  it('typing 5 7/8 pins the white value and the canvas height', () => {
    sizeInput('r.0', '5 7/8').input.props.onBlur();
    expect(item().face.children[0]).toEqual({ type: 'drawer_front', size: 5.875 });
    const input = sizeInput('r.0').input;
    expect(input.props.value).toBe('5 7/8');
    expect(input.props.className).toContain('text-gray-100');
    expect(faceLayouts().faces.find(({ path }) => path === 'r.0').height).toBe(5.875);
  });

  it.each(['std', 'standard', ' StD ', ' STANDARD '])('typing %s restores standard', (typed) => {
    sizeInput('r.0', '5 7/8').input.props.onBlur();
    const { input, setText } = sizeInput('r.0', typed);
    input.props.onBlur();
    expect(setText).toHaveBeenLastCalledWith('');
    expect(item().face.children[0]).toEqual({ type: 'drawer_front', size: null, match: 'standard' });
    expect(sizeInput('r.0').input.props.value).toBe('');
    expect(sizeInput('r.0').input.props.placeholder).toBe('std (5 15/16")');
  });

});

