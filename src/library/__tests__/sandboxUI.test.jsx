import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { createRoutesFromChildren, matchRoutes, Navigate, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import App from '../../App.jsx';
import AppShell from '../../components/layout/AppShell.jsx';
import ElevationLab from '../../elevation/ElevationLab.jsx';
import ProjectsPage from '../../projects/ProjectsPage.jsx';
import { cloudStore, fakeDesignApi } from '../../elevation/store/__tests__/helpers/fakeDesignApi.js';
import { cloudWorkspaceFailed, cloudWorkspaceLoading } from '../../elevation/store/elevationSlice.js';
import * as cloudThunks from '../../elevation/store/cloudThunks.js';
import WorkspaceSourceBar from '../WorkspaceSourceBar.jsx';
import LibraryLayout from '../LibraryLayout.jsx';
import SettingsPage from '../SettingsPage.jsx';
import SettingsPanel from '../../elevation/components/SettingsPanel.jsx';
import ProfileEditorPage from '../profileEditor/ProfileEditorPage.jsx';
import ProfileEditor from '../profileEditor/ProfileEditor.jsx';

const sandbox = vi.hoisted(() => ({ enabled: false }));
vi.mock('../../sandbox.js', () => ({ get SANDBOX_ENABLED() { return sandbox.enabled; } }));
vi.mock('react', async (original) => ({ ...await original(), useEffect: vi.fn(), useRef: vi.fn(), useState: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-router-dom', async (original) => ({ ...await original(), useNavigate: vi.fn(), useParams: vi.fn() }));
vi.mock('../../projects/useLeaveProjectPresence.js', () => ({ default: () => {} }));
vi.mock('../../elevation/DesignerEditor.jsx', () => ({ default: 'designer-editor' }));
vi.mock('../profileEditor/ProfileEditor.jsx', () => ({ default: 'profile-editor' }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const component = (tree, type) => nodes(tree).find((node) => node.type === type);
const text = (tree) => Array.isArray(tree) ? tree.map(text).join(' ')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' ? tree : '';
const settle = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
let current;
let store;
let api;
let openShop;

// Match the repo's direct JSX rendering, retaining hook slots and effect dependencies.
function render(Component, props = {}) {
  const owner = { slots: [], cursor: 0, pending: [] };
  owner.render = () => {
    current = owner;
    owner.cursor = 0;
    owner.pending = [];
    const tree = Component(props);
    current = null;
    owner.pending.forEach((run) => run());
    return tree;
  };
  return owner;
}
function setStore(teamId = 7) {
  api = fakeDesignApi();
  store = cloudStore(api, { view: true, edit: true, manage: false }, teamId);
  useDispatch.mockReturnValue(store.dispatch);
  useSelector.mockImplementation((selector) => selector(store.getState()));
}
function routeAt(path) {
  const signedIn = App();
  const shell = signedIn.type();
  const routes = createRoutesFromChildren(shell.props.children.props.children);
  return matchRoutes(routes, path).at(-1).route;
}
function navLabels() {
  return nodes(AppShell({})).filter((node) => node.type === NavLink).map((node) => node.props.children);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  sandbox.enabled = false;
  current = null;
  useNavigate.mockReturnValue(vi.fn());
  useParams.mockReturnValue({ profileId: 'profile-1' });
  useRef.mockImplementation((initial) => {
    const owner = current;
    const index = owner.cursor++;
    return owner.slots[index] ??= { current: initial };
  });
  useState.mockImplementation((initial) => {
    const owner = current;
    const index = owner.cursor++;
    if (!(index in owner.slots)) owner.slots[index] = initial;
    return [owner.slots[index], (value) => { owner.slots[index] = value; }];
  });
  useEffect.mockImplementation((run, deps) => {
    if (!current) return;
    const owner = current;
    const index = owner.cursor++;
    const previous = owner.slots[index];
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous[i]))) {
      owner.slots[index] = deps;
      owner.pending.push(run);
    }
  });
  openShop = vi.spyOn(cloudThunks, 'openCloudWorkspace');
  setStore();
});

describe('DB7 a dev-only sandbox', () => {
  it('redirects the signed-in lab route to Projects and hides its nav link (anchor 1)', () => {
    const fallback = routeAt('/elevation-lab');
    expect(fallback.path).toBe('*');
    expect(fallback.element.type).toBe(Navigate);
    expect(fallback.element.props).toMatchObject({ to: '/projects', replace: true });
    expect(routeAt('/projects').element.type).toBe(ProjectsPage);
    expect(navLabels()).toEqual(['Projects', 'Library', 'Shop settings']);
  });

  it('opens team 7 once and hides the designs outlet until shop data is ready (anchor 2)', async () => {
    let finish;
    api.loadTeamSettings = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    expect(routeAt('/library/door-designs').path).toBe('door-designs');
    const library = render(LibraryLayout);
    expect(component(library.render(), Outlet)).toBeUndefined();
    const bar = render(WorkspaceSourceBar);
    const initial = bar.render();
    expect(text(initial)).toContain('Loading…');
    expect(text(initial)).not.toContain('This browser');
    expect(text(initial)).not.toContain('sandbox');
    // React StrictMode can replay the mount effect with the original captured state.
    bar.pending.forEach((run) => run());
    bar.render();
    expect(openShop).toHaveBeenCalledOnce();
    expect(component(library.render(), Outlet)).toBeUndefined();
    await settle();
    finish({ ok: true, row: null });
    await settle();
    expect(store.getState().elevation.source).toBe('cloud');
    expect(component(library.render(), Outlet)).toBeDefined();
    expect(text(bar.render())).toContain('All changes saved');
    expect(openShop).toHaveBeenCalledOnce();
  });

  it('shows the no-team error and never renders local settings or retries (anchor 3)', () => {
    setStore(null);
    expect(routeAt('/settings').element.type).toBe(SettingsPage);
    const settings = render(SettingsPage);
    expect(component(settings.render(), SettingsPanel)).toBeUndefined();
    const bar = render(WorkspaceSourceBar);
    bar.render();
    expect(text(bar.render())).toContain('You are not on a team, so there is no shop data to open.');
    bar.render();
    expect(component(settings.render(), SettingsPanel)).toBeUndefined();
    // A fresh source bar also respects the workspace error.
    render(WorkspaceSourceBar).render();
    expect(openShop).toHaveBeenCalledOnce();
    expect(api.calls).toEqual([]);
  });

  it('keeps the lab, switch and local library available with the flag on (anchor 4)', () => {
    sandbox.enabled = true;
    expect(routeAt('/elevation-lab').element.type).toBe(ElevationLab);
    expect(navLabels()).toEqual(['Projects', 'Elevation Lab', 'Library', 'Shop settings']);
    expect(component(render(LibraryLayout).render(), Outlet)).toBeDefined();
    const tree = render(WorkspaceSourceBar).render();
    expect(text(tree)).toContain('This browser');
    expect(text(tree)).toContain('Shop (Supabase)');
    expect(text(tree)).toContain("Editing this browser's sandbox");
    expect(openShop).not.toHaveBeenCalled();
    expect(store.getState().elevation.source).toBe('local');
  });

  it('gates the profile editor and settings until cloud data opens, preserving view-only access', async () => {
    const profile = render(ProfileEditorPage);
    const settings = render(SettingsPage);
    const profileTree = profile.render();
    expect(component(profileTree, ProfileEditor)).toBeUndefined();
    const bar = render(WorkspaceSourceBar, component(profileTree, WorkspaceSourceBar).props);
    expect(text(bar.render())).not.toContain('This browser');
    await settle();
    expect(store.getState().elevation.source).toBe('cloud');
    expect(component(profile.render(), ProfileEditor).props.profileId).toBe('profile-1');
    expect(component(profile.render(), 'fieldset').props.disabled).toBe(true);
    expect(component(settings.render(), SettingsPanel)).toBeDefined();
    expect(component(settings.render(), 'fieldset').props.disabled).toBe(true);
    expect(text(bar.render())).not.toContain('Shop (Supabase)');
  });

  it('waits during loading, preserves load failures and keeps conflict/save banners', () => {
    store.dispatch(cloudWorkspaceLoading());
    const bar = render(WorkspaceSourceBar);
    expect(text(bar.render())).toContain('Loading…');
    expect(openShop).not.toHaveBeenCalled();
    store.dispatch(cloudWorkspaceFailed('Load failed'));
    expect(text(bar.render())).toContain('Load failed');
    expect(text(bar.render())).not.toContain('Loading…');
    expect(openShop).not.toHaveBeenCalled();
    const elevation = { ...store.getState().elevation, source: 'cloud', cloud: {
      pending: 1, conflict: { what: 'Shop settings' }, error: { what: 'Profile', message: 'Save failed' },
    } };
    useSelector.mockImplementation((selector) => selector({ ...store.getState(), elevation }));
    const tree = bar.render();
    for (const label of ['Saving…', 'Shop settings', 'Reload shop data', 'Save failed', 'Retry']) {
      expect(text(tree)).toContain(label);
    }
    expect(text(tree)).not.toContain('This browser');
    expect(openShop).not.toHaveBeenCalled();
  });
});

describe('DB8a after an issued version', () => {
  it('reopens live shop data even with the sandbox on, never showing the frozen library', () => {
    sandbox.enabled = true;
    const elevation = { ...store.getState().elevation, source: 'version' };
    useSelector.mockImplementation((selector) => selector({ ...store.getState(), elevation }));
    expect(component(render(LibraryLayout).render(), Outlet)).toBeUndefined();
    const bar = render(WorkspaceSourceBar);
    const tree = bar.render();
    expect(text(tree)).toContain('Loading…');
    expect(text(tree)).not.toContain("Editing this browser's sandbox");
    bar.render();
    expect(openShop).toHaveBeenCalledOnce();
  });
});
