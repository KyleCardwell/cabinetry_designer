import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { cloudStore, fakeDesignApi } from '../../elevation/store/__tests__/helpers/fakeDesignApi.js';
import AppShell from '../../components/layout/AppShell.jsx';
import ProjectsPage from '../ProjectsPage.jsx';
import NewProjectDialog from '../NewProjectDialog.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-router-dom', async (original) => ({ ...await original(), useNavigate: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => nodes(tree).flatMap(({ props }) => [props?.children].flat())
  .filter((child) => typeof child === 'string' || typeof child === 'number').join(' ');
const button = (tree, label) => nodes(tree).find(({ type, props }) => type === 'button' && text({ props }).trim() === label);
const input = (tree, label) => nodes(tree).find(({ type, props }) => type === 'input' && props['aria-label'] === label);
const links = (tree) => nodes(tree).filter(({ type }) => type === Link);
const change = (node, value) => node.props.onChange({ target: { value } });
const submit = (tree) => nodes(tree).find(({ type }) => type === 'form').props.onSubmit({ preventDefault: vi.fn() });
const settle = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };

let auth;
let api;
let navigate;
let current;
let renders;

// Direct JSX-tree rendering, as in workspaceSourceBarUI, with persistent hook
// state and effect cleanup so event-driven reloads and debounce can be exercised.
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

function setApi(options) {
  api = fakeDesignApi(options);
  useDispatch.mockReturnValue(cloudStore(api, auth.permissions, auth.teamId).dispatch);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  renders = [];
  auth = { teamId: 't', permissions: { view: true, edit: true, manage: false } };
  navigate = vi.fn();
  useNavigate.mockReturnValue(navigate);
  useSelector.mockImplementation((selector) => selector({ auth }));
  useState.mockImplementation((initial) => {
    const owner = current;
    const index = owner.cursor++;
    if (!(index in owner.states)) owner.states[index] = initial;
    return [owner.states[index], (value) => {
      owner.states[index] = typeof value === 'function' ? value(owner.states[index]) : value;
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
  setApi({});
});

afterEach(() => {
  renders.forEach((renderer) => renderer.unmount());
  vi.useRealTimers();
});

describe('DB5 b projects page and New project dialog', () => {
  it('renders server order and filters name, client and address locally (anchor 1)', async () => {
    setApi({ projects: [
      { est_project_id: 4, est_project_name: 'Smith Kitchen', est_client_name: 'Smith', street: '12 Elm', city: 'Provo', phase_count: 2, room_count: 5 },
      { est_project_id: 7, est_project_name: 'Lake House', city: 'Orem', phase_count: 1, room_count: 0 },
    ] });
    const page = renderComponent(ProjectsPage);
    await page.flush();
    expect(links(page.tree).map((link) => link.props.to)).toEqual(['/projects/4', '/projects/7']);
    expect(text(links(page.tree)[0])).toContain('12 Elm, Provo');
    expect(text(links(page.tree)[0])).toContain('2  /  5');
    change(input(page.tree, 'Search projects'), 'elm');
    page.render();
    expect(links(page.tree).map((link) => link.props.to)).toEqual(['/projects/4']);
    expect(text(page.tree)).not.toContain('Lake House');
    for (const query of ['SMITH', 'kItChEn', 'pRoVo']) {
      change(input(page.tree, 'Search projects'), query);
      expect(links(page.render())).toHaveLength(1);
    }
    expect(api.calls).toEqual([['listProjects', 't', false]]);
    const shell = renderComponent(AppShell, { children: null });
    const nav = nodes(shell.tree).find(({ type, props }) => type === NavLink && props.children === 'Projects');
    expect(nav.props.to).toBe('/projects');
    expect(nav.props.end).toBeUndefined();
  });

  it('reloads archived projects only on request and shows the tag and local date (anchor 2)', async () => {
    const updatedAt = '2026-10-14T18:00:00Z';
    setApi({ projects: [{ est_project_id: 7, est_project_name: 'Lake House', archived_at: updatedAt, updated_at: updatedAt }] });
    const page = renderComponent(ProjectsPage);
    await page.flush();
    expect(text(page.tree)).toContain('No projects yet.');
    expect(button(page.tree, 'New project')).toBeDefined();
    nodes(page.tree).find(({ type, props }) => type === 'input' && props.type === 'checkbox').props.onChange({ target: { checked: true } });
    page.render();
    await page.flush();
    expect(api.calls).toEqual([['listProjects', 't', false], ['listProjects', 't', true]]);
    expect(text(links(page.tree)[0])).toContain('Archived');
    expect(links(page.tree)[0].props.className).toContain('text-gray-500');
    expect(text(links(page.tree)[0])).toContain(new Date(updatedAt).toLocaleDateString());
  });

  it('creates only trimmed nonempty fields, closes, reloads and navigates (anchor 3)', async () => {
    api.replies.createProject = { ok: true, est_project_id: 42 };
    const page = renderComponent(ProjectsPage);
    await page.flush();
    button(page.tree, 'New project').props.onClick();
    page.render();
    const dialogProps = nodes(page.tree).find(({ type }) => type === NewProjectDialog).props;
    const dialog = renderComponent(NewProjectDialog, dialogProps);
    expect(button(dialog.tree, 'Create').props.disabled).toBe(true);
    change(input(dialog.tree, 'Project name'), '   ');
    dialog.render();
    expect(button(dialog.tree, 'Create').props.disabled).toBe(true);
    await submit(dialog.tree);
    expect(api.calls).toHaveLength(1);
    change(input(dialog.tree, 'Project name'), '  Smith Bath  ');
    change(input(dialog.tree, 'City'), 'Provo');
    change(input(dialog.tree, 'Street'), '   ');
    dialog.render();
    expect(button(dialog.tree, 'Create').props.disabled).toBe(false);
    await submit(dialog.tree);
    expect(api.calls[1]).toEqual(['createProject', { teamId: 't', project: { est_project_name: 'Smith Bath', city: 'Provo' },
      phaseName: 'Phase 1', estProjectId: null, roomName: null, roomDocument: null, schemaVersion: null }]);
    expect(navigate).toHaveBeenCalledWith('/projects/42');
    page.render();
    await page.flush();
    expect(nodes(page.tree).some(({ type }) => type === NewProjectDialog)).toBe(false);
    expect(api.calls[2]).toEqual(['listProjects', 't', false]);
  });

  it('loads estimates on tab opening, debounces typing and attaches row 17 (anchor 4)', async () => {
    setApi({ attachableProjects: [{ est_project_id: 17, est_project_name: 'Smith Bath', est_client_name: 'Smith', street: '12 Elm', city: 'Provo' }] });
    const onCreated = vi.fn();
    const dialog = renderComponent(NewProjectDialog, { onClose: vi.fn(), onCreated });
    button(dialog.tree, 'From an estimate project').props.onClick();
    dialog.render();
    await dialog.flush();
    expect(api.calls).toEqual([['listAttachableProjects', 't', '']]);
    button(dialog.tree, 'From an estimate project').props.onClick();
    dialog.render();
    expect(text(button(dialog.tree, 'Smith Bath Smith 12 Elm, Provo'))).toContain('12 Elm, Provo');
    expect(button(dialog.tree, 'Add to designer').props.disabled).toBe(true);
    change(input(dialog.tree, 'Search estimate projects'), 'sm');
    dialog.render();
    await vi.advanceTimersByTimeAsync(200);
    change(input(dialog.tree, 'Search estimate projects'), 'smi');
    dialog.render();
    await vi.advanceTimersByTimeAsync(299);
    expect(api.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await dialog.flush();
    expect(api.calls[1]).toEqual(['listAttachableProjects', 't', 'smi']);
    button(dialog.tree, 'Smith Bath Smith 12 Elm, Provo').props.onClick();
    dialog.render();
    expect(button(dialog.tree, 'Smith Bath Smith 12 Elm, Provo').props['aria-pressed']).toBe(true);
    expect(button(dialog.tree, 'Add to designer').props.disabled).toBe(false);
    await submit(dialog.tree);
    expect(api.calls[2]).toEqual(['createProject', { teamId: 't', estProjectId: 17, phaseName: 'Phase 1',
      project: null, roomName: null, roomDocument: null, schemaVersion: null }]);
    expect(onCreated).toHaveBeenCalledWith(17);
  });

  it('loads view-only lists, hides edit actions, and blocks calls without view or a team (anchor 5)', async () => {
    auth.permissions.edit = false;
    const page = renderComponent(ProjectsPage);
    await page.flush();
    expect(button(page.tree, 'New project')).toBeUndefined();
    expect(api.calls).toEqual([['listProjects', 't', false]]);
    expect(renderComponent(NewProjectDialog).tree).toBeNull();
    api.calls.length = 0;
    auth.permissions.view = false;
    page.render();
    await page.flush();
    expect(text(page.tree)).toBe("You don't have permission to view designs.");
    expect(renderComponent(NewProjectDialog).tree).toBeNull();
    expect(api.calls).toEqual([]);
    auth.teamId = null;
    page.render();
    await page.flush();
    expect(text(page.tree)).toBe('You are not on a team.');
    expect(api.calls).toEqual([]);
  });

  it('shows load failures and retries only on request on the page and in the dialog', async () => {
    api.failNext = { ok: false, message: 'List failed' };
    const page = renderComponent(ProjectsPage);
    await page.flush();
    expect(text(nodes(page.tree).find(({ props }) => props.role === 'alert'))).toContain('List failed');
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.calls).toHaveLength(1);
    button(page.tree, 'Retry').props.onClick();
    page.render();
    await page.flush();
    expect(api.calls).toHaveLength(2);
    expect(text(page.tree)).toContain('No projects yet.');
    api.failNext = { ok: false, message: 'Estimate list failed' };
    const dialog = renderComponent(NewProjectDialog, { onClose: vi.fn(), onCreated: vi.fn() });
    button(dialog.tree, 'From an estimate project').props.onClick();
    dialog.render();
    await dialog.flush();
    expect(text(nodes(dialog.tree).find(({ props }) => props.role === 'alert'))).toContain('Estimate list failed');
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.calls).toHaveLength(3);
    button(dialog.tree, 'Retry').props.onClick();
    dialog.render();
    await dialog.flush();
    expect(api.calls).toHaveLength(4);
    expect(button(dialog.tree, 'Retry')).toBeUndefined();
  });

  it('keeps failed creates in the dialog without reload and closes on Cancel or Escape without a call', async () => {
    const onClose = vi.fn();
    const onCreated = vi.fn();
    const dialog = renderComponent(NewProjectDialog, { onClose, onCreated });
    button(dialog.tree, 'Cancel').props.onClick();
    dialog.tree.props.onKeyDown({ key: 'Escape', stopPropagation: vi.fn() });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(api.calls).toEqual([]);
    change(input(dialog.tree, 'Project name'), 'Bath');
    dialog.render();
    api.failNext = { ok: false, message: 'Create failed' };
    await submit(dialog.tree);
    dialog.render();
    expect(text(nodes(dialog.tree).find(({ props }) => props.role === 'alert'))).toContain('Create failed');
    expect(onCreated).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.calls.map(([method]) => method)).toEqual(['createProject']);
    expect(button(dialog.tree, 'Create').props.disabled).toBe(false);
  });

  it('ignores stale search replies, debounces clearing and cancels pending search on closing', async () => {
    let resolveOld;
    api.listAttachableProjects = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValue({ ok: true, rows: [{ est_project_id: 17, est_project_name: 'Smith' }] });
    const dialog = renderComponent(NewProjectDialog, { onClose: vi.fn(), onCreated: vi.fn() });
    button(dialog.tree, 'From an estimate project').props.onClick();
    dialog.render();
    await settle();
    change(input(dialog.tree, 'Search estimate projects'), 'smi');
    dialog.render();
    await vi.advanceTimersByTimeAsync(300);
    await dialog.flush();
    resolveOld({ ok: true, rows: [{ est_project_id: 4, est_project_name: 'Old reply' }] });
    await dialog.flush();
    expect(text(dialog.tree)).toContain('Smith');
    expect(text(dialog.tree)).not.toContain('Old reply');
    change(input(dialog.tree, 'Search estimate projects'), '');
    dialog.render();
    await vi.advanceTimersByTimeAsync(299);
    expect(api.listAttachableProjects).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await dialog.flush();
    expect(api.listAttachableProjects).toHaveBeenLastCalledWith('t', '');
    change(input(dialog.tree, 'Search estimate projects'), 'cancelled');
    dialog.render();
    dialog.unmount();
    await vi.advanceTimersByTimeAsync(300);
    expect(api.listAttachableProjects).toHaveBeenCalledTimes(3);
  });
});
