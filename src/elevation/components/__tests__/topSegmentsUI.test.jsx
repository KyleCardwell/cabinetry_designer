import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { runScene } from '../../model/runScene.js';
import { toElevationDocument } from '../../store/persistence.js';
import elevationReducer from '../../store/elevationSlice.js';
import { fixed, run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import InchInput from '../InchInput.jsx';
import AddTopSegmentButton from '../properties/AddTopSegmentButton.jsx';
import RunTopSegmentsSection from '../properties/RunTopSegmentsSection.jsx';
import TopSegmentRow from '../properties/TopSegmentRow.jsx';

vi.mock('react', async (original) => ({ ...await original(),
  useMemo: (fn) => fn(), useState: vi.fn(), useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

let state;
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const run = () => wall().runs[0];
const dispatch = vi.fn((action) => { state = structuredClone(elevationReducer(state, action)); });
const props = () => ({ room: room(), wall: wall(), run: run(), settings: state.settings });
const scene = () => runScene(room(), wall(), run(), state.settings);
const piece = (id = 'B') => scene().cells.pieces.find((candidate) => candidate.id === id);
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : text(tree?.props?.children ?? []);
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const options = (tree) => nodes(tree).filter(({ type }) => type === 'option');
const expandRows = (tree) => {
  if (Array.isArray(tree)) return tree.map(expandRows);
  if (!tree || typeof tree !== 'object') return tree;
  if (tree.type === TopSegmentRow) return expandRows(TopSegmentRow(tree.props));
  return { ...tree, props: { ...tree.props, children: expandRows(tree.props.children) } };
};
const render = (extra = {}) => expandRows(RunTopSegmentsSection({ ...props(), ...extra }));
const addButton = (extra = {}) => AddTopSegmentButton({ ...props(), piece: piece(), ...extra });
const add = () => addButton().props.onClick();
const change = (label, value) => field(render(), label).props.onChange({ target: { value } });
const typeDrop = (value) => {
  useState.mockReturnValueOnce([value, vi.fn()]);
  InchInput(field(render(), 'Segment 1 Drop').props).props.onBlur();
};

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(makeRun({ width: 90, z: 4, height: 30.5, top: 'stone',
    style: { cabinetStyleId: 13 }, autoCount: false,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: ['A', 'B', 'C'].map((id) => fixed(id, 30)),
  }));
  state.settings.runFlex = 0;
  useDispatch.mockReturnValue(dispatch);
  useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
});

describe('top segment properties (ST4)', () => {

  it('edits endpoints, kind and inch drops, rejects invalid drops and preserves box mode', () => {
    add();
    change('Segment 1 From', 'C');
    change('Segment 1 To', 'A');
    expect(run().topSegments[0]).toMatchObject({ from: 'C', to: 'A' });
    expect(addButton()).toBeNull();
    expect(field(render({ piece: piece() }), 'Segment 1 From').props.value).toBe('C');
    expect(options(field(render(), 'Segment 1 Kind')).map(text)).toEqual(['Wood', 'Stone']);
    change('Segment 1 Kind', 'stone');
    typeDrop('2 1/2');
    expect(run().topSegments[0]).toMatchObject({ kind: 'stone', drop: 2.5, mode: 'box' });
    expect(piece().height).toBe(28);
    const before = structuredClone(run().topSegments);
    for (const value of [0, -1, null, NaN, Infinity]) {
      expect(field(render(), 'Segment 1 Drop').props.onCommit(value)).toBe(false);
    }
    for (const value of ['', '0', '-1', 'garbage']) typeDrop(value);
    expect(run().topSegments).toEqual(before);
    expect(nodes(render()).filter(({ type }) => type === 'select').map(({ props }) => props['aria-label']))
      .toEqual(['Segment 1 From', 'Segment 1 To', 'Segment 1 Kind', 'Segment 1 Mode']);
    expect(toElevationDocument(state).rooms[0].walls[0].runs[0].topSegments).toEqual(before);
    field(render(), 'Remove top segment 1').props.onClick();
    expect(run().topSegments).toEqual([]);
    expect(addButton()).not.toBeNull();
  });

});
