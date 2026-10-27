import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { auto, room, run as makeRun, wall as makeWall } from '../../../test/builders.js';
import { columnLayoutOf, findCell } from '../../model/cellTree.js';
import { runItems } from '../../model/grid.js';
import { runScene } from '../../model/runScene.js';
import elevationReducer, {
  applyColumnToRun, createInitialElevationState, pasteColumn, removeCell, removeColumn,
  setClipboard, splitCell,
} from '../../store/elevationSlice.js';
import PanelTabs from '../panel/PanelTabs.jsx';
import CabinetProperties from '../properties/CabinetProperties.jsx';
import CellProperties from '../properties/CellProperties.jsx';
import CellSplitSection from '../properties/CellSplitSection.jsx';
import ColumnActionsSection from '../properties/ColumnActionsSection.jsx';

vi.mock('react', async (original) => ({
  ...await original(), useState: vi.fn(), useEffect: vi.fn(), useRef: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

let state, copied, timer;
const currentRoom = () => state.rooms[0];
const wall = () => currentRoom().walls[0];
const run = () => wall().runs[0];
const at = { wallId: 'wall-1', runId: 'run-1' };
const dispatch = vi.fn((action) => { state = structuredClone(elevationReducer(state, action)); });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const button = (tree, label) => nodes(tree).find(({ type, props }) => type === 'button' && props.children === label);
const section = (cellId = 'a') => ColumnActionsSection({ wall: wall(), run: run(), cellId });
function size(Component, id = 'a') {
  const scene = runScene(currentRoom(), wall(), run(), state.settings);
  const tree = Component({ room: currentRoom(), wall: wall(), run: run(), settings: state.settings,
    piece: scene.cells.pieces.find((piece) => piece.id === id),
    item: runItems(run()).find((item) => item.id === id) ?? findCell(run().grid, id).cell.node,
    layout: scene.result, cells: scene.cells });
  return nodes(tree).find(({ type }) => type === PanelTabs).props.children('size');
}
const columnSection = (tree) => {
  const element = nodes(tree).find(({ type }) => type === ColumnActionsSection);
  return ColumnActionsSection(element.props);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  copied = false;
  timer = { current: null };
  useState.mockImplementation(() => [copied, (value) => { copied = value; }]);
  useRef.mockReturnValue(timer);
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  state = createInitialElevationState();
  state.rooms = [room({ walls: [makeWall({ runs: [makeRun({ width: 90, autoCount: false,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [auto('a'), auto('b'), auto('c')] })] })] })];
  state.activeRoomId = 'room-1';
  state.activeWallId = 'wall-1';
});

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('DR1 column actions', () => {
  it('adds the root Column section, copies a detached layout and shows Copied for 1.5 seconds', () => {
    const tree = size(CabinetProperties);
    expect(button(tree, 'Remove')).toBeUndefined();
    expect(nodes(tree).find(({ type }) => type === CellSplitSection).props.removable).toBeUndefined();
    const actions = columnSection(tree);
    expect(actions.props).toMatchObject({ id: 'piece.column', title: 'Column' });
    expect(button(actions, 'Remove column').props.className).toContain('bg-red-900/70');
    button(actions, 'Copy column').props.onClick();
    expect(dispatch).toHaveBeenLastCalledWith(setClipboard({ kind: 'columnLayout', data: columnLayoutOf(run().grid, 'a') }));
    expect(state.clipboard.data.node).not.toBe(run().grid.cells[0].node);
    expect(button(section(), 'Copied')).toBeDefined();
    vi.advanceTimersByTime(1499);
    expect(button(section(), 'Copied')).toBeDefined();
    // A second click restarts the feedback period.
    button(section(), 'Copied').props.onClick();
    vi.advanceTimersByTime(1499);
    expect(button(section(), 'Copied')).toBeDefined();
    vi.advanceTimersByTime(1);
    expect(button(section(), 'Copy column')).toBeDefined();
    button(section(), 'Copy column').props.onClick();
    const cleanup = useEffect.mock.calls.at(-1)[0]();
    expect(button(section(), 'Copy column')).toBeDefined();
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows Paste only for column layouts and hides Paste and Apply for unsupported root kinds', () => {
    for (const kind of [null, 'cabinet', 'midLayout']) {
      state.clipboard = kind ? { kind, data: {} } : null;
      expect(button(section(), 'Paste column')).toBeUndefined();
      expect(button(section(), 'Apply to all columns')).toBeDefined();
    }
    dispatch(setClipboard({ kind: 'columnLayout', data: columnLayoutOf(run().grid, 'a') }));
    expect(button(section(), 'Paste column')).toBeDefined();
    for (const kind of ['filler', 'panel', 'void', 'shelves']) {
      run().grid.cells[1].node.kind = kind;
      if (kind === 'shelves') run().grid.cells[1].node.shelves = { count: 2, back: false };
      const actions = columnSection(size(CellProperties, 'b'));
      expect(button(actions, 'Paste column')).toBeUndefined();
      expect(button(actions, 'Apply to all columns')).toBeUndefined();
      expect(nodes(actions).filter(({ type }) => type === 'button').map(({ props }) => props.children)).toContain('Copy column');
      expect(button(actions, 'Remove column')).toBeDefined();
    }
  });

  it('copies the whole root from a deeply nested leaf and wires paste and apply to that column', () => {
    dispatch(splitCell({ ...at, cellId: 'a', direction: 'down', count: 2 }));
    dispatch(splitCell({ ...at, cellId: 'a', direction: 'across', count: 2 }));
    const rootId = run().grid.cells[0].node.id;
    // A non-cabinet nested leaf still acts on its targetable nested-grid root.
    findCell(run().grid, 'a').cell.node.kind = 'void';
    const nested = () => columnSection(size(CellProperties));
    expect(nested().props.title).toBe('Column');
    expect(button(nested(), 'Apply to all columns')).toBeDefined();
    button(nested(), 'Copy column').props.onClick();
    expect(state.clipboard.data).toEqual(columnLayoutOf(run().grid, rootId));
    const clipboard = structuredClone(state.clipboard);
    button(columnSection(size(CabinetProperties, 'b')), 'Paste column').props.onClick();
    expect(dispatch).toHaveBeenLastCalledWith(pasteColumn({ ...at, cellId: 'b' }));
    expect(run().grid.cells[1].node.cells).toHaveLength(2);
    button(nested(), 'Apply to all columns').props.onClick();
    expect(dispatch).toHaveBeenLastCalledWith(applyColumnToRun({ ...at, cellId: rootId }));
    expect(run().grid.cells[2].node.cells).toHaveLength(2);
    expect(state.clipboard).toEqual(clipboard);
  });

  it('keeps Remove cell in nested Split and removes the whole column from either Size panel', () => {
    button(columnSection(size(CabinetProperties, 'c')), 'Remove column').props.onClick();
    expect(dispatch).toHaveBeenLastCalledWith(removeColumn({ ...at, cellId: 'c' }));
    expect(runItems(run()).map(({ id }) => id)).toEqual(['a', 'b']);
    dispatch(splitCell({ ...at, cellId: 'a', direction: 'down', count: 3 }));
    const rootId = run().grid.cells[0].node.id;
    const tree = size(CellProperties);
    const split = nodes(tree).find(({ type }) => type === CellSplitSection);
    useState.mockReturnValueOnce([2, vi.fn()]);
    button(CellSplitSection(split.props), 'Remove cell').props.onClick();
    expect(dispatch).toHaveBeenLastCalledWith(removeCell({ ...at, cellId: 'a' }));
    expect(run().grid.cols).toHaveLength(2);
    const siblingId = run().grid.cells[0].node.cells[0].node.id;
    state.selection = { ...state.selection, ...at, pieceId: siblingId };
    button(columnSection(size(CellProperties, siblingId)), 'Remove column').props.onClick();
    expect(dispatch).toHaveBeenLastCalledWith(removeColumn({ ...at, cellId: rootId }));
    expect(runItems(run()).map(({ id }) => id)).toEqual(['b']);
    expect(run().autoCount).toBe(false);
    expect(state.selection.pieceId).toBeNull();
  });
});
