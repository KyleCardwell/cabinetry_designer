import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import MissingDesignsDialog from '../MissingDesignsDialog.jsx';
import MissingDoorDesignsNotice, { MissingDoorDesignRow } from '../../elevation/components/MissingDoorDesignsNotice.jsx';
import { DEFAULT_DOOR_STYLE } from '../../elevation/model/doorStyles.js';
import elevationReducer, { moveMissingDoorDesign } from '../../elevation/store/elevationSlice.js';
import { stateWithRun } from '../../elevation/store/__tests__/helpers/sliceFixtures.js';

vi.mock('react', async (original) => ({ ...await original(), useEffect: vi.fn(), useState: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const archived = '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b';
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const button = (tree, label) => nodes(tree).find((node) => node.type === 'button' && text(node) === label);
const select = (tree) => nodes(tree).find((node) => node.type === 'select');
let state;
let dispatch;
let current;

// Preserve hook state while rendering JSX directly, like the other project UI tests.
function renderComponent(Component, props = {}) {
  const owner = { slots: [], effects: [], tree: null };
  owner.render = () => {
    current = owner;
    owner.cursor = 0;
    owner.pending = [];
    owner.tree = Component(props);
    owner.pending.forEach((run) => run());
    return owner.tree;
  };
  owner.render();
  return owner;
}
const rows = (tree) => nodes(tree).filter((node) => node.type === MissingDoorDesignRow)
  .map((node) => renderComponent(MissingDoorDesignRow, node.props));
const room = () => state.elevation.rooms[0];

beforeEach(() => {
  vi.clearAllMocks();
  state = { elevation: stateWithRun() };
  room().doorStyles = ['A', 'C'].map((label) => ({ ...DEFAULT_DOOR_STYLE, id: label, label, designId: archived }));
  state.elevation.cloud = { room: { id: room().id, readOnly: false } };
  dispatch = vi.fn((action) => { state.elevation = elevationReducer(state.elevation, action); });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector(state));
  useState.mockImplementation((initial) => {
    const owner = current;
    const index = owner.cursor++;
    if (!(index in owner.slots)) owner.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [owner.slots[index], (value) => {
      owner.slots[index] = typeof value === 'function' ? value(owner.slots[index]) : value;
    }];
  });
  useEffect.mockImplementation((run, deps) => {
    const owner = current;
    const index = owner.cursor++;
    const previous = owner.effects[index];
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous[i]))) {
      owner.pending.push(() => { owner.effects[index] = deps; run(); });
    }
  });
});

describe('DB6b e missing door designs on open', () => {
  it('asks for one replacement for archived styles A and C (anchor 1)', () => {
    const dialog = renderComponent(MissingDesignsDialog);
    expect(text(dialog.tree)).toContain("This room uses door designs that aren't in the Library");
    expect(nodes(dialog.tree).find((node) => node.props.role === 'dialog').props['aria-modal']).toBe('true');
    const [row] = rows(dialog.tree);
    expect(rows(dialog.tree)).toHaveLength(1);
    expect(text(row.tree)).toContain("An archived door design isn't in the Library any more. Styles A, C use it");
    expect(text(row.tree)).not.toContain(archived);
    expect(select(row.tree)).toBeDefined();
    expect(button(row.tree, 'Move')).toBeDefined();
  });

  it('moves the styles to slab and closes when nothing is missing (anchor 2)', () => {
    const dialog = renderComponent(MissingDesignsDialog);
    const [row] = rows(dialog.tree);
    select(row.tree).props.onChange({ target: { value: 'slab' } });
    row.render();
    button(row.tree, 'Move').props.onClick();
    expect(dispatch).toHaveBeenCalledWith(moveMissingDoorDesign({ roomId: 'room-1', designId: archived, reassignTo: 'slab' }));
    expect(room().doorStyles.map((style) => style.designId)).toEqual(['slab', 'slab']);
    expect(dialog.render()).toBeNull();
  });

  it('keeps the notice after Not now and does not prompt again on room edits (anchor 3)', () => {
    const dialog = renderComponent(MissingDesignsDialog);
    button(dialog.tree, 'Not now').props.onClick();
    expect(dialog.render()).toBeNull();
    room().name = 'Renamed';
    expect(dialog.render()).toBeNull();
    const notice = renderComponent(MissingDoorDesignsNotice);
    expect(rows(notice.tree)).toHaveLength(1);
    expect(button(rows(notice.tree)[0].tree, 'Move')).toBeDefined();
  });

  it('shows only notice text when the cloud room is read-only (anchor 4)', () => {
    state.elevation.cloud.room.readOnly = true;
    expect(renderComponent(MissingDesignsDialog).tree).toBeNull();
    const [row] = rows(renderComponent(MissingDoorDesignsNotice).tree);
    expect(text(row.tree)).toContain('An archived door design');
    expect(text(row.tree)).toMatch(/Someone who can edit the room can move them\.$/);
    expect(select(row.tree)).toBeUndefined();
    expect(button(row.tree, 'Move')).toBeUndefined();
  });

  it('keeps the sandbox notice editable with the legacy design name (anchor 5)', () => {
    delete state.elevation.cloud;
    room().doorStyles.forEach((style) => { style.designId = 'old'; });
    const [row] = rows(renderComponent(MissingDoorDesignsNotice).tree);
    expect(text(row.tree)).toContain('Door design `old`');
    expect(select(row.tree)).toBeDefined();
    expect(button(row.tree, 'Move')).toBeDefined();
  });

  it('shows neither the dialog nor the notice when nothing is missing (anchor 6)', () => {
    room().doorStyles.forEach((style) => { style.designId = 'slab'; });
    expect(renderComponent(MissingDesignsDialog).tree).toBeNull();
    expect(renderComponent(MissingDoorDesignsNotice).tree).toBeNull();
  });

  it('lists each missing design and stays closed after all replacements are complete', () => {
    room().doorStyles[1].designId = 'old';
    const dialog = renderComponent(MissingDesignsDialog);
    const missingRows = rows(dialog.tree);
    expect(missingRows).toHaveLength(2);
    button(missingRows[0].tree, 'Move').props.onClick();
    expect(rows(dialog.render())).toHaveLength(1);
    button(rows(dialog.tree)[0].tree, 'Move').props.onClick();
    expect(dialog.render()).toBeNull();
    // A later library edit in the same open room leaves just the reminder.
    state.elevation = structuredClone(state.elevation);
    room().doorStyles[0].designId = 'later';
    expect(dialog.render()).toBeNull();
    expect(renderComponent(MissingDoorDesignsNotice).tree).not.toBeNull();
  });
});
