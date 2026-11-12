import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import { cloudStore, fakeDesignApi } from '../../elevation/store/__tests__/helpers/fakeDesignApi.js';
import ProjectPage from '../ProjectPage.jsx';
import { InlineName } from '../PhaseSection.jsx';
import ProjectInfoDialog from '../ProjectInfoDialog.jsx';
import { cloudWorkspaceLoaded, layersLoaded } from '../../elevation/store/elevationSlice.js';
import { cloudSync } from '../../elevation/store/cloudSync.js';
import { loadRoomVersions } from '../../elevation/store/cloudThunks.js';
import { joinProjectPresence } from '../../elevation/store/presenceThunks.js';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn(), useRef: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-router-dom', async (original) => ({ ...await original(), useParams: vi.fn() }));
vi.mock('../../elevation/store/cloudSync.js', () => ({ cloudSync: { flush: vi.fn(), retry: vi.fn() } }));
vi.mock('../../elevation/store/cloudThunks.js', async (original) => {
  const actual = await original();
  return { ...actual, loadRoomVersions: vi.fn(actual.loadRoomVersions) };
});
vi.mock('../../elevation/store/presenceThunks.js', async (original) => {
  const actual = await original();
  return { ...actual, joinProjectPresence: vi.fn(actual.joinProjectPresence) };
});

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => nodes(tree).flatMap(({ props }) => [props?.children].flat())
  .filter((child) => typeof child === 'string' || typeof child === 'number').join(' ');
const button = (tree, label) => nodes(tree).find(({ type, props }) => type === 'button' && text({ props }).trim() === label);
const input = (tree, label) => nodes(tree).find(({ type, props }) => type === 'input' && props['aria-label'] === label);
const change = (node, value) => node.props.onChange({ target: { value } });
const submit = (tree) => nodes(tree).find(({ type }) => type === 'form').props.onSubmit({ preventDefault: vi.fn() });
const settle = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };

let auth;
let api;
let params;
let current;
let renders;
let store;

// Direct JSX-tree rendering, as in workspaceSourceBarUI, with persistent hook
// state and effect cleanup so event-driven reloads can be exercised.
function renderComponent(component, props = {}) {
  const renderer = { states: [], effects: [], cursor: 0, pending: [], tree: null };
  renderer.render = () => {
    current = renderer;
    renderer.cursor = 0;
    renderer.pending = [];
    renderer.tree = component(props);
    renderer.pending.forEach((run) => run());
    return renderer.tree;
  };
  renderer.flush = async () => { await settle(); return renderer.render(); };
  renderer.unmount = () => renderer.effects.forEach((effect) => effect?.cleanup?.());
  renders.push(renderer);
  renderer.render();
  return renderer;
}

function setApi(options, local = false) {
  api = fakeDesignApi(options);
  store = cloudStore(api, { ...auth.permissions }, auth.teamId);
  if (!local) {
    store.dispatch(cloudWorkspaceLoaded({ teamId: auth.teamId, permissions: { ...auth.permissions },
      settings: store.getState().elevation.settings, teamVersion: 0, rows: { profiles: {}, doorDesigns: {} } }));
    store.dispatch(layersLoaded({ project: { id: 42, values: {}, version: 1 } }));
  }
  useDispatch.mockReturnValue(store.dispatch);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  renders = [];
  auth = { teamId: 't', permissions: { view: true, edit: true, manage: false } };
  params = { projectId: '42', roomId: 'r1' };
  useParams.mockImplementation(() => params);
  useSelector.mockImplementation((selector) => selector({ ...store.getState(), auth }));
  cloudSync.flush.mockResolvedValue({ ok: true });
  useState.mockImplementation((initial) => {
    const owner = current;
    const index = owner.cursor++;
    if (!(index in owner.states)) owner.states[index] = initial;
    return [owner.states[index], (value) => {
      owner.states[index] = typeof value === 'function' ? value(owner.states[index]) : value;
    }];
  });
  useRef.mockImplementation((initial) => {
    const owner = current;
    const index = owner.cursor++;
    if (!(index in owner.states)) owner.states[index] = { current: initial };
    return owner.states[index];
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
  setApi({ project: fixture() });
});

afterEach(() => {
  renders.forEach((renderer) => renderer.unmount());
  vi.useRealTimers();
});

function fixture() {
  return {
    project: { est_project_id: 42, est_project_name: 'Smith Kitchen', est_client_name: 'Smith', city: 'Provo' },
    design: { archived_at: null },
    phases: [
      { phase_id: 'p1', name: 'Phase 1', sort: 1, archived_at: null, rooms: [
        { room_id: 'r1', name: 'Kitchen', sort: 1, status: 'approved', last_version: { seq: 2, label: 'KC 10/13/26' }, updated_at: '2026-10-13T18:00:00Z', updated_by_name: 'KC', archived_at: null },
        { room_id: 'r2', name: 'Pantry', sort: 2, status: 'drafting', last_version: null, archived_at: '2026-10-01T18:00:00Z' },
      ] },
      { phase_id: 'p2', name: 'Phase 2', sort: 2, archived_at: '2026-10-02T18:00:00Z', rooms: [] },
    ],
  };
}

const component = (tree, type) => nodes(tree).find((node) => node.type === type);

describe('DB5 c project page', () => {
  it('prefills Edit info and saves only changed trimmed fields, including cleared fields', async () => {
    const page = renderComponent(ProjectPage);
    await page.flush();
    button(page.tree, 'Edit info').props.onClick();
    page.render();
    const dialog = renderComponent(ProjectInfoDialog, component(page.tree, ProjectInfoDialog).props);
    expect(input(dialog.tree, 'Project name').props.value).toBe('Smith Kitchen');
    expect(input(dialog.tree, 'Client').props.value).toBe('Smith');
    expect(input(dialog.tree, 'City').props.value).toBe('Provo');
    expect(button(dialog.tree, 'Save').props.disabled).toBe(true);
    await submit(dialog.tree);
    change(input(dialog.tree, 'Project name'), '  ');
    dialog.render();
    expect(button(dialog.tree, 'Save').props.disabled).toBe(true);
    await submit(dialog.tree);
    expect(api.calls).toHaveLength(1);
    change(input(dialog.tree, 'Project name'), ' Smith Kitchen ');
    change(input(dialog.tree, 'Client'), ' Jones ');
    dialog.render();
    await submit(dialog.tree);
    page.render();
    await page.flush();
    expect(api.calls.slice(1)).toEqual([['updateProjectInfo', 42, { est_client_name: 'Jones' }], ['getProject', 42]]);
    expect(component(page.tree, ProjectInfoDialog)).toBeUndefined();
    const cleared = renderComponent(ProjectInfoDialog, { project: api.db.project.project, onClose: vi.fn(), onSaved: vi.fn() });
    change(input(cleared.tree, 'City'), '  ');
    cleared.render();
    await submit(cleared.tree);
    expect(api.calls.at(-1)).toEqual(['updateProjectInfo', 42, { city: '' }]);
  });

});
