import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useReducer, useState } from 'react';
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
const { profiles: moldingFixtures } = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const tm3 = moldingFixtures.find(({ id }) => id === 'tm3');
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
  it('edits an applied molding profile while retaining offsets and later entries', () => {
    settings.sectionProfiles = [{ ...bead, kind: 'applied_molding' }];
    let draft = { ...DEFAULT_DOOR_STYLE, appliedMoldings: [
      { profileId: bead.id, offset: -0.5 }, { profileId: 'later', offset: 1 },
    ] };
    const render = (design = DOOR_DESIGNS[0]) => DoorProfilePickers({
      draft, design, setDraft: (update) => { draft = update(draft); },
    });
    const applied = (tree) => find(tree, ({ type, props }) => type === 'select' && props['aria-label'] === 'Applied molding 1 profile');
    expect(applied(render()).props.value).toBe(bead.id);
    expect(find(render(DOOR_DESIGNS[1]), ({ type }) => type === 'fieldset').props.disabled).toBe(true);
    applied(render()).props.onChange({ target: { value: '' } });
    expect(draft.appliedMoldings).toEqual([{ profileId: null, offset: -0.5 }, { profileId: 'later', offset: 1 }]);
    expect(applied(render()).props.value).toBe('');
    applied(render()).props.onChange({ target: { value: bead.id } });
    expect(draft.appliedMoldings).toEqual([{ profileId: bead.id, offset: -0.5 }, { profileId: 'later', offset: 1 }]);
    expect(draft.profiles).toEqual(DEFAULT_DOOR_STYLE.profiles);

  });

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

  it('offers thickness stretch for the four door kinds and defaults to the nearest valid sixteenth with deeper ties', () => {
    for (const kind of ['door_outside', 'door_inside', 'door_panel', 'applied_molding']) {
      const onApply = vi.fn(() => true);
      const tree = kindPanel({ ...bead, kind }, onApply);
      expect(checkbox(tree).props.checked).toBe(false);
      expect(stretchInput(tree)).toBeUndefined();
      checkbox(tree).props.onChange({ target: { checked: true } });
      expect(onApply.mock.calls[0][0].stretch).toEqual({ y: -0.4375 });
    }
    for (const kind of ['crown', 'furniture_base', 'toe_kick', 'nosing', 'other']) {
      expect(checkbox(kindPanel({ ...bead, kind }, vi.fn()))).toBeUndefined();
    }
    const onApply = vi.fn(() => true);
    const arcAtHalfDepth = { ...round, geometry: { ...round.geometry, points: { ...round.geometry.points, c: [0, -0.5] } } };
    checkbox(kindPanel(arcAtHalfDepth, onApply)).props.onChange({ target: { checked: true } });
    expect(onApply.mock.lastCall[0].stretch).toEqual({ y: -0.3125 });
  });

  it('accepts typed stretch lines and shows problems and a Save guard for arc crossings and out-of-range values', () => {
    const onApply = vi.fn((next) => next !== null);
    const shallowArc = { ...round, geometry: { ...round.geometry, points: { a: [0.25, 0], b: [0, -0.25] }, loops: [{ ...round.geometry.loops[0], segs: [round.geometry.loops[0].segs[0]] }] } };
    checkbox(kindPanel(shallowArc, onApply)).props.onChange({ target: { checked: true } });
    expect(onApply.mock.lastCall[0].stretch).toEqual({ y: -0.125 });
    expect(text(kindPanel(onApply.mock.lastCall[0], onApply))).toContain('The stretch line crosses an arc — move it before saving.');
    onApply.mockClear();
    const tree = kindPanel({ ...round, stretch: { y: -0.5 } }, onApply);
    const input = stretchInput(tree);
    expect(input.props.value).toBe(-0.5);
    expect(input.props.onCommit(-0.625)).toBe(true);
    expect(onApply.mock.calls[0][0].stretch).toEqual({ y: -0.625 });
    settings.sectionProfiles = [round];
    for (const y of [-0.625, -0.125, -0.25, 0, -0.8125, 0.25, -1]) {
      expect(input.props.onCommit(y)).toBe(true);
      const next = onApply.mock.lastCall[0];
      expect(next.stretch).toEqual({ y });
      const panel = kindPanel(next, onApply);
      const problemNote = find(panel, ({ type, props }) => type === 'p' && props.className === 'text-xs text-amber-300');
      if (y === -0.625) expect(problemNote).toBeUndefined();
      else expect(text(problemNote)).toBe(y > -0.8125 && y < 0
        ? 'The stretch line crosses an arc — move it before saving.'
        : "The stretch line has to sit between the shape's top and bottom — move it before saving.");
      useReducer.mockReturnValueOnce([{ draft: next, past: [round], future: [] }, vi.fn()]);
      const editor = ProfileEditor({ profileId: bead.id, backLabel: 'Back', onClose: vi.fn() });
      const save = find(editor, ({ type, props }) => type === 'button' && props.children === 'Save');
      expect(save.props.disabled).toBe(y !== -0.625);
      expect(text(editor).includes('Move the stretch line to save')).toBe(y !== -0.625);
      dispatch.mockClear();
      save.props.onClick();
      expect(dispatch).toHaveBeenCalledTimes(y === -0.625 ? 1 : 0);
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
    expect(stretch.props).toMatchObject({ x1: 0, x2: 800, y1: 225, y2: 225, stroke: '#fbbf24', strokeDasharray: '6 4', pointerEvents: 'none' });
    for (const profile of [{ ...round, stretch: { y: -0.125 } }, { ...bead, stretch: { y: 0 } }]) {
      expect(find(render(profile), ({ props }) => props['aria-label'] === 'Stretch line').props.stroke).toBe('#f87171');
    }
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

  it('guards Save for unchanged drafts and strict failures beyond stretch problems', () => {
    for (const draft of [bead, { ...bead, drawnPoints: { elevation: ['missing'] } }]) {
      useReducer.mockReturnValueOnce([{ draft, past: [], future: [] }, vi.fn()]);
      const tree = ProfileEditor({ profileId: bead.id, backLabel: 'Back', onClose: vi.fn() });
      const save = find(tree, ({ type, props }) => type === 'button' && props.children === 'Save');
      expect(save.props.disabled).toBe(true);
      expect(text(tree)).not.toContain('Move the stretch line to save');
      save.props.onClick();
      expect(dispatch).not.toHaveBeenCalled();
    }
  });

  it('validates the profile Save writes, retaining the saved metadata', () => {
    const draft = { ...bead, name: '', version: 0, stretch: { y: -0.25 } };
    for (const saved of [bead, { ...bead, name: '' }]) {
      settings.sectionProfiles = [saved];
      useReducer.mockReturnValueOnce([{ draft, past: [saved], future: [] }, vi.fn()]);
      const tree = ProfileEditor({ profileId: bead.id, backLabel: 'Back', onClose: vi.fn() });
      const save = find(tree, ({ type, props }) => type === 'button' && props.children === 'Save');
      expect(save.props.disabled).toBe(saved.name === '');
      dispatch.mockClear();
      save.props.onClick();
      if (saved.name === '') expect(dispatch).not.toHaveBeenCalled();
      else expect(dispatch.mock.lastCall[0].payload.profile).toEqual({ ...bead, stretch: { y: -0.25 } });
    }
  });

  it('opens and closes loop rows through draft history and saves the result', () => {
    let state;
    useReducer.mockImplementation((reducer, initial, init) => {
      state ??= init(initial);
      return [state, (action) => { state = reducer(state, action); }];
    });
    const render = () => ProfileEditor({ profileId: bead.id, backLabel: 'Back', onClose: vi.fn() });
    const button = (tree, label) => find(tree, ({ type, props }) => type === 'button' && text(props.children) === label);
    expect(text(render())).toContain('L1 · closed · 4 segments');
    button(render(), 'Open').props.onClick();
    expect(text(render())).toContain('L1 · open · 3 segments');
    expect(state.draft.geometry.loops[0]).toMatchObject({ closed: false, segs: bead.geometry.loops[0].segs.slice(0, -1) });
    expect(text(render())).toContain('Unsaved');
    button(render(), 'Undo').props.onClick();
    expect(text(render())).toContain('L1 · closed · 4 segments');
    button(render(), 'Redo').props.onClick();
    expect(text(render())).toContain('L1 · open · 3 segments');
    button(render(), 'Save').props.onClick();
    expect(dispatch.mock.lastCall[0].payload.profile).toEqual(state.draft);
    button(render(), 'Close').props.onClick();
    expect(state.draft).toEqual(bead);
    expect(text(render())).toContain('L1 · closed · 4 segments');
  });

  it('reports a refused loop closure without applying an invalid draft', () => {
    const twoPoints = { ...bead, geometry: { ...bead.geometry, points: { a: [0, 0], b: [0, -0.5] }, loops: [{ id: 'L1', closed: false, segs: [line('a', 'b')] }] } };
    settings.sectionProfiles = [twoPoints];
    const applyDraft = vi.fn();
    const setMessage = vi.fn();
    useReducer.mockReturnValueOnce([{ draft: twoPoints, past: [], future: [] }, applyDraft]);
    useState.mockReturnValueOnce([null, setMessage]);
    const tree = ProfileEditor({ profileId: bead.id, backLabel: 'Back', onClose: vi.fn() });
    find(tree, ({ type, props }) => type === 'button' && props['aria-label'] === 'Close loop L1').props.onClick();
    expect(setMessage).toHaveBeenCalledWith('A closed shape needs at least 3 points.');
    expect(applyDraft).not.toHaveBeenCalled();
  });
});

describe('Step 484 applied moldings editor', () => {
  const control = (tree, label) => find(tree, ({ props }) => props['aria-label'] === label);
  const add = (tree) => find(tree, ({ type, props }) => type === 'button' && props.children === 'Add molding');
  const offsetInput = (tree, index) => {
    const field = control(tree, `Applied molding ${index + 1} offset`);
    return field.type(field.props);
  };

  it('adds two plain moldings, updates the second from fraction text immediately, and removes the first', () => {
    let draft = structuredClone(DEFAULT_DOOR_STYLE);
    const render = () => DoorProfilePickers({
      draft, design: DOOR_DESIGNS[0], setDraft: (update) => { draft = update(draft); },
    });
    expect(text(render())).toContain('Applied moldings');
    expect(text(render())).toContain('Offset from the stile/rail line; + toward the centre.');
    add(render()).props.onClick();
    add(render()).props.onClick();
    expect(draft.appliedMoldings).toEqual([{ profileId: null, offset: 0 }, { profileId: null, offset: 0 }]);
    offsetInput(render(), 1).props.onChange({ target: { value: '1 1/2' } });
    // The section receives the updated draft before blur or Enter.
    const fields = DoorStyleFields({ draft, setDraft: vi.fn(), designs: DOOR_DESIGNS });
    expect(find(fields, ({ type }) => type === DoorSectionView).props.style.appliedMoldings[1].offset).toBe(1.5);
    control(render(), 'Remove applied molding 1').props.onClick();
    expect(draft.appliedMoldings).toEqual([{ profileId: null, offset: 1.5 }]);
    expect(offsetInput(render(), 0).props.value).toBe('1 1/2');
    control(render(), 'Remove applied molding 1').props.onClick();
    expect(draft.appliedMoldings).toEqual([]);
  });

  it('offers only live applied profiles and Plain line, retaining unavailable picks and other profile slots', () => {
    settings.sectionProfiles = [bead, { ...bead, id: 'am', kind: 'applied_molding' },
      { ...bead, id: 'archived', kind: 'applied_molding', archived: true }];
    let draft = { ...DEFAULT_DOOR_STYLE, appliedMoldings: [{ profileId: null, offset: -0.5 }] };
    const render = () => DoorProfilePickers({
      draft, design: DOOR_DESIGNS[0], setDraft: (update) => { draft = update(draft); },
    });
    const select = () => control(render(), 'Applied molding 1 profile');
    expect(select().props.children.map(({ props }) => [props.value, text(props.children)]))
      .toEqual([['', 'Plain line'], ['am', 'Bead']]);
    select().props.onChange({ target: { value: 'am' } });
    expect(draft.appliedMoldings).toEqual([{ profileId: 'am', offset: -0.5 }]);
    select().props.onChange({ target: { value: '' } });
    expect(draft.appliedMoldings).toEqual([{ profileId: null, offset: -0.5 }]);
    for (const [profileId, note] of [['bead', 'wrong kind'], ['archived', 'archived'], ['missing', 'missing']]) {
      draft = { ...draft, appliedMoldings: [{ profileId, offset: -0.5 }] };
      expect(select().props.value).toBe(profileId);
      expect(text(select())).toContain(`(${note})`);
    }
    control(render(), 'Outside edge').props.onChange({ target: { value: bead.id } });
    expect(draft.profiles).toEqual({ ...DEFAULT_DOOR_STYLE.profiles, outside: bead.id });
    expect(draft.appliedMoldings).toEqual([{ profileId: 'missing', offset: -0.5 }]);
  });

  it('limits additions to six and greys all applied controls without losing rows when switching designs', () => {
    let draft = structuredClone(DEFAULT_DOOR_STYLE);
    const render = (design = DOOR_DESIGNS[0]) => DoorProfilePickers({
      draft, design, setDraft: (update) => { draft = update(draft); },
    });
    for (let index = 0; index < 6; index += 1) {
      expect(add(render()).props.disabled).toBe(false);
      add(render()).props.onClick();
    }
    expect(add(render()).props.disabled).toBe(true);
    add(render()).props.onClick();
    expect(draft.appliedMoldings).toHaveLength(6);
    offsetInput(render(), 0).props.onChange({ target: { value: '-1/4' } });
    const before = structuredClone(draft);
    const unused = render(DOOR_DESIGNS[1]);
    const fieldset = find(unused, ({ type }) => type === 'fieldset');
    expect(fieldset.props.disabled).toBe(true);
    expect(fieldset.props.className).toContain('opacity-50');
    expect(add(unused).props.disabled).toBe(true);
    expect(text(unused)).toContain('kept if you switch back');
    expect(draft).toEqual(before);
    const restored = render(DOOR_DESIGNS[2]);
    expect(find(restored, ({ type }) => type === 'fieldset').props.disabled).toBe(false);
    expect(offsetInput(restored, 0).props.value).toBe('-1/4');
    control(restored, 'Remove applied molding 2').props.onClick();
    expect(add(render()).props.disabled).toBe(false);
  });

  it('retains partial text while typing, accepts signed finite inches, and restores invalid input on blur', () => {
    let draft = { ...DEFAULT_DOOR_STYLE, appliedMoldings: [{ profileId: null, offset: 0 }] };
    let typed = '0';
    let effectValue;
    useState.mockImplementation(() => [typed, (next) => { typed = typeof next === 'function' ? next(typed) : next; }]);
    const render = () => {
      const tree = DoorProfilePickers({ draft, design: DOOR_DESIGNS[0], setDraft: (update) => { draft = update(draft); } });
      useEffect.mockClear();
      const input = offsetInput(tree, 0);
      if (effectValue !== draft.appliedMoldings[0].offset) {
        effectValue = draft.appliedMoldings[0].offset;
        useEffect.mock.lastCall[0]();
      }
      return input;
    };
    for (const [entry, expected] of [['1 ', 1], ['1 1/', 1], ['1 1/2', 1.5], ['+1/4', 0.25], ['-1 1/2', -1.5], ['0', 0], ['0.123', 0.123]]) {
      render().props.onChange({ target: { value: entry } });
      expect(draft.appliedMoldings[0].offset).toBe(expected);
      // A value-driven effect must not reformat text and disrupt fraction entry.
      render();
      expect(typed).toBe(entry);
    }
    for (const entry of ['', '-', 'garbage', 'Infinity', '1/0']) {
      render().props.onChange({ target: { value: entry } });
      expect(typed).toBe(entry);
      expect(draft.appliedMoldings[0].offset).toBe(0.123);
      render().props.onBlur();
      expect(typed).toBe('0.123');
    }
  });
});

describe('Step 473 top mold editor', () => {
  it('offers Grows with height, the same stretch input, and removes stretch when unchecked', () => {
    const { stretch, ...fixed } = tm3;
    void stretch;
    const onApply = vi.fn(() => true);
    const tree = kindPanel(fixed, onApply);
    expect(text(tree)).toContain('Grows with height');
    expect(text(tree)).toContain("Points above the line move up to the room's Top mold height.");
    expect(text(tree)).not.toContain('Grows with thickness');
    checkbox(tree).props.onChange({ target: { checked: true } });
    expect(onApply.mock.lastCall[0].stretch).toEqual({ y: 1.5 });
    const growing = kindPanel(onApply.mock.lastCall[0], onApply);
    expect(stretchInput(growing).props.value).toBe(1.5);
    stretchInput(growing).props.onCommit(2);
    expect(onApply.mock.lastCall[0].stretch).toEqual({ y: 2 });
    checkbox(growing).props.onChange({ target: { checked: false } });
    expect(onApply.mock.lastCall[0]).not.toHaveProperty('stretch');
    for (const kind of ['crown', 'furniture_base', 'toe_kick', 'nosing', 'other']) {
      expect(checkbox(kindPanel({ ...fixed, kind }, onApply))).toBeUndefined();
    }
  });

  it('guards Save for top mold range and arc problems, and saves a valid stretch edit', () => {
    const arc = { ...tm3, drawnPoints: { elevation: [] }, geometry: {
      units: 'in', points: { a: [0.25, 0], b: [0, 0.25], c: [0, 3] },
      loops: [{ id: 'L1', closed: false, segs: [
        { type: 'arc', from: 'a', to: 'b', center: [0.25, 0.25], ccw: false }, line('b', 'c'),
      ] }],
    } };
    for (const [draft, valid, problem] of [
      [{ ...tm3, stretch: { y: 2 } }, true, null],
      [{ ...tm3, stretch: { y: 0 } }, false, 'range'],
      [{ ...tm3, stretch: { y: 3 } }, false, 'range'],
      [{ ...arc, stretch: { y: 0.125 } }, false, 'arc'],
    ]) {
      settings.sectionProfiles = [tm3];
      useReducer.mockReturnValueOnce([{ draft, past: [tm3], future: [] }, vi.fn()]);
      const tree = ProfileEditor({ profileId: tm3.id, backLabel: 'Back', onClose: vi.fn() });
      const save = find(tree, ({ type, props }) => type === 'button' && props.children === 'Save');
      expect(save.props.disabled).toBe(!valid);
      expect(text(tree).includes('Move the stretch line to save')).toBe(!valid);
      const panel = text(kindPanel(draft, vi.fn()));
      if (problem === 'arc') expect(panel).toContain('The stretch line crosses an arc');
      if (problem === 'range') expect(panel).toContain("The stretch line has to sit between the shape's top and bottom");
      dispatch.mockClear();
      save.props.onClick();
      expect(dispatch).toHaveBeenCalledTimes(valid ? 1 : 0);
      if (valid) expect(dispatch.mock.lastCall[0].payload.profile).toEqual(draft);
    }
  });

  it('draws a dashed top mold stretch line above the origin', () => {
    useState.mockReturnValueOnce([{ width: 800, height: 400 }, vi.fn()]);
    useState.mockReturnValueOnce([{ cx: 0, cy: 0, scale: 100 }, vi.fn()]);
    const tree = ProfileCanvas.render({ profile: tm3, grid: 1 / 16, selection: null, tool: 'select' }, null);
    expect(find(tree, ({ props }) => props['aria-label'] === 'Stretch line').props)
      .toMatchObject({ x1: 0, x2: 800, y1: 50, y2: 50, stroke: '#fbbf24', strokeDasharray: '6 4' });
  });
});
