import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch } from 'react-redux';
import { room, wall, run as makeRun } from '../../../test/builders.js';
import elevationReducer, { setRunEnd } from '../../store/elevationSlice.js';
import { stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import EndFields from '../properties/EndFields.jsx';
import InchInput from '../InchInput.jsx';

vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

let state;
const currentRoom = () => state.rooms[0];
const currentWall = () => currentRoom().walls[0];
const run = () => currentWall().runs[0];
const at = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const fields = (side) => nodes(EndFields({
  room: currentRoom(), wall: currentWall(), run: run(), side,
  settings: state.settings, actionBase: at,
}));
const field = (side, name) => fields(side).find(({ props }) => props['aria-label'] === `${side} end ${name}`);
const pick = (side, name, value) => field(side, name).props.onChange({ target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  state = {
    ...stateWithRun(),
    rooms: [room({ walls: [wall({ runs: [makeRun({
      ends: { left: { type: 'filler', width: 3 }, right: { type: 'end_panel', width: null } },
    })] })] })],
  };
  useDispatch.mockReturnValue(dispatch);
});

describe('DR2 step b end height select', () => {
  it('selects each type default with inherited styling on either end', () => {
    for (const side of ['left', 'right']) {
      for (const [type, height] of [['filler', 'cabinets'], ['end_panel', 'full']]) {
        pick(side, 'type', type);
        const select = field(side, 'height');
        expect(select.props.value).toBe(height);
        expect(select.props.className).toContain('text-gray-500');
        expect(select.props.className).toContain('border-gray-600');
        expect(select.props.className).not.toContain('border-teal-500');
        expect(nodes(select).filter(({ type }) => type === 'option').map(({ props }) => [props.value, props.children]))
          .toEqual([['full', 'Full height'], ['cabinets', 'Match cabinets']]);
        expect(run().ends[side]).not.toHaveProperty('height');
      }
    }
  });

  it('stores overrides, keeps width edits independent, and clears the key when picking the default', () => {
    for (const side of ['left', 'right']) {
      const type = run().ends[side].type;
      const defaultHeight = type === 'filler' ? 'cabinets' : 'full';
      const override = type === 'filler' ? 'full' : 'cabinets';
      const width = run().ends[side].width;
      const other = side === 'left' ? 'right' : 'left';
      const otherEnd = structuredClone(run().ends[other]);
      pick(side, 'height', override);
      expect(dispatch).toHaveBeenLastCalledWith(setRunEnd({
        ...at, side, end: { type, width, height: override },
      }));
      expect(run().ends[side]).toMatchObject({ type, width, height: override });
      expect(field(side, 'height').props.value).toBe(override);
      expect(field(side, 'height').props.className).toContain('border-teal-500');
      expect(field(side, 'height').props.className).toContain('text-gray-100');
      const widthInput = field(side, 'width');
      expect(widthInput.type).toBe(InchInput);
      widthInput.props.onCommit(2);
      expect(run().ends[side]).toMatchObject({ width: 2, height: override });
      pick(side, 'height', defaultHeight);
      expect(run().ends[side]).not.toHaveProperty('height');
      expect(run().ends[side].width).toBe(2);
      expect(field(side, 'height').props.value).toBe(defaultHeight);
      expect(field(side, 'height').props.className).toContain('text-gray-500');
      expect(field(side, 'height').props.className).not.toContain('border-teal-500');
      expect(run().ends[other]).toEqual(otherEnd);
    }
  });

  it('hides Height for blind and none and clears stored height on type changes', () => {
    for (const side of ['left', 'right']) {
      for (const type of ['end_panel', 'filler', 'blind', 'none']) {
        const sourceType = type === 'filler' ? 'end_panel' : 'filler';
        pick(side, 'type', sourceType);
        pick(side, 'height', sourceType === 'filler' ? 'full' : 'cabinets');
        expect(run().ends[side]).toHaveProperty('height');
        pick(side, 'type', type);
        expect(run().ends[side]).not.toHaveProperty('height');
        if (type === 'blind' || type === 'none') expect(field(side, 'height')).toBeUndefined();
        else expect(field(side, 'height').props.value).toBe(type === 'filler' ? 'cabinets' : 'full');
      }
    }
  });
});
