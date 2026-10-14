import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CABINET_STYLE_IDS, CABINET_STYLE_LABELS, resolveStyle } from '../../model/index.js';
import { run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import InchInput from '../InchInput.jsx';
import OverrideField from '../OverrideField.jsx';
import RoomStylePanel from '../RoomStylePanel.jsx';
import CabinetStyleProperties from '../properties/CabinetStyleProperties.jsx';
import RunFaceOptions from '../properties/RunFaceOptions.jsx';
import StyleFields from '../properties/StyleFields.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const find = (tree, type) => nodes(tree).find((node) => node.type === type);
const inherited = { cabinetStyleId: CABINET_STYLE_IDS.EUROPEAN, beadWidth: 0.25, profiledEdge: true };
const render = (props = {}) => StyleFields({ label: 'Room', inherited, onChange: vi.fn(), ...props });
const field = (tree, label) => OverrideField(nodes(tree).find((node) => (
  node.type === OverrideField && node.props.label === label
)).props);
const reset = (tree) => find(tree, 'button');

beforeEach(() => {
  vi.clearAllMocks();
  let text;
  useState.mockImplementation((initial) => {
    if (text === undefined) text = typeof initial === 'function' ? initial() : initial;
    return [text, (next) => { text = next; }];
  });
});

describe('DB2 g cabinet style overrides', () => {
  it('anchor 1: keeps missing and null styles inherited, grey, and without Reset', () => {
    for (const value of [undefined, { cabinetStyleId: null, profiledEdge: null }]) {
      const tree = render({ value });
      const style = field(tree, 'Room');
      const select = find(style, 'select');
      expect(select.props.value).toBe('');
      expect(find(style, 'option').props.children).toEqual(['Inherit (', CABINET_STYLE_LABELS[inherited.cabinetStyleId], ')']);
      expect(select.props['aria-label']).toBe('Room style');
      expect(select.props.className).toContain('border-gray-600');
      expect(select.props.className).not.toContain('border-teal-500');
      expect(reset(style)).toBeUndefined();
      expect(style.props.title).toBe('Shop standard: European');
      expect(find(tree, InchInput)).toBeUndefined();
      const edge = field(tree, 'Outside edge');
      expect(find(edge, 'select').props.value).toBe('');
      expect(find(edge, 'select').props.className).toContain('border-gray-600');
      expect(reset(edge)).toBeUndefined();
    }
  });

  it('anchor 2: marks the chosen beaded style teal and resets only its stored key', () => {
    const onChange = vi.fn();
    const value = { cabinetStyleId: CABINET_STYLE_IDS.BEADED_INSET, beadWidth: 0.5, profiledEdge: false };
    const style = field(render({ value, onChange }), 'Room');
    const select = find(style, 'select');
    expect(select.props.value).toBe(CABINET_STYLE_IDS.BEADED_INSET);
    expect(select.props.className).toContain('border-teal-500');
    expect(select.props.className).not.toContain('border-gray-600');
    expect(select.props.className).toContain('focus:border-blue-500');
    expect(style.props.title).toBe('Room override · Shop standard: European');
    expect(reset(style).props['aria-label']).toBe('Reset Room');
    reset(style).props.onClick();
    expect(onChange).toHaveBeenLastCalledWith({ ...value, cabinetStyleId: null });
    select.props.onChange({ target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...value, cabinetStyleId: null });
    select.props.onChange({ target: { value: String(CABINET_STYLE_IDS.INSET) } });
    expect(onChange).toHaveBeenLastCalledWith({ ...value, cabinetStyleId: CABINET_STYLE_IDS.INSET });
  });

  it('anchor 3: treats false as a Square outside-edge override with Reset', () => {
    const onChange = vi.fn();
    const edge = field(render({ value: { profiledEdge: false }, onChange }), 'Outside edge');
    const select = find(edge, 'select');
    expect(select.props.value).toBe('false');
    expect(nodes(edge).find(({ type, props }) => type === 'option' && props.value === 'false').props.children).toBe('Square');
    expect(select.props['aria-label']).toBe('Room outside edge');
    expect(select.props.className).toContain('border-teal-500');
    expect(select.props.className).not.toContain('border-gray-600');
    expect(edge.props.title).toBe('Room override · Shop standard: Profiled');
    reset(edge).props.onClick();
    expect(onChange).toHaveBeenLastCalledWith({ profiledEdge: null });
    for (const [value, next] of [['', null], ['true', true], ['false', false]]) {
      select.props.onChange({ target: { value } });
      expect(onChange).toHaveBeenLastCalledWith({ profiledEdge: next });
    }
  });

  it('anchor 4: shows an equal quarter-inch bead override, resets, and preserves blur validation', () => {
    const onChange = vi.fn();
    const beaded = { ...inherited, cabinetStyleId: CABINET_STYLE_IDS.BEADED_INSET };
    const bead = field(render({ inherited: beaded, value: { beadWidth: 0.25 }, onChange }), 'Bead width');
    const input = () => InchInput(find(bead, InchInput).props);
    expect(input().props.value).toBe('1/4');
    expect(input().props.placeholder).toBe('1/4"');
    expect(input().props['aria-label']).toBe('Room bead width');
    expect(input().props.className).toContain('border-teal-500');
    expect(input().props.className).not.toContain('border-gray-600');
    expect(input().props.className).toContain('focus:border-blue-500');
    expect(bead.props.title).toBe('Room override · Shop standard: 1/4"');
    reset(bead).props.onClick();
    expect(onChange).toHaveBeenLastCalledWith({ beadWidth: null });
    for (const [value, next] of [['3/8', 0.375], ['0', 0], ['', null]]) {
      input().props.onChange({ target: { value } });
      input().props.onBlur();
      expect(onChange).toHaveBeenLastCalledWith({ beadWidth: next });
    }
    onChange.mockClear();
    input().props.onChange({ target: { value: '-1/4' } });
    input().props.onBlur();
    expect(onChange).not.toHaveBeenCalled();
    expect(input().props.value).toBe('1/4');
    const inheritedBead = field(render({ inherited: beaded }), 'Bead width');
    expect(find(inheritedBead, InchInput).props.value).toBeNull();
    expect(find(inheritedBead, InchInput).props.borderClass).toBe('border-gray-600');
    expect(reset(inheritedBead)).toBeUndefined();
  });

  it('passes the existing labels and hover context from all three callers', () => {
    const state = stateWithRun(makeRun());
    const room = state.rooms[0];
    const wall = room.walls[0];
    const run = wall.runs[0];
    const item = { id: 'cabinet-1', style: { profiledEdge: false } };
    room.style = { profiledEdge: false };
    run.style = { profiledEdge: false };
    const dispatch = vi.fn();
    useDispatch.mockReturnValue(dispatch);
    useSelector.mockImplementation((selector) => selector({ elevation: state }));
    const faceLayout = { style: resolveStyle(state.settings, room, run, item), reveals: { values: {}, sources: {} } };
    const callers = [
      [RoomStylePanel(), 'Room', 'Shop standard', { roomId: room.id }],
      [RunFaceOptions({ room, wall, run, settings: state.settings }), 'Run', 'Room', { wallId: wall.id, runId: run.id }],
      [CabinetStyleProperties({ room, wall, run, item, settings: state.settings, faceLayout }), 'Cabinet', 'Run',
        { wallId: wall.id, runId: run.id, itemIds: [item.id] }],
    ];
    for (const [tree, label, source, at] of callers) {
      const props = find(tree, StyleFields).props;
      expect(props).toMatchObject({ label, level: label, inheritedFrom: source });
      const fields = StyleFields(props);
      const edge = field(fields, 'Outside edge');
      expect(edge.props.title).toBe(`${label} override · ${source}: ${props.inherited.profiledEdge ? 'Profiled' : 'Square'}`);
      expect(find(edge, 'select').props['aria-label']).toBe(`${label} outside edge`);
      const style = field(fields, label);
      expect(find(style, 'select').props['aria-label']).toBe(`${label} style`);
      expect(style.props.title).toBe(`${source}: ${CABINET_STYLE_LABELS[props.inherited.cabinetStyleId]}`);
      reset(edge).props.onClick();
      expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ payload: { ...at, style: { profiledEdge: null } } }));
    }
  });
});
