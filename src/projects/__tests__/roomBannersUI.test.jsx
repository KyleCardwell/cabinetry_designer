import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import * as thunks from '../../elevation/store/cloudThunks.js';
import { cloudSync } from '../../elevation/store/cloudSync.js';
import RoomBanners from '../RoomBanners.jsx';
import StaleDraftDialog from '../StaleDraftDialog.jsx';
import { statusBlockText } from '../roomText.js';

vi.mock('react', async (original) => ({ ...await original(), useEffect: vi.fn(), useState: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('../../elevation/store/cloudThunks.js', () => Object.fromEntries([
  'editRoomAnyway', 'allowRoomDemote', 'overwriteRoomConflict', 'reloadRoomAfterConflict',
  'openCloudWorkspace', 'applyStaleRoomDraft', 'discardStaleRoomDraft',
].map((name) => [name, vi.fn(() => ({ type: name }))])));
vi.mock('../../elevation/store/cloudSync.js', () => ({ cloudSync: { retry: vi.fn() } }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const button = (tree, label) => nodes(tree).find((node) => node.type === 'button' && text(node) === label);
const component = (tree, type) => nodes(tree).find((node) => node.type === type);
const time = (at) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dateTime = (at) => `${new Date(at).toLocaleDateString()} ${time(at)}`;
const savedAt = '2026-10-14T17:04:00Z';
const olderAt = '2026-10-14T16:02:00Z';
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
let current;
let state;
let dispatch;
let renders;
let browser;

// Render the JSX and preserve hook state, matching the other project UI tests.
function renderComponent(Component, props = {}) {
  const owner = { slots: [], effects: [], cursor: 0, pending: [], tree: null };
  owner.render = () => {
    current = owner;
    owner.cursor = 0;
    owner.pending = [];
    owner.tree = Component(props);
    owner.pending.forEach((run) => run());
    return owner.tree;
  };
  owner.unmount = () => owner.effects.forEach((effect) => effect?.cleanup?.());
  renders.push(owner);
  owner.render();
  return owner;
}
const renderBanners = (props = {}) => renderComponent(RoomBanners, { projectId: '42', roomId: 'rm-1', ...props });
const room = () => state.elevation.cloud.room;
const cloud = () => state.elevation.cloud;

beforeEach(() => {
  vi.clearAllMocks();
  renders = [];
  state = {
    elevation: { cloud: { room: { id: 'rm-1', status: 'drafting', readOnly: false }, conflict: null, error: null, statusBlock: null } },
    presence: { selfKey: 'self', entries: [] },
  };
  dispatch = vi.fn().mockResolvedValue({ ok: true });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((select) => select(state));
  browser = new EventTarget();
  vi.stubGlobal('window', browser);
  vi.stubGlobal('navigator', { onLine: true });
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
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
      owner.pending.push(() => {
        previous?.cleanup?.();
        owner.effects[index] = { deps, cleanup: run() };
      });
    }
  });
});

afterEach(() => {
  renders.forEach((owner) => owner.unmount());
  vi.unstubAllGlobals();
});

describe('DB6b d room banners', () => {
  it('shows the opening editors, their earliest time, and Edit anyway (anchor 1)', async () => {
    Object.assign(room(), { readOnly: true, readOnlyReason: 'others' });
    const banner = renderBanners({ openBy: [{ userName: 'Jane', openedAt: savedAt }, { userName: 'Jane', openedAt: olderAt }] });
    expect(text(banner.tree)).toBe(`Jane has this room open. You're viewing only. (since ${time(olderAt)})Edit anyway`);
    await button(banner.tree, 'Edit anyway').props.onClick();
    expect(thunks.editRoomAnyway).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: 'editRoomAnyway' });
  });

  it('links an archived room back to its project (anchor 2)', () => {
    Object.assign(room(), { readOnly: true, readOnlyReason: 'archived' });
    const banner = renderBanners();
    expect(text(banner.tree)).toContain('This room is archived. Restore it on the project page to edit it.');
    expect(component(banner.tree, Link).props.to).toBe('/projects/42');
    expect(text(component(banner.tree, Link))).toBe('Open the project');
    expect(button(banner.tree, 'Edit anyway')).toBeUndefined();
  });

  it('shows other editors, excluding this tab, viewers, and other rooms (anchor 3)', () => {
    state.presence.entries = [
      { key: 'self', roomId: 'rm-1', userName: 'Kyle' },
      { key: 'b', roomId: 'rm-1', userName: 'Bob' },
      { key: 'v', roomId: 'rm-1', userName: 'Viewer', readOnly: true },
      { key: 'x', roomId: 'rm-2', userName: 'Elsewhere' },
    ];
    const banner = renderBanners();
    expect(text(banner.tree)).toBe('Bob also has this room open.');
    state.presence.entries.push({ key: 'a', roomId: 'rm-1', userName: 'Ann' });
    expect(text(banner.render())).toBe('Bob and Ann also have this room open.');
  });

  it('warns before editing approved or released rooms, until a status block appears (anchor 4)', () => {
    Object.assign(room(), { status: 'approved', statusByName: 'Kyle' });
    const banner = renderBanners();
    expect(text(banner.tree)).toBe('This room is Approved (by Kyle). Your next change will ask before moving it back to Drafting.');
    Object.assign(room(), { status: 'released', statusByName: null });
    expect(text(banner.render())).toBe('This room is Released to shop. Your next change will ask before moving it back to Drafting.');
    cloud().statusBlock = { target: 'room', status: 'released' };
    expect(text(banner.render())).not.toContain('Your next change');
  });

  it('offers demotion and requires two clicks to discard blocked changes (anchor 5)', () => {
    cloud().statusBlock = { target: 'room', status: 'approved', byName: 'Kyle' };
    const banner = renderBanners();
    expect(text(banner.tree)).toContain(statusBlockText(cloud().statusBlock));
    button(banner.tree, 'Save and move to Drafting').props.onClick();
    expect(dispatch).toHaveBeenCalledWith({ type: 'allowRoomDemote' });
    dispatch.mockClear();
    button(banner.tree, 'Discard my changes').props.onClick();
    banner.render();
    expect(dispatch).not.toHaveBeenCalled();
    button(banner.tree, 'Confirm discard').props.onClick();
    expect(dispatch).toHaveBeenCalledWith({ type: 'reloadRoomAfterConflict' });
  });

  it('requires two clicks to overwrite a room conflict and can use theirs (anchor 6)', () => {
    cloud().conflict = { target: 'room', updatedByName: 'Jane', updatedAt: savedAt };
    const banner = renderBanners();
    expect(text(banner.tree)).toContain(`Jane saved this room at ${time(savedAt)}. Your changes weren't saved.`);
    button(banner.tree, 'Keep mine').props.onClick();
    banner.render();
    expect(dispatch).not.toHaveBeenCalled();
    button(banner.tree, 'Overwrite their save?').props.onClick();
    expect(dispatch).toHaveBeenCalledWith({ type: 'overwriteRoomConflict' });
    button(banner.tree, 'Use theirs').props.onClick();
    expect(dispatch).toHaveBeenCalledWith({ type: 'reloadRoomAfterConflict' });
    cloud().conflict = { target: 'room' };
    expect(text(banner.render())).toContain("Someone saved this room. Your changes weren't saved.");
  });

  it('shows offline information and suppresses save errors while offline (anchor 7)', () => {
    navigator.onLine = false;
    cloud().error = { target: 'room', what: 'Room', message: 'Failed to fetch' };
    const banner = renderBanners();
    expect(text(banner.tree)).toBe("You're offline. Changes are kept in this browser and save when the connection is back.");
    expect(button(banner.tree, 'Retry')).toBeUndefined();
    expect(nodes(banner.tree).some((node) => node.props.className?.includes('border-red-700'))).toBe(false);
    navigator.onLine = true;
    browser.dispatchEvent(new Event('online'));
    expect(button(banner.render(), 'Retry')).toBeDefined();
  });

  it('shows online save errors and retries the sync (anchor 8)', () => {
    cloud().error = { target: 'room', what: 'Room', message: 'Failed to fetch' };
    const banner = renderBanners();
    expect(text(banner.tree)).toContain("Couldn't save Room: Failed to fetch");
    expect(nodes(banner.tree).some((node) => node.props.className?.includes('border-red-700'))).toBe(true);
    button(banner.tree, 'Retry').props.onClick();
    expect(cloudSync.retry).toHaveBeenCalledOnce();
  });

  it('reloads shop data for conflicts with another save target (anchor 9)', () => {
    cloud().conflict = { target: 'doorDesign:x', what: 'Door design "110"', updatedByName: null };
    const banner = renderBanners();
    expect(text(banner.tree)).toContain('Door design "110" were changed somewhere else. Your change wasn\'t saved.');
    button(banner.tree, 'Reload shop data').props.onClick();
    expect(dispatch).toHaveBeenCalledWith({ type: 'openCloudWorkspace' });
    cloud().conflict.updatedByName = 'Jane';
    expect(text(banner.render())).toContain('were changed by Jane');
  });

  it('dismisses recovery locally for its timestamp and shows a new recovery (anchor 10)', () => {
    Object.assign(room(), { recovered: true, recoveredAt: savedAt });
    const banner = renderBanners();
    expect(text(banner.tree)).toContain(`Recovered unsaved changes from this browser (${dateTime(savedAt)}).`);
    button(banner.tree, 'OK').props.onClick();
    expect(text(banner.render())).toBe('');
    expect(room().recovered).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
    room().recoveredAt = olderAt;
    expect(text(banner.render())).toContain(dateTime(olderAt));
  });

  it('offers both stale draft actions and displays a failed reply (anchor 11)', async () => {
    room().staleDraft = { savedAt, baseVersion: 3 };
    const banner = renderBanners();
    const dialog = renderComponent(StaleDraftDialog, component(banner.tree, StaleDraftDialog).props);
    expect(text(dialog.tree)).toContain('Unsaved changes from this browser');
    expect(text(dialog.tree)).toContain(`This browser has changes to this room from ${dateTime(savedAt)} that were never saved. The room has been saved again since.`);
    expect(text(dialog.tree)).toContain('Replaces the saved room; the newer save is overwritten');
    expect(nodes(dialog.tree).find((node) => node.props.role === 'dialog').props['aria-modal']).toBe('true');
    dispatch.mockResolvedValueOnce({ ok: false, message: 'The saved copy could not be read, so it was removed.' });
    await button(dialog.tree, 'Restore my changes').props.onClick();
    dialog.render();
    expect(dispatch).toHaveBeenCalledWith({ type: 'applyStaleRoomDraft' });
    expect(text(dialog.tree)).toContain('The saved copy could not be read, so it was removed.');
    await button(dialog.tree, 'Discard them').props.onClick();
    expect(dispatch).toHaveBeenCalledWith({ type: 'discardStaleRoomDraft' });
    room().staleDraft = null;
    expect(component(banner.render(), StaleDraftDialog)).toBeUndefined();
  });

  it('renders nothing for an editable drafting room online (anchor 12)', () => {
    expect(nodes(renderBanners().tree).filter((node) => typeof node.type === 'string')).toEqual([]);
  });

  it('clears both two-click confirmations when their banners disappear', () => {
    const block = { target: 'room', status: 'approved' };
    const conflict = { target: 'room' };
    Object.assign(cloud(), { statusBlock: block, conflict });
    const banner = renderBanners();
    button(banner.tree, 'Discard my changes').props.onClick();
    button(banner.tree, 'Keep mine').props.onClick();
    banner.render();
    expect(button(banner.tree, 'Confirm discard')).toBeDefined();
    expect(button(banner.tree, 'Overwrite their save?')).toBeDefined();
    Object.assign(cloud(), { statusBlock: null, conflict: null });
    banner.render();
    Object.assign(cloud(), { statusBlock: block, conflict });
    banner.render();
    expect(button(banner.tree, 'Discard my changes')).toBeDefined();
    expect(button(banner.tree, 'Keep mine')).toBeDefined();
  });

  it('disables both draft choices while either call runs and blocks canvas clicks', async () => {
    const dialog = renderComponent(StaleDraftDialog, { staleDraft: { savedAt, baseVersion: 3 } });
    expect(dialog.tree.props.className).toContain('fixed inset-0 z-50');
    for (const label of ['Restore my changes', 'Discard them']) {
      const pending = deferred();
      dispatch.mockReturnValueOnce(pending.promise);
      const clicked = button(dialog.tree, label).props.onClick();
      dialog.render();
      expect(button(dialog.tree, 'Restore my changes').props.disabled).toBe(true);
      expect(button(dialog.tree, 'Discard them').props.disabled).toBe(true);
      pending.resolve({ ok: false, message: 'Try again' });
      await clicked;
      dialog.render();
      expect(button(dialog.tree, 'Restore my changes').props.disabled).toBe(false);
      expect(button(dialog.tree, 'Discard them').props.disabled).toBe(false);
    }
  });

  it('shows Edit anyway failures and restricts editing actions for read-only reasons', async () => {
    Object.assign(room(), { readOnly: true, readOnlyReason: 'others', status: 'approved' });
    state.presence.entries = [{ key: 'b', roomId: 'rm-1', userName: 'Bob' }];
    const banner = renderBanners({ openBy: [{ userName: 'Jane' }] });
    const pending = deferred();
    dispatch.mockReturnValueOnce(pending.promise);
    const clicked = button(banner.tree, 'Edit anyway').props.onClick();
    banner.render();
    expect(button(banner.tree, 'Edit anyway').props.disabled).toBe(true);
    pending.resolve({ ok: false, message: "This room can't be edited here." });
    await clicked;
    expect(text(banner.render())).toContain("This room can't be edited here.");
    for (const [reason, message] of [
      ['permission', "View only: you don't have permission to edit designs."],
      ['version', "This is an issued version. It can't be edited."],
    ]) {
      room().readOnlyReason = reason;
      banner.render();
      banner.render();
      expect(text(banner.tree)).toBe(message);
      expect(button(banner.tree, 'Edit anyway')).toBeUndefined();
    }
  });

  it('renders simultaneous notices in the specified banner order', () => {
    state.presence.entries = [{ key: 'b', roomId: 'rm-1', userName: 'Bob' }];
    Object.assign(room(), { recovered: true, recoveredAt: savedAt });
    Object.assign(cloud(), {
      statusBlock: { target: 'room', status: 'approved' },
      conflict: { target: 'room', updatedByName: 'Jane' },
      error: { what: 'Room', message: 'Failed' },
    });
    const banner = renderBanners();
    const notices = nodes(banner.tree).filter((node) => node.props.role === 'status' || node.props.role === 'alert');
    expect(notices.map((node) => text(node).split('.')[0])).toEqual([
      'Bob also has this room open', 'This room is Approved',
      'Jane saved this room', "Couldn't save Room: FailedRetry",
      `Recovered unsaved changes from this browser (${dateTime(savedAt)})`,
    ]);
  });
});
