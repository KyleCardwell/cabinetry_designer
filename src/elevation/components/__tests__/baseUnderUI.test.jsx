import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { findLeaf, setGridPanelType } from '../../model/cellTree.js';
import { runScene } from '../../model/runScene.js';
import elevationReducer from '../../store/elevationSlice.js';
import { run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import CellKindSection from '../properties/CellKindSection.jsx';

vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

let state;
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const run = () => wall().runs[0];
const leaf = (id = 'opening') => findLeaf(run().grid, id);
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : typeof tree === 'string' ? tree : text(tree?.props?.children ?? []);
const checkbox = (tree) => nodes(tree).find(({ type, props }) => type === 'input' && props.type === 'checkbox');

function setup(kind, nested = false, upper = false) {
  const opening = { id: 'opening', kind };
  if (kind === 'shelves') opening.shelves = { count: 1, back: false };
  const cabinet = { id: 'drawer', kind: 'cabinet' };
  const stack = {
    id: 'column', cols: [{ id: 'col', size: null, sizeMode: 'auto' }],
    rows: [{ id: 'top', size: 4, sizeMode: 'manual' }, { id: 'bottom', size: null, sizeMode: 'auto' }],
    cells: [upper ? opening : cabinet, upper ? cabinet : opening].map((node, row) => ({
      col: 0, row, colSpan: 1, rowSpan: 1, node,
    })),
  };
  state = stateWithRun(makeRun({
    width: 60, autoCount: false,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [
      nested ? { id: 'column', kind: 'cabinet', width: 30, grid: stack } : { ...opening, width: 30 },
      { id: 'neighbor', kind: 'cabinet', width: null },
    ],
  }));
  if (kind === 'panel') run().grid = setGridPanelType(run().grid, 'opening', 'back', 0.75);
}

function render(piecePatch = {}) {
  const scene = runScene(room(), wall(), run(), state.settings);
  const piece = scene.cells.pieces.find(({ id }) => id === 'opening');
  return CellKindSection({ wall: wall(), run: run(), piece: { ...piece, ...piecePatch }, item: leaf() });
}

beforeEach(() => {
  vi.clearAllMocks();
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

describe('Step 512 Base runs under the opening', () => {
  for (const kind of ['void', 'panel']) {
    for (const nested of [false, true]) {
      it(`sets and removes the key on a ${nested ? 'nested' : 'root'} floor ${kind} leaf`, () => {
        setup(kind, nested);
        const before = state;
        const neighbor = leaf('neighbor');
        expect(text(render())).toContain('Base runs under the opening');
        expect(checkbox(render()).props.checked).toBe(false);
        checkbox(render()).props.onChange({ target: { checked: true } });
        expect(dispatch).toHaveBeenLastCalledWith({
          type: 'elevation/setCellBaseUnder',
          payload: { wallId: wall().id, runId: run().id, cellId: 'opening', baseUnder: true },
        });
        expect(leaf().baseUnder).toBe(true);
        expect(checkbox(render()).props.checked).toBe(true);
        expect(findLeaf(before.rooms[0].walls[0].runs[0].grid, 'opening')).not.toHaveProperty('baseUnder');
        checkbox(render()).props.onChange({ target: { checked: false } });
        expect(leaf()).not.toHaveProperty('baseUnder');
        expect(checkbox(render()).props.checked).toBe(false);
        expect(leaf('neighbor')).toEqual(neighbor);
      });
    }

    it(`hides the control for a ${kind} above the run bottom even with a stored override`, () => {
      setup(kind, true, true);
      leaf().baseUnder = true;
      expect(checkbox(render())).toBeUndefined();
      expect(text(render())).not.toContain('Base runs under the opening');
      expect(leaf().baseUnder).toBe(true);
      expect(dispatch).not.toHaveBeenCalled();
    });
  }

  it('hides the control for cabinets, shelves, side panels and top panels at the bottom', () => {
    for (const kind of ['cabinet', 'shelves']) {
      setup(kind);
      expect(checkbox(render())).toBeUndefined();
    }
    for (const type of ['side', 'top']) {
      setup('panel', type === 'top');
      if (type === 'top') {
        // Leave the drawer automatic so the bottom panel keeps its thickness.
        Object.assign(run().grid.cells[0].node.rows[0], { size: null, sizeMode: 'auto' });
      }
      run().grid = setGridPanelType(run().grid, 'opening', type, 0.75);
      leaf().baseUnder = true;
      expect(nodes(render()).find(({ props }) => props['aria-label'] === 'Panel type').props.value).toBe(type);
      expect(checkbox(render())).toBeUndefined();
    }
  });

  it('uses the floor-opening tolerance relative to the run bottom', () => {
    setup('void');
    expect(checkbox(render({ z: run().z + 0.0000005 }))).toBeDefined();
    expect(checkbox(render({ z: run().z + 0.00001 }))).toBeUndefined();
    expect(checkbox(render({ z: run().z - 1 }))).toBeUndefined();
  });
});
