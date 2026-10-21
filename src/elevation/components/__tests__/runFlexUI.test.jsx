import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useDispatch, useSelector } from 'react-redux';
import elevationReducer, { setRunHoldWidth } from '../../store/elevationSlice.js';
import { run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import { resolveWall, syncRoom } from '../../model/room.js';
import RunGeometrySection from '../properties/RunGeometrySection.jsx';
import WallHeightProperties from '../properties/WallHeightProperties.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
  useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

let state;
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const room = () => state.rooms[0];
const wall = () => resolveWall(room(), room().walls[0], 'front');
const run = () => wall().runs[0];
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object'
    ? [tree, ...nodes(tree.props?.label), ...nodes(tree.props?.children)] : [];
const runTree = () => RunGeometrySection({
  wall: wall(), run: run(), settings: state.settings,
  actionBase: { wallId: 'wall-1', runId: 'run-1' }, validateAndDispatch: vi.fn(),
});
const wallTree = () => WallHeightProperties({ room: room(), wall: wall(), plan: true });
const markup = (tree) => renderToStaticMarkup(tree);
const checkbox = () => nodes(runTree()).find(({ props }) => props['aria-label'] === 'Hold run width');
const hold = (checked) => checkbox().props.onChange({ target: { checked } });

function setup({ island = false, panelWidth = null, runFlex = 0.25 } = {}) {
  state = stateWithRun(makeRun({
    x: island ? 0 : 24, width: 90,
    ends: {
      left: { type: 'end_panel', width: panelWidth },
      right: { type: 'end_panel', width: panelWidth },
    },
    anchors: { left: island, right: island },
  }));
  state.settings.runFlex = runFlex;
  if (island) Object.assign(room().walls[0], {
    x2: 90, thickness: 0,
    endPanels: { start: { width: null }, end: { width: null } },
  });
  state.rooms[0] = syncRoom(room(), state.settings);
}

beforeEach(() => {
  vi.clearAllMocks();
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  setup();
});

describe('SPEC-RF4 step a run flex controls and planned readouts', () => {
  it('shows Planned 90 → 90 1/8 for a free run with 13/16-inch end panels, with hold off', () => {
    expect(run().width).toBe(90.125);
    expect(markup(runTree())).toContain('Planned 90 → 90 1/8');
    expect(checkbox().props).toMatchObject({ type: 'checkbox', checked: false });
    expect(markup(runTree())).toContain('Keep this run exactly as drawn; the boxes take any change.');
  });

  it('dispatches hold width, returns to 90 with no readout, and restores flex when cleared', () => {
    hold(true);
    expect(dispatch).toHaveBeenLastCalledWith(setRunHoldWidth({
      wallId: 'wall-1', runId: 'run-1', hold: true,
    }));
    expect(run()).toMatchObject({ holdWidth: true, width: 90 });
    expect(checkbox().props.checked).toBe(true);
    expect(markup(runTree())).not.toContain('Planned');
    hold(false);
    expect(run().holdWidth).not.toBe(true);
    expect(run().width).toBe(90.125);
    expect(markup(runTree())).toContain('Planned 90 → 90 1/8');
  });

  it('omits the readout with 3/4-inch panels or flex that does not change the width', () => {
    setup({ panelWidth: 0.75 });
    expect(run().flex).toBeUndefined();
    expect(markup(runTree())).not.toContain('Planned');
    expect(markup(wallTree())).not.toContain('Planned');
    room().walls[0].runs[0].flex = { left: -0.0625, right: 0.0625 };
    expect(markup(runTree())).not.toContain('Planned');
  });

  it('shows Planned 90 → built 90 1/8 under the island wall length', () => {
    setup({ island: true });
    expect(room().walls[0]._endFlex).toEqual({ start: 0.0625, end: 0.0625 });
    expect(wall().length).toBe(90);
    expect(markup(wallTree())).toContain('Planned 90 → built 90 1/8');
    hold(true);
    expect(markup(runTree())).not.toContain('Planned');
    expect(markup(wallTree())).not.toContain('Planned');
  });

  it('shows the checkbox but no run or wall readouts when runFlex is zero', () => {
    for (const island of [false, true]) {
      setup({ island, runFlex: 0 });
      expect(checkbox().props.checked).toBe(false);
      expect(markup(runTree())).not.toContain('Planned');
      expect(markup(wallTree())).not.toContain('Planned');
      hold(true);
      expect(run().holdWidth).toBe(true);
    }
  });
});
