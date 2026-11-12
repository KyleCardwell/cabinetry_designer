import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { findLeaf } from '../../model/cellTree.js';
import { syncRoom, resolveWall } from '../../model/room.js';
import { runScene } from '../../model/runScene.js';
import { CABINET_STYLE_IDS } from '../../model/styles.js';
import elevationReducer, { setColumnStep } from '../../store/elevationSlice.js';
import { auto, run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import StepEndsSection from '../properties/StepEndsSection.jsx';
import OverrideInput from '../OverrideInput.jsx';
import InchInput from '../InchInput.jsx';

vi.mock('react', async (original) => ({ ...await original(),
  useMemo: (fn) => fn(), useState: vi.fn(), useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

let state;
const room = () => state.rooms[0];
const run = () => room().walls[0].runs[0];
const base = { wallId: 'wall-1', runId: 'run-1' };
const leaf = (id = 'A') => findLeaf(run().grid, id);
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : typeof tree === 'string' ? tree : text(tree?.props?.children ?? []);
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);

function props(id = 'A') {
  const wall = resolveWall(room(), room().walls[0]);
  const scene = runScene(room(), wall, run(), state.settings);
  return { room: room(), wall, run: run(), item: leaf(id), settings: state.settings,
    piece: scene.cells.pieces.find((piece) => piece.id === id), layout: scene.result, cells: scene.cells };
}
const section = (id) => StepEndsSection(props(id));
const pick = (side, value, id) => field(section(id), `${side} step end`).props.onChange({ target: { value } });
const panels = () => props().cells.pieces.filter((piece) => piece.step);
const step = (itemId, edge, value) => dispatch(setColumnStep({ ...base, itemId, edge, value }));
const inputProps = (id = 'A', side = 'Right') => {
  const override = field(section(id), `${side} step end return width`);
  return OverrideInput(override.props).props.children('border-gray-600').props;
};
const typeWidth = (value) => {
  useState.mockReturnValueOnce([value, vi.fn()]);
  InchInput(inputProps()).props.onBlur();
};

beforeEach(() => {
  vi.clearAllMocks();
  useDispatch.mockReturnValue(dispatch);
  useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
  state = stateWithRun(makeRun({ width: 90, autoCount: false, seamGap: 0,
    style: { cabinetStyleId: CABINET_STYLE_IDS.INSET },
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [auto('A'), { ...auto('B'), top: { value: 2, source: 'manual' } }, auto('C')],
  }));
  state.settings.runFlex = 0;
  state.rooms[0] = syncRoom(room(), state.settings);
});

describe('step ends properties (ST3)', () => {

  it('commits inch widths, Panel and None, clears to Return and rejects invalid widths without moving boxes', () => {
    const boxes = props().cells.pieces.filter((piece) => piece.kind === 'cabinet');
    typeWidth('8 1/2');
    expect(leaf().stepEnds).toEqual({ right: { type: 'return', width: 8.5 } });
    expect(run()._stepEnds[0].width).toBe(8.5);
    expect(InchInput(inputProps()).props.value).toBe('8 1/2');
    expect(field(section(), 'Right step end').props.className).toContain('text-gray-100');
    const before = state;
    for (const value of ['-1', '0', 'garbage']) typeWidth(value);
    for (const value of [0, -1, NaN, Infinity]) {
      expect(field(section(), 'Right step end return width').props.onChange(value)).toBe(false);
    }
    expect(state).toBe(before);
    typeWidth('');
    expect(leaf()).not.toHaveProperty('stepEnds');
    expect(InchInput(inputProps()).props.value).toBe('');
    pick('Right', 'panel');
    expect(leaf().stepEnds.right).toEqual({ type: 'panel' });
    expect(panels()).toMatchObject([{ id: 'A:step-right-top', x: 30.25, z: 32.5, height: 2 }]);
    expect(field(section(), 'Right step end return width')).toBeUndefined();
    expect(props().cells.pieces.filter((piece) => piece.kind === 'cabinet')).toEqual(boxes);
    pick('Right', 'none');
    expect(leaf().stepEnds.right).toBe('none');
    expect(panels()).toHaveLength(0);
    expect(run()._stepEnds.some((entry) => entry.leafId === 'A')).toBe(false);
    expect(field(section(), 'Right step end').props.value).toBe('none');
    pick('Right', '');
    expect(leaf()).not.toHaveProperty('stepEnds');
    expect(run()._stepEnds[0].choice).toBe('return');
  });

});
