import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { legShape, noEnds } from '../../model/__tests__/fixtures/legs.js';
import { partNumbers } from '../../model/partNumbers.js';
import { wallEndPanels } from '../../model/wallEndPanels.js';
import elevationReducer, { createInitialElevationState } from '../../store/elevationSlice.js';
import EndLegsFields from './EndLegsFields.jsx';
import LegFields, { LegHeightFields, LegPanelFields, LegShapeSelect, LegSitsOnSelect } from './LegFields.jsx';
import RunLegsSection from './RunLegsSection.jsx';
import WallEndLegsFields from './WallEndLegsFields.jsx';
import WallEndPanelFields from './WallEndPanelFields.jsx';
import WallEndPanelProperties from './WallEndPanelProperties.jsx';
import WallHeightProperties from './WallHeightProperties.jsx';

vi.mock('react', async (load) => ({ ...await load(), useMemo: (fn) => fn(), useEffect: vi.fn(),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const settings = { ...DEFAULT_SETTINGS, shapes: [legShape()] };
const expanded = [LegFields, LegHeightFields, LegPanelFields, LegShapeSelect, LegSitsOnSelect];
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object'
    ? [tree, ...nodes(expanded.includes(tree.type) ? tree.type(tree.props) : tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object'
    ? text(expanded.includes(tree.type) ? tree.type(tree.props) : tree.props?.children) : tree ?? '';
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const change = (node, value) => node.props.onChange({ target: { value } });
let state;
let dispatch;
const currentRoom = () => state.rooms[0];
const currentWall = () => currentRoom().walls[0];
const props = (endpoint = 'start') => ({ room: currentRoom(), wall: currentWall(), endpoint,
  label: endpoint === 'start' ? 'Left end' : 'Right end', settings: state.settings });
const render = (endpoint) => WallEndLegsFields(props(endpoint));
const selectLegs = (value, face = 'front') => change(field(render(), `Left end ${face}-face Legs`), value);

beforeEach(() => {
  vi.clearAllMocks();
  state = createInitialElevationState({ settings, rooms: [room({ walls: [wall({ id: 'w', x2: 96, thickness: 4.5,
    endPanels: { start: { width: null } }, runs: [run({ width: 36, anchors: { left: true, right: false }, ends: noEnds })],
  })] })], activeRoomId: 'room-1', activeWallId: 'w' });
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

describe('SH7.6 step g wall end panel fit', () => {
  it('uses settings for blank panel values and refuses invalid dimensions', () => {
    selectLegs('both');
    change(field(render(), 'Left end Fit'), 'between');
    state = { ...state, settings: { ...state.settings, legPanelReveal: 0.5, legPanelTopClearance: 1,
      legPanelBottomClearance: 1.5, legPanelReturnDepth: 5 } };
    change(field(render(), 'Left end panel Returns'), 'both');
    for (const [name, key, placeholder] of [
      ['Reveal', 'inset', '1/2'], ['Top clearance', 'top', '1'],
      ['Bottom clearance', 'bottom', '1 1/2'], ['Return depth', 'returnDepth', '5'],
    ]) {
      expect(field(render(), `Left end panel ${name}`).props.placeholder).toBe(placeholder);
      field(render(), `Left end panel ${name}`).props.onCommit(2);
      expect(currentWall().endLegs.start.panel[key]).toBe(2);
      for (const value of [-1, NaN, Infinity]) {
        expect(field(render(), `Left end panel ${name}`).props.onCommit(value)).toBe(false);
      }
      field(render(), `Left end panel ${name}`).props.onCommit(undefined);
      expect(currentWall().endLegs.start.panel).not.toHaveProperty(key);
      expect(field(render(), `Left end panel ${name}`).props.value).toBeUndefined();
    }
    expect(field(render(), 'Left end panel Return depth').props.onCommit(0)).toBe(false);
    expect(currentWall().endLegs.start.panel).toEqual({ returns: 'both' });
  });

});
