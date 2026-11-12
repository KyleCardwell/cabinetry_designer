import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch } from 'react-redux';
import { auto, room, wall, run as makeRun } from '../../../test/builders.js';
import elevationReducer, { setTrackSize } from '../../store/elevationSlice.js';
import { stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import EndFields from '../properties/EndFields.jsx';
import InchInput from '../InchInput.jsx';

vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));
vi.mock('react', async (original) => ({ ...await original(), useMemo: (compute) => compute() }));

let state;
const currentRoom = () => state.rooms[0];
const currentWall = () => currentRoom().walls[0];
const run = () => currentWall().runs[0];
const at = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children) : tree == null || typeof tree === 'boolean' ? '' : String(tree);
const fields = (side = 'left') => nodes(EndFields({
  room: currentRoom(), wall: currentWall(), run: run(), side,
  settings: state.settings, actionBase: at,
}));
const field = (name, side = 'left') => fields(side).find(({ props }) => props['aria-label'] === `${side} end ${name}`);
const pick = (name, value, side = 'left') => field(name, side).props.onChange({ target: { value } });
const commit = (name, value) => field(name).props.onCommit(value);
const corner = (kind = 90) => pick('type', `corner:${kind}`);

beforeEach(() => {
  vi.clearAllMocks();
  state = {
    ...stateWithRun(),
    rooms: [room({ name: 'Room A', walls: [
      wall({ runs: [makeRun({ autoCount: false, items: [auto('cc'), auto('a')],
        style: { cabinetStyleId: 13 }, anchors: { left: true, right: false },
      })], connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }),
      wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
        connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
      }),
    ] })],
  };
  useDispatch.mockReturnValue(dispatch);
});

describe('CC3 step d corner run end fields', () => {

  it('anchor 3: creates a 45 corner and a manual 36-inch root column', () => {
    corner(45);
    expect(run().ends.left).toEqual({ type: 'corner', width: null, corner: {
      kind: 45, legB: null, depthB: null, returnPiece: 'auto', returnWidth: null, doors: null, legBFace: null,
    } });
    expect(run().grid.cols[0]).toMatchObject({ sizeMode: 'manual', size: 36 });
    expect(field('type').props.value).toBe('corner:45');
  });

  it('anchor 5: edits leg A through its outer root track and resets blank to 36', () => {
    corner();
    expect(field('corner leg A').type).toBe(InchInput);
    expect(field('corner leg A').props.value).toBe(36);
    const trackId = run().grid.cols[0].id;
    commit('corner leg A', 30);
    expect(dispatch).toHaveBeenLastCalledWith(setTrackSize({ ...at, trackId, size: 30 }));
    expect(run().grid.cols[0]).toMatchObject({ sizeMode: 'manual', size: 30 });
    expect(field('corner leg A').props.value).toBe(30);
    commit('corner leg A', null);
    expect(run().grid.cols[0]).toMatchObject({ sizeMode: 'manual', size: 36 });
  });

  it('anchor 6: shows automatic leg B and depth B and stores or clears their overrides', () => {
    corner();
    expect(field('corner leg B').props).toMatchObject({ value: null, placeholder: '36', allowAuto: true, allowBlank: true });
    expect(field('corner depth B').props).toMatchObject({ value: null, placeholder: '24', allowAuto: true, allowBlank: true });
    commit('corner leg B', 30);
    commit('corner depth B', 15);
    expect(run().ends.left.corner).toMatchObject({ kind: 90, legB: 30, depthB: 15 });
    expect(field('corner leg B').props.value).toBe(30);
    expect(field('corner depth B').props.value).toBe(15);
    commit('corner leg B', null);
    commit('corner depth B', null);
    expect(run().ends.left.corner).toMatchObject({ legB: null, depthB: null });
    commit('corner leg A', 32);
    expect(field('corner leg B').props.placeholder).toBe('32');
  });

});

