import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { wall } from '../../../test/builders.js';
import { K, KC } from '../../../test/fixtures/landingRoomK.js';
import { resolveWall } from '../../model/room.js';
import elevationReducer, { createInitialElevationState, extendPastCorner } from '../../store/elevationSlice.js';
import MessageToast from '../MessageToast.jsx';
import WallHeightProperties from '../properties/WallHeightProperties.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

let state, selectedId, slots, cursor, effects, plan;
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (children) => [children].flat().filter((part) => typeof part === 'string').join('');
const byId = (room, id) => room.walls.find((candidate) => candidate.id === id);
const geometry = (room) => room.walls.map(({ id, x1, y1, x2, y2, flipped, connections, landings }) => ({
  id, x1, y1, x2, y2, flipped, connections, landings,
}));

function render(component = 'panel') {
  cursor = 0;
  if (component === 'toast') return MessageToast();
  const room = state.rooms[0];
  const selected = byId(room, selectedId);
  const tree = WallHeightProperties({ room, wall: resolveWall(room, selected, 'front'), plan });
  const pending = effects;
  effects = [];
  pending.forEach((effect) => effect());
  return tree;
}
const buttons = (tree, label) => nodes(tree)
  .filter(({ type, props }) => type === 'button' && text(props.children) === label);
const input = (label) => nodes(render()).find(({ props }) => props?.['aria-label'] === label)?.props;
const extendLabels = () => nodes(render())
  .map(({ props }) => props?.['aria-label'])
  .filter((label) => typeof label === 'string' && label.startsWith('Extend past '));
const load = (room) => {
  state = { ...createInitialElevationState(null), rooms: [structuredClone(room)], activeRoomId: room.id };
};

beforeEach(() => {
  vi.clearAllMocks();
  slots = [];
  effects = [];
  selectedId = 'wall-2';
  plan = true;
  load(K);
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  useState.mockImplementation((initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], (value) => {
      slots[index] = typeof value === 'function' ? value(slots[index]) : value;
    }];
  });
  useEffect.mockImplementation((effect, deps) => {
    const index = cursor++;
    if (!deps) return;
    if (!slots[index] || deps.some((value, i) => value !== slots[index][i])) effects.push(effect);
    slots[index] = deps;
  });
});

describe('properties (WL3)', () => {

  it('Extend past fields per joined end; the button applies the typed amount and clears', () => {
    load(KC);
    selectedId = 'wall-3';
    expect(extendLabels()).toEqual(['Extend past Wall 2', 'Extend past Wall 4']);
    expect(input('Extend past Wall 2')).toMatchObject({ value: null, placeholder: '0' });
    expect(input('Extend past Wall 2').onCommit(-1)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    const before = nodes(render()).find(({ props }) => props?.label === 'Extend past Wall 2').key;
    expect(input('Extend past Wall 2').onCommit(39)).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
    buttons(render(), 'Extend past')[0].props.onClick();
    expect(dispatch).toHaveBeenLastCalledWith(extendPastCorner({ wallId: 'wall-3', endpoint: 'start', amount: 39 }));
    expect(geometry(state.rooms[0])).toEqual(geometry(K));
    load(KC);
    expect(nodes(render()).find(({ props }) => props?.label === 'Extend past Wall 2').key).not.toBe(before);
  });

});

describe('Corners section (WL3.1)', () => {
  const section = () => nodes(render()).find(({ props }) => props?.id === 'wall.corners');
  const headings = () => nodes(section()?.props.children)
    .filter(({ type }) => type === 'h3').map(({ props }) => text(props.children));

  it('a blank field extends by 0', () => {
    load(KC);
    selectedId = 'wall-3';
    buttons(render(), 'Extend past')[0].props.onClick();
    expect(dispatch).toHaveBeenLastCalledWith(extendPastCorner({ wallId: 'wall-3', endpoint: 'start', amount: 0 }));
    expect(byId(state.rooms[0], 'wall-3')).toMatchObject({ x2: -123.5 });
    expect(byId(state.rooms[0], 'wall-2').landings.end).toMatchObject({ wallId: 'wall-3', offset: 0 });
  });

  it('a typed amount, then a blanked field, go back to 0', () => {
    load(KC);
    selectedId = 'wall-3';
    input('Extend past Wall 2').onCommit(39);
    input('Extend past Wall 2').onCommit(null);
    buttons(render(), 'Extend past')[0].props.onClick();
    expect(dispatch).toHaveBeenLastCalledWith(extendPastCorner({ wallId: 'wall-3', endpoint: 'start', amount: 0 }));
  });

});
