import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
import RoomPage from '../RoomPage.jsx';
import RoomHeader from '../RoomHeader.jsx';
import RoomBanners from '../RoomBanners.jsx';
import useOnline from '../useOnline.js';
import { ROOM_STATUS_COLORS } from '../PhaseSection.jsx';
import DesignerEditor from '../../elevation/DesignerEditor.jsx';
import { newRoomDocument } from '../../elevation/model/designProjects.js';
import { leaveCloudRoom, openCloudRoom } from '../../elevation/store/cloudThunks.js';
import { cloudSync } from '../../elevation/store/cloudSync.js';
import { cloudRoomPatch, cloudSaveStatus, layersLoaded } from '../../elevation/store/elevationSlice.js';
import { resetPresenceForTests } from '../../elevation/store/presenceThunks.js';
import { cloudStore, fakeDesignApi } from '../../elevation/store/__tests__/helpers/fakeDesignApi.js';

vi.mock('react', async (original) => ({ ...await original(), useEffect: vi.fn(), useRef: vi.fn(), useState: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-router-dom', async (original) => ({ ...await original(), useParams: vi.fn() }));
vi.mock('../../elevation/DesignerEditor.jsx', () => ({ default: 'designer-editor' }));
vi.mock('../../elevation/store/cloudThunks.js', async (original) => {
  const actual = await original();
  return { ...actual, openCloudRoom: vi.fn(actual.openCloudRoom), leaveCloudRoom: vi.fn(actual.leaveCloudRoom) };
});
vi.mock('../../elevation/store/cloudSync.js', () => ({ cloudSync: { flush: vi.fn(), saveDraftNow: vi.fn() } }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const component = (tree, type) => nodes(tree).find((node) => node.type === type);
const button = (tree, label) => nodes(tree).find((node) => node.type === 'button' && text(node) === label);
const settle = async () => { for (let i = 0; i < 60; i += 1) await Promise.resolve(); };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
let current;
let renders;
let params;
let auth;
let api;
let store;
let browser;

// Keep hook state and effect cleanup while rendering JSX directly, as in projectPageUI.
function renderComponent(Component, props = {}) {
  const renderer = { slots: [], effects: [], cursor: 0, pending: [], tree: null, mounted: true };
  renderer.render = () => {
    current = renderer;
    renderer.cursor = 0;
    renderer.pending = [];
    renderer.tree = Component(props);
    renderer.pending.forEach((run) => run());
    return renderer.tree;
  };
  renderer.flush = async () => { await settle(); return renderer.render(); };
  renderer.unmount = () => {
    if (!renderer.mounted) return;
    renderer.mounted = false;
    renderer.effects.forEach((effect) => effect?.cleanup?.());
  };
  renders.push(renderer);
  renderer.render();
  return renderer;
}

function row(id, name) {
  const { document, schemaVersion } = newRoomDocument('Document name');
  return { room_id: id, phase_id: 'ph-1', name, document, schema_version: schemaVersion,
    status: 'drafting', version: 1, archived_at: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  renders = [];
  params = { projectId: '42', roomId: 'rm-1' };
  auth = { teamId: 't', permissions: { view: true, edit: true, manage: true } };
  api = fakeDesignApi({ project: {
    project: { est_project_id: 42 }, design: { overrides: {}, version: 1 },
    phases: [{ phase_id: 'ph-1', overrides: {}, version: 1, rooms: [row('rm-1', 'Kitchen'), row('rm-2', 'Pantry')] }],
  } });
  store = cloudStore(api, auth.permissions, auth.teamId);
  useDispatch.mockReturnValue(store.dispatch);
  useSelector.mockImplementation((select) => select({ ...store.getState(), auth }));
  useParams.mockImplementation(() => params);
  cloudSync.flush.mockResolvedValue({ ok: true });
  cloudSync.saveDraftNow.mockResolvedValue(undefined);
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
  useRef.mockImplementation((initial) => {
    const owner = current;
    const index = owner.cursor++;
    if (!(index in owner.slots)) owner.slots[index] = { current: initial };
    return owner.slots[index];
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

afterEach(async () => {
  renders.forEach((renderer) => renderer.unmount());
  await settle();
  resetPresenceForTests();
  vi.unstubAllGlobals();
});

async function openPage() {
  const page = renderComponent(RoomPage);
  await page.flush();
  return page;
}

describe('DB6b c room page', () => {
  it('opens project 42 / rm-1, then shows the row name and Drafting in the shared editor (anchor 9)', async () => {
    const page = renderComponent(RoomPage);
    expect(text(page.tree)).toBe('Opening room…');
    await page.flush();
    expect(openCloudRoom).toHaveBeenCalledOnce();
    expect(openCloudRoom).toHaveBeenCalledWith({ estProjectId: 42, roomId: 'rm-1' });
    expect(api.calls).toContainEqual(['getProject', 42]);
    expect(api.calls).toContainEqual(['getRoom', 'rm-1']);
    const editor = component(page.tree, DesignerEditor);
    expect(editor.props).toMatchObject({ mode: 'room', readOnly: false });
    expect(editor.props.banners.type).toBe(RoomBanners);
    expect(editor.props.banners.props).toEqual({ projectId: '42', roomId: 'rm-1', openBy: [] });
    const header = renderComponent(RoomHeader, editor.props.header.props);
    expect(text(header.tree)).toContain('Kitchen');
    expect(text(header.tree)).toContain('Drafting');
    expect(text(header.tree)).toContain('All changes saved');
    expect(component(header.tree, Link).props.to).toBe('/projects/42');
    expect(nodes(header.tree).find((node) => text(node) === 'Drafting').props.className).toContain(ROOM_STATUS_COLORS.drafting);
  });

  it('shows open failures with Retry and a project link, and retries only on click (anchor 10)', async () => {
    api.db.project.phases[0].rooms = [];
    const page = await openPage();
    expect(text(component(page.tree, 'div'))).toContain('That room is not in this project.');
    expect(nodes(page.tree).find((node) => node.props.role === 'alert').props.className).toContain('text-red-200');
    expect(component(page.tree, Link).props.to).toBe('/projects/42');
    expect(component(page.tree, DesignerEditor)).toBeUndefined();
    for (let i = 0; i < 3; i += 1) await page.flush();
    expect(openCloudRoom).toHaveBeenCalledOnce();
    api.db.project.phases[0].rooms.push(row('rm-1', 'Kitchen'));
    button(page.tree, 'Retry').props.onClick();
    page.render();
    expect(text(page.tree)).toBe('Opening room…');
    await page.flush();
    expect(openCloudRoom).toHaveBeenCalledTimes(2);
    expect(component(page.tree, DesignerEditor)).toBeDefined();
  });

  it('ignores a superseded reply without an error or an automatic retry (anchor 11)', async () => {
    openCloudRoom.mockImplementationOnce(() => async () => ({ ok: false, reason: 'superseded' }));
    const page = await openPage();
    await page.flush();
    expect(nodes(page.tree).some((node) => node.props.role === 'alert')).toBe(false);
    expect(component(page.tree, DesignerEditor)).toBeUndefined();
    expect(openCloudRoom).toHaveBeenCalledOnce();
  });

  it('dispatches leave on unmount (anchor 12)', async () => {
    const page = await openPage();
    cloudSync.flush.mockClear();
    page.unmount();
    await settle();
    expect(leaveCloudRoom).toHaveBeenCalledOnce();
    expect(cloudSync.flush).toHaveBeenCalledOnce();
  });

  it('flushes pending changes and disables Save now while saving (anchor 13)', async () => {
    await openPage();
    store.dispatch(cloudSaveStatus({ pending: 2 }));
    const header = renderComponent(RoomHeader, params);
    expect(text(header.tree)).toContain('Unsaved changes');
    const saving = deferred();
    cloudSync.flush.mockClear().mockReturnValueOnce(saving.promise);
    const clicked = button(header.tree, 'Save now').props.onClick();
    header.render();
    expect(button(header.tree, 'Saving…').props.disabled).toBe(true);
    expect(cloudSync.flush).toHaveBeenCalledOnce();
    saving.resolve({ ok: true });
    await clicked;
    header.render();
    expect(button(header.tree, 'Save now').props.disabled).toBe(false);
  });

  it('passes the read-only lock to the editor and shows View only above all save states (anchor 14)', async () => {
    auth.permissions.edit = false;
    const page = await openPage();
    expect(component(page.tree, DesignerEditor).props.readOnly).toBe(true);
    store.dispatch(cloudSaveStatus({ pending: 2, error: { message: 'Error' } }));
    navigator.onLine = false;
    const header = renderComponent(RoomHeader, params);
    expect(text(header.tree)).toContain('View only');
    expect(nodes(header.tree).some((node) => node.props.className?.includes('text-gray-400'))).toBe(true);
    expect(text(header.tree)).not.toContain('Offline');
    expect(button(header.tree, 'Save now')).toBeUndefined();
    store.dispatch(cloudRoomPatch({ readOnly: false }));
    expect(component(page.render(), DesignerEditor).props.readOnly).toBe(false);
  });

  it('checks team membership and view permission without API calls', async () => {
    auth.teamId = null;
    const page = renderComponent(RoomPage);
    await page.flush();
    expect(text(page.tree)).toBe('You are not on a team.');
    auth.teamId = 't';
    auth.permissions.view = false;
    page.render();
    await page.flush();
    expect(text(page.tree)).toBe("You don't have permission to view designs.");
    expect(api.calls).toEqual([]);
    expect(openCloudRoom).not.toHaveBeenCalled();
  });

  it('waits for the last leave before opening the next room and ignores the old reply', async () => {
    api.hold();
    const page = renderComponent(RoomPage);
    await page.flush();
    const leave = deferred();
    cloudSync.flush.mockReturnValueOnce(leave.promise);
    params = { ...params, roomId: 'rm-2' };
    page.render();
    await page.flush();
    expect(leaveCloudRoom).toHaveBeenCalledOnce();
    expect(openCloudRoom).toHaveBeenCalledOnce();
    leave.resolve({ ok: true });
    await page.flush();
    expect(openCloudRoom).toHaveBeenLastCalledWith({ estProjectId: 42, roomId: 'rm-2' });
    api.release();
    await page.flush();
    expect(store.getState().elevation.cloud.room.id).toBe('rm-2');
    expect(component(page.tree, DesignerEditor).props.header.props.roomId).toBe('rm-2');
  });

  it('waits for cleanup on an immediate remount, as with StrictMode', async () => {
    const first = renderComponent(RoomPage);
    const leave = deferred();
    cloudSync.flush.mockReturnValueOnce(leave.promise);
    first.unmount();
    const second = renderComponent(RoomPage);
    await second.flush();
    expect(openCloudRoom).not.toHaveBeenCalled();
    leave.resolve({ ok: true });
    await second.flush();
    expect(openCloudRoom).toHaveBeenCalledOnce();
    expect(component(second.tree, DesignerEditor)).toBeDefined();
  });

  it('reopens after a successful room is cleared, but stops if reopening fails', async () => {
    const page = await openPage();
    api.hold();
    store.dispatch(layersLoaded({ project: { id: 42, values: {} } }));
    page.render();
    expect(text(page.tree)).toBe('Opening room…');
    await page.flush();
    expect(openCloudRoom).toHaveBeenCalledTimes(2);
    await page.flush();
    expect(openCloudRoom).toHaveBeenCalledTimes(2);
    api.release();
    await page.flush();
    expect(component(page.tree, DesignerEditor)).toBeDefined();
    api.db.project.phases[0].rooms = [];
    store.dispatch(layersLoaded({}));
    page.render();
    await page.flush();
    await page.flush();
    expect(openCloudRoom).toHaveBeenCalledTimes(3);
    expect(button(page.tree, 'Retry')).toBeDefined();
  });

  it('prioritizes offline, then save blockers, then pending changes, with matching colors', async () => {
    await openPage();
    const header = renderComponent(RoomHeader, params);
    for (const blocker of ['error', 'conflict', 'statusBlock']) {
      store.dispatch(cloudSaveStatus({ pending: 2, error: null, conflict: null, statusBlock: null, [blocker]: { target: 'room' } }));
      header.render();
      expect(text(header.tree)).toContain('Not saved');
      expect(button(header.tree, 'Save now')).toBeUndefined();
      expect(nodes(header.tree).some((node) => node.props.className?.includes('text-red-300'))).toBe(true);
    }
    navigator.onLine = false;
    browser.dispatchEvent(new Event('offline'));
    header.render();
    expect(text(header.tree)).toContain('Offline — changes kept in this browser');
    expect(nodes(header.tree).some((node) => node.props.className?.includes('text-amber-300'))).toBe(true);
    navigator.onLine = true;
    browser.dispatchEvent(new Event('online'));
    store.dispatch(cloudSaveStatus({ pending: 0, statusBlock: null }));
    header.render();
    expect(text(header.tree)).toContain('All changes saved');
    expect(nodes(header.tree).some((node) => node.props.className?.includes('text-teal-400'))).toBe(true);
  });
});

describe('useOnline', () => {
  it('reads initial offline state, follows browser events and cleans up both listeners', () => {
    navigator.onLine = false;
    const add = vi.spyOn(browser, 'addEventListener');
    const remove = vi.spyOn(browser, 'removeEventListener');
    const hook = renderComponent(useOnline);
    expect(hook.tree).toBe(false);
    navigator.onLine = true;
    browser.dispatchEvent(new Event('online'));
    expect(hook.render()).toBe(true);
    navigator.onLine = false;
    browser.dispatchEvent(new Event('offline'));
    expect(hook.render()).toBe(false);
    hook.unmount();
    expect(remove.mock.calls).toEqual(add.mock.calls);
  });

  it('defaults to online when navigator is missing', () => {
    vi.stubGlobal('navigator', undefined);
    expect(renderComponent(useOnline).tree).toBe(true);
  });
});
