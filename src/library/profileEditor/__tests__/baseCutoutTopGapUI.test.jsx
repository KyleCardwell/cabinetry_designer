import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useReducer, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import InchInput from '../../../elevation/components/InchInput.jsx';
import { PROFILE_KINDS } from '../../../elevation/model/sectionProfiles.js';
import KindPanel from '../KindPanel.jsx';
import ProfileCanvas from '../ProfileCanvas.jsx';
import ProfileEditor from '../ProfileEditor.jsx';
import { toModel, toScreen } from '../profileView.js';

vi.mock('react', async (original) => ({
  ...await original(),
  useState: vi.fn(), useReducer: vi.fn(), useEffect: vi.fn(), useImperativeHandle: vi.fn(),
  useCallback: (callback) => callback, useRef: (current) => ({ current }),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const cut1 = {
  id: 'cut1', name: 'Cutout cove', kind: 'base_cutout', version: 1, archived: false,
  drawnPoints: { elevation: [] },
  geometry: { units: 'in', points: { a: [0, 0], b: [1.5, 1.5] },
    loops: [{ id: 'L1', closed: false,
      segs: [{ type: 'arc', from: 'a', to: 'b', center: [0, 1.5], ccw: true }] }],
  },
};
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : text(tree?.props?.children ?? []);
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const checkbox = (tree) => nodes(tree).find(({ type, props }) => type === 'input' && props.type === 'checkbox');
const GAP_LABEL = 'Cutout top below base top';
const CHECK_LABEL = 'Keep a set distance below the top of the base';
const size = { width: 800, height: 600 };
const view = { cx: 1, cy: 2, scale: 100 };
const dispatch = vi.fn();
let settings;

function canvas(profile, preview = null) {
  useEffect.mockClear();
  const setView = vi.fn();
  useState.mockReturnValueOnce([size, vi.fn()])
    .mockReturnValueOnce([view, setView])
    .mockReturnValueOnce([null, vi.fn()])
    .mockReturnValueOnce([preview && { profile: preview }, vi.fn()]);
  return { tree: ProfileCanvas.render({ profile, grid: 1 / 16, selection: null, tool: 'select' }, null), setView };
}

beforeEach(() => {
  vi.clearAllMocks();
  settings = { defaultProfile: { toeKickHeight: 4 }, sectionProfiles: [cut1] };
  useSelector.mockImplementation((selector) => selector({ elevation: { settings } }));
  useDispatch.mockReturnValue(dispatch);
  useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
  useReducer.mockImplementation((reducer, initial, init) => [init(initial), vi.fn()]);
});

describe('Step 497.3 base cutout top gap controls', () => {
  it('enables 2.5 for h 1.5 on a team base of 4, edits to 2, and removes the key when off', () => {
    let profile = structuredClone(cut1);
    const panel = () => KindPanel({ profile, onApply: (next) => { profile = next; return true; } });
    expect(text(panel())).toContain(CHECK_LABEL);
    expect(checkbox(panel()).props.checked).toBe(false);
    expect(field(panel(), GAP_LABEL)).toBeUndefined();
    checkbox(panel()).props.onChange({ target: { checked: true } });
    expect(profile.topGap).toBe(2.5);
    expect(profile.geometry).toEqual(cut1.geometry);
    expect(checkbox(panel()).props.checked).toBe(true);
    expect(field(panel(), GAP_LABEL).props).toMatchObject({ value: 2.5, min: 1 / 16, displayStep: 1 / 16 });
    expect(text(panel())).toContain('The shape is drawn for a base this much taller than the cutout. On a taller base the shape moves up and straight legs run down to the floor.');
    let line = field(canvas(profile).tree, 'Base top line');
    expect(toModel(view, size, [0, line.props.y1])[1]).toBe(4);
    field(panel(), GAP_LABEL).props.onCommit(2);
    expect(profile.topGap).toBe(2);
    line = field(canvas(profile).tree, 'Base top line');
    expect(toModel(view, size, [0, line.props.y1])[1]).toBe(3.5);
    checkbox(panel()).props.onChange({ target: { checked: false } });
    expect(profile).toEqual(cut1);
    expect(profile).not.toHaveProperty('topGap');
    expect(field(panel(), GAP_LABEL)).toBeUndefined();
    expect(field(canvas(profile).tree, 'Base top line')).toBeUndefined();
  });

  it('uses the current team height, rounds to a sixteenth, and falls back to 2 for nonpositive gaps', () => {
    for (const [height, expected] of [[6, 4.5], [4.02, 2.5], [4.04, 2.5625], [1.5, 2], [1, 2], [1.51, 2], [undefined, 2.5]]) {
      settings.defaultProfile.toeKickHeight = height;
      const onApply = vi.fn();
      checkbox(KindPanel({ profile: cut1, onApply })).props.onChange({ target: { checked: true } });
      expect(onApply.mock.lastCall[0].topGap).toBe(expected);
    }
  });

  it('accepts fraction entry and a sixteenth, and rejects smaller or nonfinite gaps', () => {
    const onApply = vi.fn(() => true);
    const gap = field(KindPanel({ profile: { ...cut1, topGap: 2.5 }, onApply }), GAP_LABEL);
    useState.mockReturnValueOnce(['2 1/16', vi.fn()]);
    InchInput(gap.props).props.onBlur();
    expect(onApply.mock.lastCall[0].topGap).toBe(2.0625);
    gap.props.onCommit(1 / 16);
    expect(onApply.mock.lastCall[0].topGap).toBe(1 / 16);
    onApply.mockClear();
    for (const value of [0, -2, 1 / 32, NaN, Infinity, -Infinity]) {
      expect(gap.props.onCommit(value)).toBe(false);
    }
    useState.mockReturnValueOnce(['1/0', vi.fn()]);
    InchInput(gap.props).props.onBlur();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('offers the top gap checkbox only for Base cutout and removes it when changing kind', () => {
    for (const kind of Object.keys(PROFILE_KINDS).filter((kind) => kind !== 'base_cutout')) {
      const tree = KindPanel({ profile: { ...cut1, kind }, onApply: vi.fn() });
      expect(text(tree)).not.toContain(CHECK_LABEL);
      expect(field(tree, GAP_LABEL)).toBeUndefined();
      expect(field(canvas({ ...cut1, kind }).tree, 'Base top line')).toBeUndefined();
    }
    const onApply = vi.fn();
    const tree = KindPanel({ profile: { ...cut1, topGap: 2 }, onApply });
    field(tree, 'Kind').props.onChange({ target: { value: 'crown' } });
    expect(onApply.mock.lastCall[0]).toEqual({ ...cut1, kind: 'crown' });
  });

  it('falls back to 2 and omits the line for unreadable cutout shapes', () => {
    const unreadable = [
      { ...cut1, geometry: { units: 'in', points: {}, loops: [] } },
      { ...cut1, geometry: { units: 'in', points: { a: [1, 0], b: [1, 1.5] },
        loops: [{ id: 'L1', closed: false, segs: [{ type: 'line', from: 'a', to: 'b' }] }] } },
      { ...cut1, geometry: { ...cut1.geometry, loops: [{ ...cut1.geometry.loops[0], closed: true,
        segs: [...cut1.geometry.loops[0].segs, { type: 'line', from: 'b', to: 'a' }] }] } },
    ];
    for (const profile of unreadable) {
      const onApply = vi.fn();
      checkbox(KindPanel({ profile, onApply })).props.onChange({ target: { checked: true } });
      expect(onApply.mock.lastCall[0].topGap).toBe(2);
      expect(field(canvas({ ...profile, topGap: 2 }).tree, 'Base top line')).toBeUndefined();
    }
  });

  it('draws a grey dashed line across the view using the readable chain and live shape preview', () => {
    const reverse = { ...cut1, topGap: 2, geometry: { ...cut1.geometry,
      points: { ...cut1.geometry.points, unused: [50, 50] },
      loops: [{ ...cut1.geometry.loops[0], segs: [{ ...cut1.geometry.loops[0].segs[0], from: 'b', to: 'a', ccw: false }] }],
    } };
    expect(field(canvas(reverse).tree, 'Base top line').props).toMatchObject({
      x1: 0, x2: 800, y1: 150, y2: 150, stroke: '#9ca3af', strokeWidth: 1.5,
      strokeDasharray: '6 4', pointerEvents: 'none',
    });
    const preview = { ...cut1, topGap: 2, geometry: { units: 'in', points: { a: [0, 0], b: [1, 2] },
      loops: [{ id: 'L1', closed: false, segs: [{ type: 'line', from: 'a', to: 'b' }] }] } };
    expect(field(canvas({ ...cut1, topGap: 2 }, preview).tree, 'Base top line').props.y1).toBe(100);
  });

  it('includes the base top in Fit so the ghost line is visible above the cutout', () => {
    const profile = { ...cut1, topGap: 2.5 };
    const before = structuredClone(profile);
    const { setView } = canvas(profile);
    const fitEffect = useEffect.mock.calls.find(([, deps]) => deps?.[0] === profile && deps.length === 3)[0];
    fitEffect();
    const fitted = setView.mock.lastCall[0];
    const [, baseY] = toScreen(fitted, size, [0, 4]);
    const [, floorY] = toScreen(fitted, size, [0, 0]);
    expect(baseY).toBeGreaterThan(0);
    expect(baseY).toBeLessThan(floorY);
    expect(floorY).toBeLessThan(size.height);
    expect(profile).toEqual(before);
  });

  it('saves top gap additions, changes, removals, and a switch to another kind', () => {
    for (const [saved, draft] of [
      [cut1, { ...cut1, topGap: 2.5 }],
      [{ ...cut1, topGap: 2.5 }, { ...cut1, topGap: 2 }],
      [{ ...cut1, topGap: 2 }, cut1],
      [{ ...cut1, topGap: 2 }, { ...cut1, kind: 'crown' }],
    ]) {
      settings.sectionProfiles = [saved];
      useReducer.mockReturnValueOnce([{ draft, past: [saved], future: [] }, vi.fn()]);
      const tree = ProfileEditor({ profileId: saved.id, backLabel: 'Back', onClose: vi.fn() });
      const save = nodes(tree).find(({ type, props }) => type === 'button' && props.children === 'Save');
      expect(save.props.disabled).toBe(false);
      save.props.onClick();
      expect(dispatch.mock.lastCall[0].payload.profile).toEqual(draft);
    }
  });
});
