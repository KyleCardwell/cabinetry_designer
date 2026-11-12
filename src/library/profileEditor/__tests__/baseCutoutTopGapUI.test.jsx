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

});
