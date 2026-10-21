import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
import VersionPage, { VersionHeader, VersionBanner } from '../VersionPage.jsx';
import RoomPage from '../RoomPage.jsx';
import RoomBanners from '../RoomBanners.jsx';
import MissingDesignsDialog from '../MissingDesignsDialog.jsx';
import DesignerEditor from '../../elevation/DesignerEditor.jsx';
import ElevationToolbar from '../../elevation/components/ElevationToolbar.jsx';
import ExportDxfButton from '../../elevation/components/ExportDxfButton.jsx';
import { newRoomDocument } from '../../elevation/model/designProjects.js';
import { issueRoomVersion, leaveCloudRoom, openCloudRoom, openCloudWorkspace, openRoomVersion } from '../../elevation/store/cloudThunks.js';
import { cloudSync } from '../../elevation/store/cloudSync.js';
import { resetPresenceForTests } from '../../elevation/store/presenceThunks.js';
import { cloudStore, fakeDesignApi } from '../../elevation/store/__tests__/helpers/fakeDesignApi.js';

vi.mock('react', async (original) => ({ ...await original(), useEffect: vi.fn(), useMemo: vi.fn(), useRef: vi.fn(), useState: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-router-dom', async (original) => ({ ...await original(), useParams: vi.fn() }));
vi.mock('../../elevation/components/ElevationCanvas.jsx', () => ({ default: 'elevation-canvas' }));
vi.mock('../../elevation/plan/PlanCanvas.jsx', () => ({ default: 'plan-canvas' }));
vi.mock('../../elevation/store/cloudThunks.js', async (original) => {
  const actual = await original();
  return { ...actual, openRoomVersion: vi.fn(actual.openRoomVersion), leaveCloudRoom: vi.fn(actual.leaveCloudRoom) };
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

beforeEach(async () => {
  vi.clearAllMocks();
  renders = [];
  params = { projectId: '12', roomId: 'r1', versionId: 'v9' };
  auth = { teamId: 't', permissions: { view: true, edit: true, manage: true } };
  const { document, schemaVersion } = newRoomDocument('Kitchen as issued');
  api = fakeDesignApi({ project: {
    project: { est_project_id: 12 }, design: { overrides: {}, version: 1 },
    phases: [{ phase_id: 'ph-1', overrides: {}, version: 1, rooms: [{ room_id: 'r1', phase_id: 'ph-1', name: 'Kitchen as issued', document, schema_version: schemaVersion, status: 'drafting', version: 1 }] }],
  } });
  store = cloudStore(api, auth.permissions, auth.teamId);
  cloudSync.flush.mockResolvedValue({ ok: true });
  cloudSync.saveDraftNow.mockResolvedValue(undefined);
  await store.dispatch(openCloudRoom({ estProjectId: 12, roomId: 'r1' }));
  await store.dispatch(issueRoomVersion({ label: 'KC 10/15/26', note: 'Moved sink' }));
  Object.assign(api.db.versions[0], { version_id: 'v9', seq: 2, issued_by_name: 'Jane', issued_at: '2026-10-15T18:30:00Z' });
  api.db.project.phases[0].rooms[0].name = 'Renamed current kitchen';
  await store.dispatch(leaveCloudRoom());
  api.calls.length = 0;
  vi.clearAllMocks();
  useDispatch.mockReturnValue(store.dispatch);
  useSelector.mockImplementation((select) => select({ ...store.getState(), auth }));
  useParams.mockImplementation(() => params);
  useMemo.mockImplementation((calculate) => calculate());
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
});

async function openPage() {
  const page = renderComponent(VersionPage);
  await page.flush();
  return page;
}

describe('DB8b e version page', () => {
  it('opens the requested issued snapshot with its header, banner and read-only editor, retaining Export DXF (anchor 1)', async () => {
    const page = renderComponent(VersionPage);
    expect(text(page.tree)).toBe('Opening version…');
    await page.flush();
    expect(openRoomVersion).toHaveBeenCalledOnce();
    expect(openRoomVersion).toHaveBeenCalledWith({ estProjectId: 12, roomId: 'r1', versionId: 'v9' });
    const editor = component(page.tree, DesignerEditor);
    expect(editor.props).toMatchObject({ mode: 'room', readOnly: true });
    const header = renderComponent(VersionHeader, editor.props.header.props);
    expect(text(header.tree)).toContain('Kitchen as issued');
    expect(text(header.tree)).not.toContain('Renamed current kitchen');
    expect(text(header.tree)).toContain('Version 2 · KC 10/15/26');
    expect(text(header.tree)).toContain(`Issued ${new Date('2026-10-15T18:30:00Z').toLocaleString()} by Jane`);
    expect(text(header.tree)).toContain('Moved sink');
    expect(component(header.tree, Link).props.to).toBe('/projects/12/rooms/r1');
    const banner = renderComponent(VersionBanner, editor.props.banners.props);
    expect(banner.tree.props.role).toBe('status');
    expect(text(banner.tree)).toContain("This is an issued version. It can't be edited.");
    expect(text(component(banner.tree, Link))).toBe('Open the current drawing');
    expect(component(banner.tree, Link).props.to).toBe('/projects/12/rooms/r1');
    expect(component(editor.props.banners, RoomBanners)).toBeUndefined();
    expect(component(editor.props.banners, MissingDesignsDialog)).toBeUndefined();
    const shared = renderComponent(DesignerEditor, editor.props);
    expect(nodes(shared.tree).filter((node) => node.type === 'fieldset').every((node) => node.props.disabled)).toBe(true);
    const toolbarChild = component(shared.tree, ElevationToolbar);
    const toolbar = renderComponent(ElevationToolbar, toolbarChild.props);
    expect(button(toolbar.tree, 'Draw run')).toBeUndefined();
    expect(button(toolbar.tree, 'Draw wall')).toBeUndefined();
    expect(component(toolbar.tree, ExportDxfButton)).toBeUndefined();
    expect(component(shared.tree, ExportDxfButton)).toBeDefined();
    const exportButton = renderComponent(ExportDxfButton);
    expect(button(exportButton.tree, 'Export DXF').props.disabled).toBe(false);
    page.unmount();
    expect(leaveCloudRoom).not.toHaveBeenCalled();
  });

  it('shows a red not-found alert and room link, retries only on click (anchor 2)', async () => {
    api.db.versions[0].room_id = 'other';
    const page = await openPage();
    expect(text(nodes(page.tree).find((node) => node.props.role === 'alert'))).toContain('That version is not in this room.');
    expect(nodes(page.tree).find((node) => node.props.role === 'alert').props.className).toContain('text-red-200');
    expect(component(page.tree, Link).props.to).toBe('/projects/12/rooms/r1');
    for (let i = 0; i < 3; i += 1) await page.flush();
    expect(openRoomVersion).toHaveBeenCalledOnce();
    api.db.versions[0].room_id = 'r1';
    button(page.tree, 'Retry').props.onClick();
    expect(text(page.render())).toBe('Opening version…');
    await page.flush();
    expect(openRoomVersion).toHaveBeenCalledTimes(2);
    expect(component(page.tree, DesignerEditor)).toBeDefined();
  });

  it('keeps opening without an alert or retry when superseded (anchor 3)', async () => {
    openRoomVersion.mockImplementationOnce(() => async () => ({ ok: false, reason: 'superseded' }));
    const page = await openPage();
    await page.flush();
    expect(text(page.tree)).toBe('Opening version…');
    expect(nodes(page.tree).some((node) => node.props.role === 'alert')).toBe(false);
    expect(openRoomVersion).toHaveBeenCalledOnce();
  });

  it('waits for RoomPage leave to resolve before dispatching the version open (anchor 4)', async () => {
    const room = renderComponent(RoomPage);
    await room.flush();
    const leave = deferred();
    cloudSync.flush.mockReturnValueOnce(leave.promise);
    room.unmount();
    const version = renderComponent(VersionPage);
    await version.flush();
    expect(leaveCloudRoom).toHaveBeenCalledOnce();
    expect(openRoomVersion).not.toHaveBeenCalled();
    leave.resolve({ ok: true });
    await version.flush();
    expect(openRoomVersion).toHaveBeenCalledOnce();
    expect(component(version.tree, DesignerEditor)).toBeDefined();
  });

  it('checks team and view permission without dispatching or calling the API (anchor 5)', async () => {
    const dispatch = vi.fn();
    useDispatch.mockReturnValue(dispatch);
    auth.teamId = null;
    const page = await openPage();
    expect(text(page.tree)).toBe('You are not on a team.');
    auth.teamId = 't';
    auth.permissions.view = false;
    page.render();
    await page.flush();
    expect(text(page.tree)).toBe("You don't have permission to view designs.");
    expect(dispatch).not.toHaveBeenCalled();
    expect(api.calls).toEqual([]);
  });

  it('reopens when shop data replaces the snapshot, but never loops after a failed reopen', async () => {
    const page = await openPage();
    await store.dispatch(openCloudWorkspace());
    expect(text(page.render())).toBe('Opening version…');
    await page.flush();
    expect(openRoomVersion).toHaveBeenCalledTimes(2);
    expect(component(page.tree, DesignerEditor)).toBeDefined();
    // A different issued version also requires reopening the requested one.
    useSelector.mockImplementation((select) => {
      const state = store.getState();
      return select({ ...state, auth, elevation: { ...state.elevation, cloud: { ...state.elevation.cloud,
        room: { ...state.elevation.cloud.room, issued: { versionId: 'other' } } } } });
    });
    openRoomVersion.mockImplementationOnce(() => async () => ({ ok: false, message: 'Could not reopen.' }));
    page.render();
    for (let i = 0; i < 3; i += 1) await page.flush();
    expect(openRoomVersion).toHaveBeenCalledTimes(3);
    expect(text(page.tree)).toContain('Could not reopen.');
  });

  it('ignores replies from an old route and cancels a StrictMode mount waiting to open', async () => {
    const pending = deferred();
    openRoomVersion.mockImplementationOnce(() => () => pending.promise);
    const first = renderComponent(VersionPage);
    await first.flush();
    params = { ...params, versionId: 'v10' };
    first.render();
    await first.flush();
    pending.resolve({ ok: true });
    await first.flush();
    expect(text(first.tree)).toContain('That version is not in this room.');
    expect(component(first.tree, DesignerEditor)).toBeUndefined();
    first.unmount();
    params = { ...params, versionId: 'v9' };
    openRoomVersion.mockClear();
    const strictFirst = renderComponent(VersionPage);
    strictFirst.unmount();
    const strictSecond = await openPage();
    expect(openRoomVersion).toHaveBeenCalledOnce();
    expect(component(strictSecond.tree, DesignerEditor)).toBeDefined();
  });
});
