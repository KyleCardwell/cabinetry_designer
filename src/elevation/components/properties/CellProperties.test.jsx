import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { auto, room, run, wall } from '../../../test/builders.js';
import { findCell, runScene } from '../../model/index.js';
import elevationReducer, { createInitialElevationState } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import PanelTabs from '../panel/PanelTabs.jsx';
import Field from './Field.jsx';
import CellProperties from './CellProperties.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

let state;
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
function props() {
  const room = state.rooms[0];
  const wall = room.walls[0];
  const run = wall.runs[0];
  const scene = runScene(room, wall, run, state.settings);
  return { room, wall, run, settings: state.settings, layout: scene.result, cells: scene.cells,
    piece: scene.cells.pieces.find(({ id }) => id === 's'), item: findCell(run.grid, 's').cell.node };
}
const panel = () => nodes(CellProperties(props())).find(({ type }) => type === PanelTabs).props.children('inside');
const field = (label) => nodes(panel()).find(({ props }) => props['aria-label'] === label);
const input = (label) => InchInput(field(label).props);
const type = (label, value) => {
  useState.mockReturnValueOnce([value, vi.fn()]);
  input(label).props.onBlur();
};
const selectTop = (value) => field('Shelf top mode').props.onChange({ target: { value } });
const shelfPositions = () => {
  const { room, wall, run, settings, piece } = props();
  return runScene(room, wall, run, settings).shelves.filter(({ kind }) => kind === 'shelf')
    .map(({ z }) => z - piece.z);
};

beforeEach(() => {
  vi.clearAllMocks();
  useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
  useDispatch.mockReturnValue(dispatch);
  state = createInitialElevationState({ rooms: [room({ walls: [wall({ runs: [run({
    autoCount: false, z: 40, height: 48,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [{ ...auto('s'), kind: 'shelves', shelves: { back: false } }],
  })] })] })], activeRoomId: 'room-1', activeWallId: 'wall-1' });
});

describe('IN15a floating shelf placement panel', () => {
  it('shows the automatic 48-inch anchor and updates the panel and canvas for Bottom 4 / From top 0', () => {
    expect(props().piece.height).toBe(48);
    expect(nodes(panel()).filter(({ type }) => type === Field).map(({ props }) => props.label))
      .toEqual(['Count', 'Bottom', 'Top']);
    expect(input('Shelf count').props).toMatchObject({ value: '', placeholder: 'Auto (2)' });
    expect(input('Shelf bottom').props).toMatchObject({ value: '', placeholder: '15' });
    for (const label of ['Shelf count', 'Shelf bottom']) {
      expect(input(label).props.className).toContain('placeholder:text-gray-500');
    }
    expect(field('Shelf top mode').props.value).toBe('equal');
    expect(field('Shelf from top')).toBeUndefined();
    expect(text(panel())).toContain('Spacing 15"');
    expect(shelfPositions()).toEqual([15, 31.5]);

    type('Shelf bottom', '4');
    selectTop('from-top');
    expect(props().item.shelves).toEqual({ back: false, bottom: 4, top: 0 });
    expect(input('Shelf count').props).toMatchObject({ value: '', placeholder: 'Auto (4)' });
    expect(input('Shelf bottom').props.value).toBe('4');
    expect(input('Shelf bottom').props.className).toContain('text-gray-100');
    expect(input('Shelf from top').props.value).toBe('0');
    expect(text(panel())).toContain('Spacing 12 2/3"');
    const expected = [4, 18 + 1 / 6, 32 + 1 / 3, 46.5];
    shelfPositions().forEach((z, index) => expect(z).toBeCloseTo(expected[index], 10));
  });

  it('clears only Bottom with From top retained, then returns to the initial anchor when Top is Equal', () => {
    type('Shelf bottom', '4');
    selectTop('from-top');
    type('Shelf bottom', '');
    expect(props().item.shelves).toEqual({ back: false, top: 0 });
    expect(input('Shelf count').props).toMatchObject({ value: '', placeholder: 'Auto (3)' });
    expect(input('Shelf bottom').props).toMatchObject({ value: '', placeholder: '14 1/2' });
    expect(field('Shelf top mode').props.value).toBe('from-top');
    expect(text(panel())).toContain('Spacing 14 1/2"');
    expect(shelfPositions()).toEqual([14.5, 30.5, 46.5]);

    selectTop('equal');
    expect(props().item.shelves).toEqual({ back: false });
    expect(input('Shelf count').props).toMatchObject({ value: '', placeholder: 'Auto (2)' });
    expect(input('Shelf bottom').props).toMatchObject({ value: '', placeholder: '15' });
    expect(field('Shelf from top')).toBeUndefined();
    expect(text(panel())).toContain('Spacing 15"');
    expect(shelfPositions()).toEqual([15, 31.5]);
  });

  it('validates picks, clears typed counts, shows both warnings and retains the back panel control', () => {
    for (const value of ['0', '13', '2.5', '-1', 'garbage']) type('Shelf count', value);
    type('Shelf bottom', '-1');
    expect(dispatch).not.toHaveBeenCalled();
    type('Shelf count', '12');
    expect(input('Shelf count').props.value).toBe('12');
    type('Shelf count', '1');
    type('Shelf bottom', '10 1/2');
    selectTop('from-top');
    type('Shelf from top', '2 1/2');
    expect(props().item.shelves).toEqual({ back: false, count: 1, bottom: 10.5, top: 2.5 });
    const before = state;
    type('Shelf from top', '-1');
    type('Shelf from top', '');
    expect(state).toBe(before);
    expect(text(panel())).not.toContain('Spacing');
    expect(text(panel())).toContain('Top ignored with one shelf');
    expect(shelfPositions()).toEqual([10.5]);

    type('Shelf count', '4');
    type('Shelf bottom', '47');
    expect(text(panel())).toContain("Shelves don't fit");
    expect(shelfPositions()).toHaveLength(4);
    const back = nodes(panel()).find(({ type, props }) => type === 'input' && props.type === 'checkbox');
    expect(back.props.checked).toBe(false);
    back.props.onChange({ target: { checked: true } });
    expect(props().item.shelves.back).toBe(true);

    type('Shelf count', 'Auto');
    expect(props().item.shelves).not.toHaveProperty('count');
    type('Shelf count', '2');
    type('Shelf count', '');
    expect(props().item.shelves).not.toHaveProperty('count');
    expect(input('Shelf count').props.value).toBe('');
  });
});
