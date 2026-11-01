import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useDispatch, useSelector } from 'react-redux';
import elevationReducer, { setItemWidth, setRunWidthFrom } from '../../store/elevationSlice.js';
import { auto, fixed, run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import { resolveWall, syncRoom } from '../../model/room.js';
import RunGeometrySection from '../properties/RunGeometrySection.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
  useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

// LL6 d: Run width / From cabinets in the run's Geometry section.

let state;
const at = { wallId: 'wall-1', runId: 'run-1' };
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const room = () => state.rooms[0];
const wall = () => resolveWall(room(), room().walls[0], 'front');
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object'
    ? [tree, ...nodes(tree.props?.label), ...nodes(tree.props?.children)] : [];
const tree = () => RunGeometrySection({
  room: room(), wall: wall(), run: wall().runs[0], settings: state.settings,
  actionBase: at, validateAndDispatch: vi.fn(),
});
const button = (text) => nodes(tree()).find(({ type, props }) => type === 'button' && props.children === text);

function setup(items) {
  state = stateWithRun(makeRun({
    width: 80, autoCount: false, anchors: { left: true, right: false },
    ends: { left: { type: 'filler', width: null }, right: { type: 'none', width: null } },
    items,
  }));
  state.settings.runFlex = 0;
  state.rooms[0] = syncRoom(room(), state.settings);
}

beforeEach(() => {
  vi.clearAllMocks();
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  setup([fixed('A', 30), auto('B')]);
});

describe('LL6 d run width mode', () => {
  it('anchor 1: From cabinets is pressed and the width is tagged once the last width is typed', () => {
    dispatch(setItemWidth({ ...at, itemId: 'B', width: 24 }));
    expect(button('From cabinets').props['aria-pressed']).toBe(true);
    expect(button('Run width').props['aria-pressed']).toBe(false);
    const html = renderToStaticMarkup(tree());
    expect(html).toContain('from cabinets');
    expect(html).not.toContain('is paused');
  });

  it('anchor 2: with an auto cabinet Run width is pressed and From cabinets is disabled', () => {
    expect(button('Run width').props['aria-pressed']).toBe(true);
    expect(button('From cabinets').props.disabled).toBe(true);
    expect(button('From cabinets').props.title).toBe('Every cabinet needs a typed width first.');
  });

  it('anchor 3: a flagged run with an auto cabinet shows the paused note', () => {
    dispatch(setItemWidth({ ...at, itemId: 'B', width: 24 }));
    dispatch(setItemWidth({ ...at, itemId: 'B', width: null }));
    expect(button('From cabinets').props['aria-pressed']).toBe(true);
    const html = renderToStaticMarkup(tree());
    expect(html).toContain('From cabinets is paused: every cabinet needs a width.');
    expect(html).not.toContain('from cabinets</span>');
  });

  it('anchor 4: Run width dispatches null', () => {
    dispatch(setItemWidth({ ...at, itemId: 'B', width: 24 }));
    dispatch.mockClear();
    button('Run width').props.onClick();
    expect(dispatch).toHaveBeenCalledWith(setRunWidthFrom({ ...at, value: null }));
    expect(state.rooms[0].walls[0].runs[0].widthFrom).toBeUndefined();
  });

  it('anchor 5: From cabinets dispatches cells for an all-typed run', () => {
    setup([fixed('A', 30), fixed('B', 24)]);
    expect(button('From cabinets').props.disabled).toBe(false);
    button('From cabinets').props.onClick();
    expect(dispatch).toHaveBeenCalledWith(setRunWidthFrom({ ...at, value: 'cells' }));
    expect(state.rooms[0].walls[0].runs[0]).toMatchObject({ widthFrom: 'cells', width: 55.5 });
  });
});
