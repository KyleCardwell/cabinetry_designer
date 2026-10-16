import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { issueRoomVersion, issueSnapshotOf, reloadRoomAfterConflict } from '../../elevation/store/cloudThunks.js';
import RoomHeader from '../RoomHeader.jsx';
import IssueDialog from '../IssueDialog.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn(), useStore: vi.fn() }));
vi.mock('../useOnline.js', () => ({ default: () => true }));
vi.mock('../../elevation/store/cloudThunks.js', () => ({
  issueRoomVersion: vi.fn((args) => ({ type: 'issueRoomVersion', ...args })),
  issueSnapshotOf: vi.fn(),
  reloadRoomAfterConflict: vi.fn(() => ({ type: 'reloadRoomAfterConflict' })),
  setRoomStatus: vi.fn(),
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const component = (tree, type) => nodes(tree).find((node) => node.type === type);
const button = (tree, label) => nodes(tree).find((node) => node.type === 'button' && text(node) === label);
const alert = (tree) => nodes(tree).find((node) => node.props.role === 'alert');
const change = (tree, type, value) => component(tree, type).props.onChange({ target: { value } });
const submit = (dialog) => component(dialog.tree, 'form').props.onSubmit({ preventDefault: vi.fn() });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
let current;
let state;
let dispatch;
let store;

// Preserve hook state while inspecting JSX directly, as in the other project UI tests.
function renderComponent(Component, props = {}) {
  const owner = { slots: [], cursor: 0, tree: null };
  owner.render = () => {
    current = owner;
    owner.cursor = 0;
    owner.tree = Component(props);
    return owner.tree;
  };
  owner.render();
  return owner;
}

function openDialog() {
  const header = renderComponent(RoomHeader, { projectId: '42', roomId: 'rm-1' });
  expect(component(header.tree, IssueDialog)).toBeUndefined();
  button(header.tree, 'Issue…').props.onClick();
  header.render();
  const dialog = renderComponent(IssueDialog, component(header.tree, IssueDialog).props);
  return { header, dialog };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 15, 12));
  state = {
    auth: { userName: 'Kyle Cardwell' },
    elevation: {
      source: 'cloud', rooms: [{ id: 'rm-1', name: 'Kitchen' }],
      cloud: { permissions: { edit: true }, pending: 0,
        room: { id: 'rm-1', status: 'drafting', readOnly: false, lastVersion: null } },
    },
  };
  store = { getState: vi.fn(() => state) };
  dispatch = vi.fn().mockResolvedValue({ ok: true });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((select) => select(state));
  useStore.mockReturnValue(store);
  issueSnapshotOf.mockReturnValue({ missing: { doorDesigns: [], profiles: [] } });
  useState.mockImplementation((initial) => {
    const owner = current;
    const index = owner.cursor++;
    if (!(index in owner.slots)) owner.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [owner.slots[index], (value) => {
      owner.slots[index] = typeof value === 'function' ? value(owner.slots[index]) : value;
    }];
  });
});

afterEach(() => { vi.useRealTimers(); });

describe('DB8b d issue dialog', () => {
  it('shows Not issued yet and prefills the label and empty note on each open', () => {
    const { header, dialog } = openDialog();
    expect(text(header.tree)).toContain('Not issued yet');
    const modal = nodes(dialog.tree).find((node) => node.props.role === 'dialog');
    expect(modal.props['aria-modal']).toBe('true');
    expect(component(dialog.tree, 'h2').props.id).toBe(modal.props['aria-labelledby']);
    expect(text(modal)).toContain('Issue a version');
    expect(text(modal)).toContain('Freezes the room as it is now, with the shop settings and library it draws with. The drawing keeps changing; the version never does.');
    expect(component(dialog.tree, 'input').props.value).toBe('KC 10/15/26');
    expect(component(dialog.tree, 'textarea').props).toMatchObject({ value: '', placeholder: 'What changed (optional)' });
    change(dialog.tree, 'input', 'Custom label');
    change(dialog.tree, 'textarea', 'Old note');
    dialog.render();
    expect(issueSnapshotOf).toHaveBeenCalledOnce();
    expect(issueSnapshotOf).toHaveBeenCalledWith(state);
    expect(store.getState).toHaveBeenCalledOnce();
    button(dialog.tree, 'Cancel').props.onClick();
    expect(component(header.render(), IssueDialog)).toBeUndefined();
    vi.setSystemTime(new Date(2026, 9, 16, 12));
    button(header.tree, 'Issue…').props.onClick();
    const reopened = renderComponent(IssueDialog, component(header.render(), IssueDialog).props);
    expect(component(reopened.tree, 'input').props.value).toBe('KC 10/16/26');
    expect(component(reopened.tree, 'textarea').props.value).toBe('');
    expect(issueSnapshotOf).toHaveBeenCalledTimes(2);
  });

  it('issues the label and note, disables actions while issuing, then closes and shows v3', async () => {
    const { header, dialog } = openDialog();
    change(dialog.tree, 'textarea', 'Moved sink 2"');
    dialog.render();
    const issuing = deferred();
    dispatch.mockReturnValueOnce(issuing.promise);
    const submitted = submit(dialog);
    dialog.render();
    expect(issueRoomVersion).toHaveBeenCalledOnce();
    expect(issueRoomVersion).toHaveBeenCalledWith({ label: 'KC 10/15/26', note: 'Moved sink 2"' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'issueRoomVersion', label: 'KC 10/15/26', note: 'Moved sink 2"' });
    expect(button(dialog.tree, 'Issuing…').props.disabled).toBe(true);
    expect(button(dialog.tree, 'Cancel').props.disabled).toBe(true);
    await submit(dialog);
    expect(dispatch).toHaveBeenCalledOnce();
    state.elevation.cloud.room.lastVersion = { seq: 3, label: 'KC 10/15/26' };
    issuing.resolve({ ok: true, seq: 3 });
    await submitted;
    header.render();
    expect(component(header.tree, IssueDialog)).toBeUndefined();
    expect(text(header.tree)).toContain('Last issued: KC 10/15/26 (v3)');
  });

  it('blocks issuing when door designs are missing and shows the amber notice', async () => {
    issueSnapshotOf.mockReturnValue({ missing: { doorDesigns: ['abc'], profiles: [] } });
    const { dialog } = openDialog();
    const notice = nodes(dialog.tree).find((node) => node.type === 'p' && node.props.className?.includes('text-amber-300'));
    expect(text(notice)).toBe("This room uses door designs that aren't in the Library. Move them with the notice under the toolbar, then issue.");
    expect(button(dialog.tree, 'Issue').props.disabled).toBe(true);
    await submit(dialog);
    expect(issueRoomVersion).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('blocks whitespace labels and a missing shop-room snapshot', async () => {
    const { dialog } = openDialog();
    change(dialog.tree, 'input', '   ');
    dialog.render();
    expect(button(dialog.tree, 'Issue').props.disabled).toBe(true);
    await submit(dialog);
    expect(dispatch).not.toHaveBeenCalled();
    issueSnapshotOf.mockReturnValue(null);
    const noRoom = renderComponent(IssueDialog, { onClose: vi.fn() });
    expect(button(noRoom.tree, 'Issue').props.disabled).toBe(true);
    await submit(noRoom);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('HP3c step d anchor 2: blocks issuing missing pulls and shows the amber replacement notice', async () => {
    issueSnapshotOf.mockReturnValue({ missing: { doorDesigns: [], profiles: [], pulls: ['gone'] } });
    const { dialog } = openDialog();
    const notice = nodes(dialog.tree).find((node) => node.type === 'p' && node.props.className?.includes('text-amber-300'));
    expect(text(notice)).toBe("This room uses pulls that aren't in the Library. Move them with the notice under the toolbar, then issue.");
    expect(button(dialog.tree, 'Issue').props.disabled).toBe(true);
    await submit(dialog);
    expect(issueRoomVersion).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('warns in grey about missing profiles but still allows issuing', async () => {
    issueSnapshotOf.mockReturnValue({ missing: { doorDesigns: [], profiles: ['p1', 'p2'] } });
    const { dialog } = openDialog();
    const notice = nodes(dialog.tree).find((node) => node.type === 'p' && node.props.className?.includes('text-gray-300'));
    expect(text(notice)).toBe("2 profile(s) the room names aren't in the Library. The version will show them as missing.");
    expect(button(dialog.tree, 'Issue').props.disabled).toBe(false);
    await submit(dialog);
    expect(issueRoomVersion).toHaveBeenCalledOnce();
  });

  it('keeps failures in the dialog and clears the alert when retrying', async () => {
    const { header, dialog } = openDialog();
    dispatch.mockResolvedValueOnce({ ok: false, reason: 'unsaved', message: 'Some changes are not saved yet.' });
    await submit(dialog);
    dialog.render();
    expect(text(alert(dialog.tree))).toBe('Some changes are not saved yet.');
    expect(component(header.render(), IssueDialog)).toBeDefined();
    expect(button(dialog.tree, 'Use theirs')).toBeUndefined();
    expect(button(dialog.tree, 'Issue').props.disabled).toBe(false);
    const retrying = deferred();
    dispatch.mockReturnValueOnce(retrying.promise);
    const retried = submit(dialog);
    dialog.render();
    expect(alert(dialog.tree)).toBeUndefined();
    retrying.resolve({ ok: true });
    await retried;
    expect(component(header.render(), IssueDialog)).toBeUndefined();
  });

  it('offers Use theirs after a conflict, waits for the reload, then closes', async () => {
    const { header, dialog } = openDialog();
    dispatch.mockResolvedValueOnce({ ok: false, reason: 'conflict', message: 'This room was saved again.' });
    await submit(dialog);
    dialog.render();
    expect(text(alert(dialog.tree))).toBe('This room was saved again.');
    const reloading = deferred();
    dispatch.mockReturnValueOnce(reloading.promise);
    const reloaded = button(dialog.tree, 'Use theirs').props.onClick();
    dialog.render();
    expect(reloadRoomAfterConflict).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'reloadRoomAfterConflict' });
    expect(button(dialog.tree, 'Use theirs').props.disabled).toBe(true);
    expect(button(dialog.tree, 'Cancel').props.disabled).toBe(true);
    expect(component(header.render(), IssueDialog)).toBeDefined();
    reloading.resolve({ ok: true });
    await reloaded;
    expect(component(header.render(), IssueDialog)).toBeUndefined();
  });

  it('keeps Last issued visible and hides Issue for read-only rooms, viewers and non-cloud sources', () => {
    state.elevation.cloud.room.lastVersion = { seq: 3, label: 'KC 10/15/26' };
    const header = renderComponent(RoomHeader, { projectId: '42', roomId: 'rm-1' });
    for (const [source, edit, readOnly] of [
      ['cloud', true, true], ['cloud', false, false], ['version', true, false], ['local', true, false],
    ]) {
      state.elevation.source = source;
      state.elevation.cloud.permissions.edit = edit;
      state.elevation.cloud.room.readOnly = readOnly;
      header.render();
      expect(button(header.tree, 'Issue…')).toBeUndefined();
      expect(text(header.tree)).toContain('Last issued: KC 10/15/26 (v3)');
    }
  });
});
