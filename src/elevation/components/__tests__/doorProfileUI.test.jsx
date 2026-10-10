import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReducer, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Rect } from 'react-konva';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../../model/doorStyles.js';
import DoorDetails from '../DoorDetails.jsx';
import DoorProfilePickers from '../DoorProfilePickers.jsx';
import DoorSectionView from '../DoorSectionView.jsx';
import DoorStyleFields from '../DoorStyleFields.jsx';
import InchInput from '../InchInput.jsx';
import PartStyleFields from '../properties/PartStyleFields.jsx';
import KindPanel from '../../../library/profileEditor/KindPanel.jsx';
import ProfileCanvas from '../../../library/profileEditor/ProfileCanvas.jsx';
import ProfileEditor from '../../../library/profileEditor/ProfileEditor.jsx';
import useProfileDraft from '../../../library/profileEditor/useProfileDraft.js';

// Inspect component output and invoke its UI callbacks without a browser or canvas runtime.
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal(),
  useState: vi.fn(),
  useReducer: vi.fn(),
  useEffect: vi.fn(),
  useImperativeHandle: vi.fn(),
  useCallback: (callback) => callback,
  useRef: (current) => ({ current }),
  useId: () => 'test-mask',
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-konva', () => ({ Rect: 'rect', Text: 'text' }));

const line = (from, to) => ({ type: 'line', from, to });
const bead = {
  id: 'bead', name: 'Bead', kind: 'door_outside', version: 1, archived: false,
  drawnPoints: { elevation: ['a'] },
  geometry: {
    units: 'in', points: { a: [-0.3125, 0], b: [0, 0], c: [0, -0.8125], d: [-0.3125, -0.8125] },
    loops: [{ id: 'L1', closed: true, segs: [line('a', 'b'), line('b', 'c'), line('c', 'd'), line('d', 'a')] }],
  },
};
const round = {
  ...bead,
  geometry: {
    units: 'in', points: { a: [0.25, 0], b: [0, -0.25], c: [0, -0.8125] },
    loops: [{ id: 'L1', closed: false, segs: [
      { type: 'arc', from: 'a', to: 'b', center: [0.25, -0.25], ccw: true }, line('b', 'c'),
    ] }],
  },
};
const dispatch = vi.fn();
let settings;

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
const find = (tree, predicate) => nodes(tree).find(predicate);
const text = (tree) => {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  return tree?.props ? text(tree.props.children) : '';
};
const kindPanel = (profile, onApply) => KindPanel({ profile, onApply });
const checkbox = (tree) => find(tree, ({ props }) => props.type === 'checkbox');
const stretchInput = (tree) => find(tree, ({ type, props }) => type === InchInput && props['aria-label'] === 'Stretch line');

beforeEach(() => {
  vi.clearAllMocks();
  settings = { sectionProfiles: [bead] };
  useSelector.mockImplementation((selector) => selector({ elevation: { settings } }));
  useDispatch.mockReturnValue(dispatch);
  useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
  useReducer.mockImplementation((reducer, initial, init) => [init(initial), vi.fn()]);
});

describe('Step 463 profile UI', () => {
  it('places the profile pickers beneath the section in the sticky column', () => {
    const tree = DoorStyleFields({ draft: DEFAULT_DOOR_STYLE, designs: DOOR_DESIGNS, setDraft: vi.fn() });
    const [left, right] = tree.props.children;
    expect(find(left, ({ type }) => type === DoorProfilePickers)).toBeUndefined();
    expect(right.props.className).toContain('md:sticky');
    const sectionIndex = nodes(right).findIndex(({ type }) => type === DoorSectionView);
    const pickerIndex = nodes(right).findIndex(({ type }) => type === DoorProfilePickers);
    expect(sectionIndex).toBeGreaterThan(-1);
    expect(pickerIndex).toBeGreaterThan(sectionIndex);
  });

  it('hides covered openings while preserving profile lines and ordinary openings', () => {
    const part = {
      key: 'part', x: 0, z: 0, width: 15, height: 30,
      openings: [{ x: 3, z: 3, width: 9, height: 24 }],
      lines: [{ x: 1, z: 1, width: 13, height: 28 }],
    };
    const render = (openingsShown, showDetails = true) => nodes(DoorDetails({
      parts: [{ ...part, openingsShown }], warnings: [], showDetails, showTags: false,
      transform: { scale: 10, offsetX: 0, offsetY: 0, wallHeight: 40 },
    })).filter(({ type }) => type === Rect);
    expect(render(false).map(({ props }) => props.stroke)).toEqual(['#cbd5e1']);
    expect(render(true)).toHaveLength(2);
    expect(render(undefined)).toHaveLength(2);
    expect(render(false, false)).toHaveLength(0);
  });

  it('uses the outside profile overhang for displayed part openings and the short-face rule', () => {
    const style = { ...DEFAULT_DOOR_STYLE, profiles: { ...DEFAULT_DOOR_STYLE.profiles, outside: bead.id } };
    settings = { sectionProfiles: [bead], teamDoorStyle: style };
    const render = (height) => PartStyleFields({
      room: {}, settings, partType: 'door', levels: [], part: {}, width: 15, height, label: 'Door', onChange: vi.fn(),
    });
    expect(text(render(30))).toContain('Panel 8 3/8" × 23 3/8"');
    expect(text(render(5))).toContain('Slab');
  });

  it('offers stretch only for the four door kinds and defaults to rounded half depth', () => {
    for (const kind of ['door_outside', 'door_inside', 'door_panel', 'applied_molding']) {
      const onApply = vi.fn(() => true);
      const tree = kindPanel({ ...bead, kind }, onApply);
      expect(checkbox(tree).props.checked).toBe(false);
      expect(stretchInput(tree)).toBeUndefined();
      checkbox(tree).props.onChange({ target: { checked: true } });
      expect(onApply.mock.calls[0][0].stretch).toEqual({ y: -0.375 });
    }
    for (const kind of ['crown', 'top_mold', 'furniture_base', 'toe_kick', 'nosing', 'other']) {
      expect(checkbox(kindPanel({ ...bead, kind }, vi.fn()))).toBeUndefined();
    }
  });

  it('commits valid typed stretch lines and refuses arc crossings and top/bottom values', () => {
    const onApply = vi.fn((next) => next !== null);
    const shallowArc = { ...round, geometry: { ...round.geometry, points: { a: [0.25, 0], b: [0, -0.25] }, loops: [{ ...round.geometry.loops[0], segs: [round.geometry.loops[0].segs[0]] }] } };
    checkbox(kindPanel(shallowArc, onApply)).props.onChange({ target: { checked: true } });
    expect(onApply).toHaveBeenLastCalledWith(null, "The stretch line can't cross an arc or sit on the shape's top or bottom.");
    onApply.mockClear();
    const tree = kindPanel({ ...round, stretch: { y: -0.5 } }, onApply);
    const input = stretchInput(tree);
    expect(input.props.value).toBe(-0.5);
    expect(input.props.onCommit(-0.625)).toBe(true);
    expect(onApply.mock.calls[0][0].stretch).toEqual({ y: -0.625 });
    for (const y of [-0.125, -0.25, 0, -0.8125]) {
      expect(input.props.onCommit(y)).toBe(false);
      expect(onApply).toHaveBeenLastCalledWith(null, "The stretch line can't cross an arc or sit on the shape's top or bottom.");
    }
    checkbox(tree).props.onChange({ target: { checked: false } });
    expect(onApply.mock.lastCall[0]).not.toHaveProperty('stretch');
  });

  it('draws the stretch line dashed across the current canvas view', () => {
    const render = (profile) => {
      useState.mockReturnValueOnce([{ width: 800, height: 400 }, vi.fn()]);
      useState.mockReturnValueOnce([{ cx: 0, cy: 0, scale: 100 }, vi.fn()]);
      return ProfileCanvas.render({ profile, grid: 1 / 16, selection: null, tool: 'select' }, null);
    };
    const stretch = find(render({ ...bead, stretch: { y: -0.25 } }), ({ props }) => props['aria-label'] === 'Stretch line');
    expect(stretch.props).toMatchObject({ x1: 0, x2: 800, y1: 225, y2: 225, strokeDasharray: '6 4', pointerEvents: 'none' });
    expect(find(render(bead), ({ props }) => props['aria-label'] === 'Stretch line')).toBeUndefined();
  });

  it('shows the slot-specific shrink warning, even if the section cannot be drawn', () => {
    settings.sectionProfiles = [{ ...bead, kind: 'door_inside', stretch: { y: -0.375 } }];
    const style = { ...DEFAULT_DOOR_STYLE, profiles: { ...DEFAULT_DOOR_STYLE.profiles, inside: bead.id } };
    for (const thickness of [0.8125, 0.5]) {
      const tree = DoorSectionView({ style: { ...style, thickness }, design: DOOR_DESIGNS[0] });
      expect(text(tree)).toContain("Inside profile can't shrink to this thickness — shown unstretched");
    }
  });

  it('marks stretch-only edits dirty and supports undo and redo', () => {
    let state;
    useReducer.mockImplementation((reducer, initial, init) => {
      state ??= init(initial);
      return [state, (action) => { state = reducer(state, action); }];
    });
    const render = () => useProfileDraft(bead);
    const draft = render();
    expect(draft.dirty).toBe(false);
    draft.apply({ ...bead, stretch: { y: -0.25 } });
    expect(render()).toMatchObject({ dirty: true, canUndo: true });
    render().undo();
    expect(render()).toMatchObject({ dirty: false, canRedo: true });
    render().redo();
    expect(render()).toMatchObject({ dirty: true, draft: { stretch: { y: -0.25 } } });
  });

  it('saves stretch additions, changes and removals, including a change to a non-door kind', () => {
    for (const [saved, draft] of [
      [bead, { ...bead, stretch: { y: -0.25 } }],
      [{ ...bead, stretch: { y: -0.25 } }, { ...bead, stretch: { y: -0.5 } }],
      [{ ...bead, stretch: { y: -0.25 } }, bead],
      [{ ...bead, stretch: { y: -0.25 } }, { ...bead, kind: 'crown' }],
    ]) {
      settings.sectionProfiles = [saved];
      useReducer.mockReturnValueOnce([{ draft, past: [saved], future: [] }, vi.fn()]);
      const tree = ProfileEditor({ profileId: bead.id, backLabel: 'Back', onClose: vi.fn() });
      const save = find(tree, ({ type, props }) => type === 'button' && props.children === 'Save');
      expect(save.props.disabled).toBe(false);
      save.props.onClick();
      expect(dispatch.mock.lastCall[0].payload.profile).toEqual(draft);
    }
  });
});
