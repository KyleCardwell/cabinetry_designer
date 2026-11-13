import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { newSectionProfile } from '../../../elevation/model/sectionProfiles.js';
import { deleteProfileSegment } from '../../../elevation/model/profileEditing.js';
import ProfileCanvas from '../ProfileCanvas.jsx';
import ProfileEditor from '../ProfileEditor.jsx';
import SegmentPanel from '../SegmentPanel.jsx';
import CoordInput from '../CoordInput.jsx';
import useProfileDraft from '../useProfileDraft.js';
import { toScreen } from '../profileView.js';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useRef: vi.fn(),
  useEffect: vi.fn(), useImperativeHandle: vi.fn(), useCallback: (callback) => callback }));
vi.mock('react-redux', () => ({ useDispatch: () => vi.fn(), useSelector: vi.fn() }));
vi.mock('../useProfileDraft.js', () => ({ default: vi.fn() }));
vi.mock('../../../elevation/canvas/measureState.js', () => ({ useMeasure: () => ({}) }));

const profile = newSectionProfile([], 'square');
const size = { width: 800, height: 600 };
const view = { cx: 1.5, cy: 1.5, scale: 100 };
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const button = (tree, label) => nodes(tree).find((node) => node.type === 'button' && node.props.children === label);
const svg = (tree) => nodes(tree).find((node) => node.type === 'svg').props;
let states;
let refs;
let stateIndex;
let refIndex;
let handler;
let onApply;
let onSelect;
let onMessage;

function render(component, props) {
  stateIndex = 0;
  refIndex = 0;
  return component(props);
}
const canvas = (tool) => render(ProfileCanvas.render, { profile, grid: 1 / 16, selection: null,
  tool, onApply, onSelect, onMessage });
const pointer = (xy) => {
  const [clientX, clientY] = toScreen(view, size, xy);
  return { clientX, clientY, button: 0, pointerId: 1, preventDefault: vi.fn(), target: {},
    currentTarget: { setPointerCapture: vi.fn(), hasPointerCapture: () => false } };
};
function click(tree, xy) {
  svg(tree).onPointerDown(pointer(xy));
  svg(tree).onPointerUp(pointer(xy));
}
const press = (key, target = {}) => {
  const event = { key, target, preventDefault: vi.fn() };
  handler(event);
  return event;
};
function editor() {
  useEffect.mockClear();
  const tree = render(ProfileEditor, { profileId: profile.id, onClose: vi.fn() });
  useEffect.mock.lastCall[0]();
  return tree;
}

beforeEach(() => {
  vi.clearAllMocks();
  states = [];
  refs = [];
  onApply = vi.fn((next) => next !== null);
  onSelect = vi.fn();
  onMessage = vi.fn();
  useState.mockImplementation((initial) => {
    const i = stateIndex++;
    if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
    return [states[i], (value) => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
  });
  useRef.mockImplementation((initial) => {
    const i = refIndex++;
    return refs[i] ??= { current: initial };
  });
  useSelector.mockImplementation((selector) => selector({ elevation: { settings: {
    defaultProfile: { toeKickHeight: 4 }, sectionProfiles: [profile] } } }));
  useProfileDraft.mockReturnValue({ draft: profile, apply: onApply, undo: vi.fn(), redo: vi.fn(), dirty: false });
  vi.stubGlobal('window', { addEventListener: (_, callback) => { handler = callback; }, removeEventListener: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe('drawing helper controls (SH2)', () => {
  it('rectangle picks snap to points and the grid, reject a zero side, and clear pending picks on Escape', () => {
    states = [size, view];
    refs = [{ current: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } }];
    click(canvas('rect'), [0.02, 0.02]);
    click(canvas('rect'), [1.02, 1.02]);
    const [next] = onApply.mock.lastCall;
    expect(next.geometry.loops[1].segs[0].from).toBe('p1');
    expect(next.geometry.points.p6).toEqual([1, 1]);
    expect(onSelect).not.toHaveBeenCalled();
    click(canvas('rect'), [2, 2]);
    click(canvas('rect'), [2, 3]);
    expect(onApply).toHaveBeenLastCalledWith(null, 'A rectangle needs a width and a height.');
    click(canvas('rect'), [2, 2]);
    canvas('rect');
    const handle = useImperativeHandle.mock.lastCall[1]();
    expect(handle.cancelLine()).toBe(true);
    click(canvas('rect'), [3, 3]);
    expect(onApply).toHaveBeenCalledTimes(2);
  });

  it('circle accepts a snapped perimeter pick or typed radius in the readout, refusing tiny radii', () => {
    states = [size, view];
    refs = [{ current: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } }];
    click(canvas('circle'), [1.51, 1.51]);
    click(canvas('circle'), [2.125, 1.5]);
    expect(onApply.mock.lastCall[0].geometry.points.p5).toEqual([2.125, 1.5]);
    expect(onApply.mock.lastCall[0].geometry.loops[1].segs.every((segment) => segment.type === 'arc' && segment.ccw)).toBe(true);
    click(canvas('circle'), [1.5, 1.5]);
    const radius = nodes(canvas('circle')).find((node) => node.type === CoordInput);
    expect(radius.props['aria-label']).toBe('Circle radius');
    expect(radius.props.onCommit(1 / 256)).toBe(false);
    expect(onApply.mock.lastCall[0]).toBeNull();
    expect(radius.props.onCommit(0.625)).toBe(true);
    expect(onApply.mock.lastCall[0].geometry.points.p6).toEqual([0.875, 1.5]);
    expect(nodes(canvas('circle')).some((node) => node.type === CoordInput)).toBe(false);
  });

});
