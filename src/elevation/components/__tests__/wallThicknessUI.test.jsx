import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import elevationReducer, {
  addWallSegment, createInitialElevationState, setRoomSetting, setSetting,
} from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import OverrideInput from '../OverrideInput.jsx';
import OverrideField from '../OverrideField.jsx';
import WallHeightProperties from '../properties/WallHeightProperties.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const find = (tree, type) => nodes(tree).find((node) => node.type === type);
const tag = (tree) => nodes(tree).find(({ type, props }) => type === 'span' && props.className?.includes('text-[10px]'))?.props.children;
let state;
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const dispatch = (action) => { state = elevationReducer(state, action); return action; };

function render(label = 'Wall thickness') {
  const tree = WallHeightProperties({ room: room(), wall: wall(), plan: true });
  const override = nodes(tree).find(({ type, props }) => type === OverrideInput && props['aria-label'] === label);
  return OverrideField(OverrideInput(override.props).props);
}

function input(tree) {
  return InchInput(find(tree, InchInput).props);
}

// Keep the input's draft across change and blur while the real reducer applies edits.
function typeThickness(text) {
  const props = find(render(), InchInput).props;
  let draft;
  const draw = () => {
    useState.mockImplementationOnce((initial) => [draft ?? initial(), (value) => { draft = value; }]);
    return InchInput(props);
  };
  draw().props.onChange({ target: { value: text } });
  draw().props.onBlur();
  return render();
}

beforeEach(() => {
  vi.clearAllMocks();
  useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
  state = elevationReducer(createInitialElevationState(null), addWallSegment({ x1: 0, y1: 0, x2: 144, y2: 0 }));
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

describe('UI9e wall thickness override field', () => {
  it('inherits 4.5 with the Height source, types 6, and resets to inheritance (anchors 1–3)', () => {
    const inherited = render();
    expect(input(inherited).props).toMatchObject({ value: '', placeholder: '4 1/2' });
    expect(input(inherited).props.className).toContain('placeholder:text-gray-500');
    expect(inherited.props.title).toBe('Shop standard: 4 1/2"');
    expect(tag(inherited)).toBe(tag(render('Wall height')));
    expect(find(inherited, 'button')).toBeUndefined();

    const typed = typeThickness('6');
    expect(wall()).toMatchObject({ thicknessOverride: 6, thickness: 6 });
    expect(input(typed).props.value).toBe('6');
    expect(input(typed).props.className).toContain('text-gray-100');
    expect(input(typed).props.className).toContain('border-teal-500');
    expect(typed.props.title).toBe('Wall override · Shop standard: 4 1/2"');
    expect(find(typed, 'button').props['aria-label']).toBe('Reset Thickness');
    find(typed, 'button').props.onClick();

    expect(wall()).toMatchObject({ thicknessOverride: null, thickness: 4.5 });
    expect(input(render()).props).toMatchObject({ value: '', placeholder: '4 1/2' });
    expect(input(render()).props.className).toContain('border-gray-600');
    expect(find(render(), 'button')).toBeUndefined();
  });

  it('uses the resolved room thickness and reports its source (anchor 4)', () => {
    dispatch(setSetting({ key: 'wallThickness', value: 6 }));
    expect(input(render()).props.placeholder).toBe('6');
    expect(tag(render())).toBe('shop');
    dispatch(setRoomSetting({ roomId: room().id, key: 'wallThickness', value: 5.5 }));
    const tree = render();
    expect(input(tree).props).toMatchObject({ value: '', placeholder: '5 1/2' });
    expect(input(tree).props.className).toContain('placeholder:text-gray-500');
    expect(tree.props.title).toBe('Room: 5 1/2"');
    expect(tag(tree)).toBe('room');
    expect(find(tree, 'button')).toBeUndefined();
    expect(wall()).toMatchObject({ thicknessOverride: null, thickness: 5.5 });
  });

  it('keeps a typed zero bright and makes the wall an island back (anchor 5)', () => {
    const tree = typeThickness('0');
    expect(wall()).toMatchObject({ thicknessOverride: 0, thickness: 0 });
    expect(input(tree).props.value).toBe('0');
    expect(input(tree).props.className).toContain('text-gray-100');
    expect(input(tree).props.className).toContain('border-teal-500');
    expect(find(tree, 'button').props['aria-label']).toBe('Reset Thickness');
  });
});
