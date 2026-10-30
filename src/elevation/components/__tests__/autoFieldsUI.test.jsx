import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { auto, opening, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import {
  setCellDepth, setRunAnchor, setRunEnd, setRunEndFiller, setRunJointOffset,
  setSoffitAnchor, setWallEndPanel,
} from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import CellDepthSection from '../properties/CellDepthSection.jsx';
import EndFields from '../properties/EndFields.jsx';
import GapField from '../properties/GapField.jsx';
import RunEndsSection from '../properties/RunEndsSection.jsx';
import SoffitProperties from '../properties/SoffitProperties.jsx';
import WallEndPanelFields from '../properties/WallEndPanelFields.jsx';

vi.mock('react', async (original) => ({
  ...await original(), useState: vi.fn(), useEffect: vi.fn(), useMemo: (compute) => compute(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

const dispatch = vi.fn();
const at = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const field = (tree, label) => {
  const input = nodes(tree).find(({ type, props }) => type === InchInput && props['aria-label'] === label);
  expect(input, label).toBeDefined();
  return input;
};
const enter = (input, text) => {
  useState.mockReturnValueOnce([text, vi.fn()]);
  InchInput(input.props).props.onBlur();
};
let settings;
let currentRun;
let currentWall;
let currentRoom;
const endFields = () => EndFields({
  actionBase: at, room: currentRoom, wall: currentWall, run: currentRun, side: 'left', settings,
});
const runEnds = () => RunEndsSection({
  actionBase: at, room: currentRoom, wall: currentWall, run: currentRun, settings,
});

beforeEach(() => {
  vi.clearAllMocks();
  useDispatch.mockReturnValue(dispatch);
  settings = structuredClone(DEFAULT_SETTINGS);
  currentRun = run({ autoCount: false, items: [auto('a')] });
  currentWall = wall({ runs: [currentRun], openings: [opening()] });
  currentRoom = room({ walls: [currentWall] });
});

describe('AU10 step a auto inch fields', () => {
  // Wall Base proud is already pinned by furnitureBaseUI.test.jsx's Wall cases:
  // "switches base kind and saves the active furniture profile and proud" and
  // "inherits and clears proud, kind and profile picks according to scope".
  it('gap: shows 3/4, clears to null and accepts explicit zero', () => {
    const onCommit = vi.fn(() => false);
    const input = field(GapField({
      label: 'Gap', ariaLabel: 'Gap', value: 1.5, fallback: 0.75, onCommit,
    }), 'Gap');
    expect(input.props).toMatchObject({ value: 1.5, allowBlank: true, placeholder: '3/4' });
    expect(input.props.onCommit(null)).toBe(true);
    expect(onCommit).toHaveBeenLastCalledWith(null);
    expect(input.props.onCommit(0)).toBe(true);
    expect(onCommit).toHaveBeenLastCalledWith(0);
    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  it('gap: rejects a negative value without calling the site', () => {
    const onCommit = vi.fn();
    const input = field(GapField({ ariaLabel: 'Gap', fallback: 0.75, onCommit }), 'Gap');
    expect(input.props.value).toBeNull();
    expect(input.props.onCommit(-1)).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('cell depth: shows 24 for a plain base cell and dispatches typed and blank depths', () => {
    const item = currentRun.grid.cells[0].node;
    const input = field(CellDepthSection({
      wall: currentWall, run: currentRun, piece: item, item, settings,
    }), 'Cell depth');
    expect(input.props).toMatchObject({ value: null, allowBlank: true, placeholder: '24' });
    enter(input, '18 1/2');
    expect(dispatch).toHaveBeenLastCalledWith(setCellDepth({
      wallId: 'wall-1', runId: 'run-1', cellId: 'a', depth: 18.5,
    }));
    enter(input, '');
    expect(dispatch).toHaveBeenLastCalledWith(setCellDepth({
      wallId: 'wall-1', runId: 'run-1', cellId: 'a', depth: null,
    }));
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('cell depth: renders nothing for a void cell', () => {
    const item = { ...auto('void'), kind: 'void' };
    expect(CellDepthSection({ wall: currentWall, run: currentRun, piece: item, item, settings })).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, '13/16"'],
    [{ left: 1.5 }, '1 1/2"'],
  ])('wall end panel: thickness %j gives %s and preserves the panel payload', (thickness, placeholder) => {
    if (thickness) currentWall._endPanelThickness = thickness;
    const input = field(WallEndPanelFields({
      wall: currentWall, endpoint: 'left', panel: {}, label: 'Left', framed: false, settings,
    }), 'Left panel width');
    expect(input.props.value).toBeUndefined();
    expect(input.props.allowBlank).toBe(true);
    expect(input.props.placeholder).toBe(placeholder);
    enter(input, '1 1/4');
    expect(dispatch).toHaveBeenLastCalledWith(setWallEndPanel({
      wallId: 'wall-1', endpoint: 'left', panel: { width: 1.25, frame: null },
    }));
    enter(input, '');
    expect(dispatch).toHaveBeenLastCalledWith(setWallEndPanel({
      wallId: 'wall-1', endpoint: 'left', panel: { width: null, frame: null },
    }));
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['end_panel', '3/4'],
    ['filler', 'auto'],
  ])('%s end width: shows %s and dispatches typed and blank widths', (type, placeholder) => {
    currentRun.ends.left = { type, width: null };
    currentRun._endThickness = { left: 0.75 };
    const input = field(endFields(), 'left end width');
    expect(input.props).toMatchObject({ value: null, allowBlank: true, placeholder });
    enter(input, '2 1/4');
    expect(dispatch).toHaveBeenLastCalledWith(setRunEnd({
      ...at, side: 'left', end: { type, width: 2.25 },
    }));
    enter(input, '');
    expect(dispatch).toHaveBeenLastCalledWith(setRunEnd({
      ...at, side: 'left', end: { type, width: null },
    }));
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['filler', 'ordered width', 'width', 'from layout'],
    ['filler', 'return depth', 'returnDepth', '2 1/2'],
    ['blind', 'ordered width', 'width', '6'],
    ['blind', 'return depth', 'returnDepth', '0"'],
  ])('%s %s: dispatches only %s with its literal placeholder', (type, label, key, placeholder) => {
    currentRun.ends.left = { type, width: null };
    const input = field(endFields(), `left end filler ${label}`);
    expect(input.props).toMatchObject({ value: null, allowBlank: true, placeholder });
    enter(input, '3 1/2');
    expect(dispatch).toHaveBeenLastCalledWith(setRunEndFiller({ ...at, side: 'left', key, value: 3.5 }));
    enter(input, '');
    expect(dispatch).toHaveBeenLastCalledWith(setRunEndFiller({ ...at, side: 'left', key, value: null }));
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it.each(['left', 'right'])('%s joint anchor: shows 0 and clears its offset to zero', (side) => {
    currentRun.anchors[side] = { to: 'joint', jointId: 'joint-1', offset: null };
    currentWall.joints = [{ id: 'joint-1', x: 60 }];
    const input = field(runEnds(), `${side} joint anchor offset`);
    expect(input.props).toMatchObject({ value: null, allowBlank: true, placeholder: '0' });
    enter(input, '1 1/2');
    expect(dispatch).toHaveBeenLastCalledWith(setRunJointOffset({ ...at, side, offset: 1.5 }));
    enter(input, '');
    expect(dispatch).toHaveBeenLastCalledWith(setRunJointOffset({ ...at, side, offset: 0 }));
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it.each(['left', 'right'])('%s opening anchor: shows 0, accepts negative clearance and clears to null', (side) => {
    const anchor = { to: 'opening', openingId: 'door-1', side: 'left', edge: 'casing', clearance: null };
    currentRun.anchors[side] = anchor;
    const input = field(runEnds(), `${side} opening anchor clearance`);
    expect(input.props).toMatchObject({ value: null, allowBlank: true, placeholder: '0' });
    enter(input, '-1');
    expect(dispatch).toHaveBeenLastCalledWith(setRunAnchor({ ...at, side, anchor: { ...anchor, clearance: -1 } }));
    enter(input, '');
    expect(dispatch).toHaveBeenLastCalledWith(setRunAnchor({ ...at, side, anchor: { ...anchor, clearance: null } }));
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it.each(['left', 'right'])('%s run soffit anchor: shows 0 and clears its offset to zero', (side) => {
    const anchor = { to: 'soffit', soffitId: 'soffit-1', offset: null };
    currentRun.anchors[side] = anchor;
    const input = field(runEnds(), `${side} soffit anchor offset`);
    expect(input.props).toMatchObject({ value: null, allowBlank: true, placeholder: '0' });
    enter(input, '1 1/2');
    expect(dispatch).toHaveBeenLastCalledWith(setRunAnchor({ ...at, side, anchor: { ...anchor, offset: 1.5 } }));
    enter(input, '');
    expect(dispatch).toHaveBeenLastCalledWith(setRunAnchor({ ...at, side, anchor: { ...anchor, offset: 0 } }));
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it.each(['left', 'right'])('%s soffit anchor: shows 0 and clears its own offset to null', (side) => {
    const anchor = { to: 'end', offset: null };
    const soffit = { id: 'soffit-1', x: 0, width: 60, bottom: 84, molding: 'none', anchors: { [side]: anchor } };
    const input = field(SoffitProperties({ room: currentRoom, wall: currentWall, soffit, settings }), `${side} soffit anchor offset`);
    expect(input.props).toMatchObject({ value: null, allowBlank: true, placeholder: '0' });
    enter(input, '1 1/2');
    expect(dispatch).toHaveBeenLastCalledWith(setSoffitAnchor({
      wallId: 'wall-1', soffitId: 'soffit-1', side, anchor: { ...anchor, offset: 1.5 },
    }));
    enter(input, '');
    expect(dispatch).toHaveBeenLastCalledWith(setSoffitAnchor({
      wallId: 'wall-1', soffitId: 'soffit-1', side, anchor: { ...anchor, offset: null },
    }));
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});
