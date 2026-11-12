import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { legShape } from '../../model/__tests__/fixtures/legs.js';
import { partNumbers } from '../../model/partNumbers.js';
import elevationReducer, { createInitialElevationState } from '../../store/elevationSlice.js';
import EndFields from './EndFields.jsx';
import EndLegsFields from './EndLegsFields.jsx';
import LegFields, { LegHeightFields, LegPanelFields, LegShapeSelect, LegSitsOnSelect } from './LegFields.jsx';
import LegRow from './LegRow.jsx';
import RunEndsSection from './RunEndsSection.jsx';
import ExtendFields from './ExtendFields.jsx';
import PartStyleFields from './PartStyleFields.jsx';

vi.mock('react', async (load) => ({ ...await load(), useMemo: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

const settings = { ...DEFAULT_SETTINGS, shapes: [legShape()] };
const at = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
const expanded = [EndFields, EndLegsFields, LegFields, LegPanelFields, LegShapeSelect, LegHeightFields, LegSitsOnSelect];
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object'
    ? [tree, ...nodes(expanded.includes(tree.type) ? tree.type(tree.props) : tree.props?.children)] : [];
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const change = (node, value) => node.props.onChange({ target: { value } });
const tick = (node, checked) => node.props.onChange({ target: { checked } });
let state;
let dispatch;
const currentRun = () => state.rooms[0].walls[0].runs[0];
const props = (side = 'left') => ({ room: state.rooms[0], wall: state.rooms[0].walls[0], run: currentRun(),
  settings: state.settings, actionBase: at, side });
const legs = (side) => EndLegsFields(props(side));
const selectLegs = (value, side = 'left') => change(field(legs(side), `${side === 'left' ? 'Left' : 'Right'} end Legs`), value);
const selectFit = (value, side = 'left') => change(field(legs(side), `${side === 'left' ? 'Left' : 'Right'} end Fit`), value);

beforeEach(() => {
  vi.clearAllMocks();
  state = createInitialElevationState({ settings, rooms: [room({ walls: [wall({ runs: [run({ x: 10, width: 36,
    ends: { left: { type: 'end_panel' }, right: { type: 'end_panel' } },
  })] })] })], activeRoomId: at.roomId, activeWallId: at.wallId });
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  useDispatch.mockReturnValue(dispatch);
  useMemo.mockImplementation((fn) => fn());
});

describe('run end legs (SH7.5)', () => {
  it('writes Returns Both and depth 4, with blanks following settings and invalid numbers refused', () => {
    selectLegs('both');
    selectFit('between');
    change(field(legs(), 'Left end Returns'), 'both');
    field(legs(), 'Left end Return depth').props.onCommit(4);
    expect(currentRun().endLegs.left.panel).toEqual({ returns: 'both', returnDepth: 4 });
    for (const [name, key, placeholder] of [['Reveal', 'inset', 'legPanelReveal'],
      ['Top clearance', 'top', 'legPanelTopClearance'], ['Bottom clearance', 'bottom', 'legPanelBottomClearance'],
      ['Return depth', 'returnDepth', 'legPanelReturnDepth']]) {
      const input = () => field(legs(), `Left end ${name}`);
      expect(input().props.allowBlank).toBe(true);
      const setting = input().props.placeholder;
      expect(setting).toBeDefined();
      const customSettings = { ...state.settings, [placeholder]: 7 };
      expect(field(EndLegsFields({ ...props(), settings: customSettings }), `Left end ${name}`).props.placeholder).toBe('7');
      const before = currentRun().endLegs.left.panel;
      for (const value of [NaN, Infinity, -1, ...(key === 'returnDepth' ? [0] : [])]) {
        expect(input().props.onCommit(value)).toBe(false);
        expect(currentRun().endLegs.left.panel).toEqual(before);
      }
      input().props.onCommit(key === 'returnDepth' ? 4 : 0);
      expect(currentRun().endLegs.left.panel[key]).toBe(key === 'returnDepth' ? 4 : 0);
      input().props.onCommit(undefined);
      expect(currentRun().endLegs.left.panel).not.toHaveProperty(key);
      expect(input().props.placeholder).toBe(setting);
    }
    field(legs(), 'Left end Return depth').props.onCommit(4);
    change(field(legs(), 'Left end Returns'), '');
    expect(currentRun().endLegs.left).not.toHaveProperty('panel');
    expect(field(legs(), 'Left end Return depth')).toBeUndefined();
    tick(field(legs(), 'Left end Full depth'), true);
    expect(currentRun().endLegs.left.panel).toEqual({ past: true });
    tick(field(legs(), 'Left end Full depth'), false);
    expect(currentRun().endLegs.left).not.toHaveProperty('panel');
  });

});
