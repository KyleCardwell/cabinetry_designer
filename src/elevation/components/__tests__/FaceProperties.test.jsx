import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { findLeaf } from '../../model/cellTree.js';
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
