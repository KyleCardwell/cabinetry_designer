import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { findLeaf } from '../../model/cellTree.js';
import { CABINET_TYPE_IDS } from '../../model/constants.js';
import { resolveWall } from '../../model/room.js';
import { runScene } from '../../model/runScene.js';
import elevationReducer from '../../store/elevationSlice.js';
import { run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import FaceProperties from '../properties/FaceProperties.jsx';

vi.mock('react', async (importOriginal) => ({ ...await importOriginal(), useState: vi.fn() }));
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

function render() {
  const wall = resolveWall(room(), room().walls[0]);
  const scene = runScene(room(), wall, run(), state.settings);
  return FaceProperties({
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
    expect(fields.map(({ props }) => props['aria-label']).slice(-2)).toEqual(['Opens', 'Hinge']);
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

describe('IN7.4 typed heights in the face list', () => {
  it('keeps typed 5 7/8 unchanged with either top and shows no growth hint', () => {
    for (const top of ['wood', 'stone']) {
      state = stateWithRun(makeRun({
        width: 18, autoCount: false, top,
        ends: { left: { type: 'none' }, right: { type: 'none' } },
        items: [{ id: 'cabinet', kind: 'cabinet', width: 18, face: { direction: 'vertical', size: null, children: [
          { type: 'drawer_front', size: 5.875 }, { type: 'drawer_front', size: null }, { type: 'drawer_front', size: null },
        ] } }],
      }));
      state.facePath = 'r';
      expect(picker('Face size r.0').props.value).toBe(5.875);
      expect(picker('Face size used r.0')).toBeUndefined();
      expect(picker('Face size used r.1')).toBeUndefined();
    }
  });
});
