import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { cloudStore, fakeDesignApi } from '../../elevation/store/__tests__/helpers/fakeDesignApi.js';
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

});
