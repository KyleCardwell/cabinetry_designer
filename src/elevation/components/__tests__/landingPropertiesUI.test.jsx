import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { room, wall } from '../../../test/builders.js';
import { resolveWall } from '../../model/room.js';
import elevationReducer, { createInitialElevationState, setWallLanding } from '../../store/elevationSlice.js';
import WallHeightProperties from '../properties/WallHeightProperties.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const K = room({
  wallOrder: ['wall-1', 'wall-2', 'wall-3', 'wall-4'],
  walls: [
    wall({
      id: 'wall-1', x1: 123.5, y1: 83.5, x2: -38.5, y2: 83.5, thickness: 4.5,
      connections: { start: null, end: { wallId: 'wall-2', endpoint: 'start' } },
      landings: { start: null, end: null },
    }),
    wall({
      id: 'wall-2', x1: -38.5, y1: 83.5, x2: -38.5, y2: 13.5, thickness: 4.5,
      connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null },
      landings: {
        start: null,
        end: { wallId: 'wall-3', side: 'back', ref: 'right', to: 'near', offset: 39 },
      },
    }),
    wall({
      id: 'wall-3', x1: 0.5, y1: 9, x2: -123.5, y2: 9, thickness: 4.5,
      connections: { start: null, end: { wallId: 'wall-4', endpoint: 'start' } },
      landings: { start: null, end: null },
    }),
    wall({
      id: 'wall-4', x1: -123.5, y1: 9, x2: -123.5, y2: -83, thickness: 4.5,
      connections: { start: { wallId: 'wall-3', endpoint: 'end' }, end: null },
      landings: { start: null, end: null },
    }),
  ],
});

let state, selectedId, slots, cursor, effects;
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];

// Preserve hook state and run changed effects after each panel render.
function render() {
  cursor = 0;
  const room = state.rooms[0];
  const selected = room.walls.find(({ id }) => id === selectedId);
  const tree = WallHeightProperties({ room, wall: resolveWall(room, selected, 'front'), plan: true });
  const pending = effects;
  effects = [];
  pending.forEach((effect) => effect());
  return tree;
}
const field = (suffix, side = 'right') => nodes(render())
  .find(({ props }) => props['aria-label'] === `${side} landing ${suffix}`).props;
const change = (suffix, value, side) => field(suffix, side).onChange({ target: { value } });
const options = (props) => nodes(props.children).filter(({ type }) => type === 'option')
  .map(({ props }) => ({ value: props.value, label: props.children, disabled: props.disabled }));

beforeEach(() => {
  vi.clearAllMocks();
  slots = [];
  effects = [];
  selectedId = 'wall-2';
  state = { ...createInitialElevationState(null), rooms: [structuredClone(K)], activeRoomId: K.id };
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
    if (!slots[index] || deps.some((value, i) => value !== slots[index][i])) effects.push(effect);
    slots[index] = deps;
  });
});

describe('WL1 d: landing properties', () => {
  it('anchor 3: names the host ends and keeps wall-reference options', () => {
    state.rooms[0].walls.push(wall({
      id: 'reference', x1: -90, y1: 13.5, x2: -90, y2: 60,
      landings: { start: { wallId: 'wall-3', side: 'back', ref: 'left', to: 'near', offset: 33.5 }, end: null },
    }));
    expect(options(field('measured from'))).toEqual([
      { value: 'left', label: 'Wall 4 corner' },
      { value: 'right', label: 'Free end' },
      { value: 'reference', label: 'Wall 5' },
    ]);
    expect(options(field('moves'))).toEqual([
      { value: 'landed', label: 'Wall 2' },
      { value: 'host', label: 'Wall 3', disabled: false },
    ]);
    expect(field('moves').value).toBe('landed');
  });

  it('anchor 4: choosing Wall 3 and committing 26 dispatches a host move', () => {
    change('moves', 'host');
    expect(dispatch).not.toHaveBeenCalled();
    field('distance').onCommit(26);
    expect(dispatch).toHaveBeenLastCalledWith(setWallLanding({
      wallId: 'wall-2', endpoint: 'end', offset: 26, move: 'host',
    }));
    expect(state.rooms[0].walls[2].x1).toBe(-12.5);
  });

  it('anchor 5: a wall reference disables the host and falls back to Wall 2', () => {
    state.rooms[0].walls.push(wall({
      id: 'reference', x1: -90, y1: 13.5, x2: -90, y2: 60,
      landings: { start: { wallId: 'wall-3', side: 'back', ref: 'left', to: 'near', offset: 33.5 }, end: null },
    }));
    change('moves', 'host');
    change('measured from', 'reference');
    expect(field('moves').value).toBe('landed');
    expect(options(field('moves'))[1]).toEqual({ value: 'host', label: 'Wall 3', disabled: true });
    field('distance').onCommit(26);
    expect(dispatch).toHaveBeenLastCalledWith(setWallLanding({
      wallId: 'wall-2', endpoint: 'end', offset: 26, move: 'landed',
    }));
    change('measured from', 'right');
    expect(field('moves').value).toBe('landed');
  });

  it('keeps Moves independent for each landed endpoint', () => {
    state.rooms[0].walls[1].landings.start = {
      wallId: 'wall-1', side: 'front', ref: 'right', to: 'near', offset: 0,
    };
    change('moves', 'host');
    expect(field('moves', 'right').value).toBe('host');
    expect(field('moves', 'left').value).toBe('landed');
    field('distance', 'left').onCommit(0);
    expect(dispatch).toHaveBeenLastCalledWith(setWallLanding({
      wallId: 'wall-2', endpoint: 'start', offset: 0, move: 'landed',
    }));
  });

  it('resets Moves when selecting another wall, including on return', () => {
    change('moves', 'host');
    expect(field('moves').value).toBe('host');
    selectedId = 'wall-3';
    render();
    selectedId = 'wall-2';
    render();
    expect(field('moves').value).toBe('landed');
  });
});
