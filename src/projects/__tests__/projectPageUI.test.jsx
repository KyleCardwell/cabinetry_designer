import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
import { cloudStore, fakeDesignApi } from '../../elevation/store/__tests__/helpers/fakeDesignApi.js';
import ProjectPage from '../ProjectPage.jsx';
import PhaseSection, { InlineName } from '../PhaseSection.jsx';
import VersionList from '../VersionList.jsx';
import ProjectInfoDialog from '../ProjectInfoDialog.jsx';
import CopyRoomDialog from '../CopyRoomDialog.jsx';
import ProjectSettingsPanel from '../ProjectSettingsPanel.jsx';
import SettingGroups from '../../elevation/components/SettingGroups.jsx';
import { groupsFor } from '../../elevation/model/settingGroups.js';
import WorkspaceSourceBar from '../../library/WorkspaceSourceBar.jsx';
import { cloudSaveStatus, cloudWorkspaceLoaded, layersLoaded } from '../../elevation/store/elevationSlice.js';
import { cloudSync } from '../../elevation/store/cloudSync.js';
import { loadRoomVersions } from '../../elevation/store/cloudThunks.js';
import { joinProjectPresence } from '../../elevation/store/presenceThunks.js';
import { presenceEntries, presenceJoining } from '../../elevation/store/presenceSlice.js';

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
const links = (tree) => nodes(tree).filter(({ type }) => type === Link);
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
const phaseNodes = (tree) => nodes(tree).filter((node) => node.type === PhaseSection);
const phase = (page, id = 'p1') => renderComponent(PhaseSection, phaseNodes(page.tree).find((node) => node.props.phase.phase_id === id).props);
const row = (tree, name) => nodes(tree).find((node) => node.type === 'tr' && text(node).includes(name));
const checkbox = (tree) => nodes(tree).find((node) => node.type === 'input' && node.props.type === 'checkbox');
const alert = (tree) => nodes(tree).find((node) => node.props.role === 'alert');
const key = (node, value) => node.props.onKeyDown({ key: value, preventDefault: vi.fn(), stopPropagation: vi.fn() });

describe('DB5 d project and phase settings', () => {
  it('awaits a sandbox flush before opening shop data, then loads project 42 with no phase (anchor 3)', async () => {
    setApi({ project: fixture() }, true);
    let finishFlush;
    cloudSync.flush.mockReturnValueOnce(new Promise((resolve) => { finishFlush = resolve; }));
    const page = renderComponent(ProjectPage);
    await page.flush();
    expect(cloudSync.flush).toHaveBeenCalledOnce();
    expect(store.getState().elevation.source).toBe('local');
    expect(api.calls).toEqual([['getProject', 42]]);
    finishFlush({ ok: true });
    await page.flush();
    expect(api.calls.slice(1, 4)).toEqual([['loadTeamSettings'], ['listProfiles'], ['listDoorDesigns']]);
    await page.flush();
    expect(api.calls.at(-1)).toEqual(['getProject', 42]);
    expect(store.getState().elevation.layers).toEqual({ project: { id: 42, values: {} }, phase: null });
    expect(component(page.tree, ProjectSettingsPanel).props.level).toBe('project');
    expect(component(page.tree, WorkspaceSourceBar).props).toMatchObject({ allowSwitch: false, manageNote: false });
  });

  it('flushes before switching from Phase 1 to Phase 2, opens only one phase, and flushes before closing (anchor 4)', async () => {
    api.db.project.phases[1].archived_at = null;
    const page = renderComponent(ProjectPage);
    await page.flush();
    await button(phase(page).tree, 'Settings').props.onClick();
    page.render();
    await page.flush();
    expect(store.getState().elevation.layers.phase.id).toBe('p1');
    expect(component(phase(page).tree, ProjectSettingsPanel).props.level).toBe('phase');
    const callsBefore = api.calls.length;
    let finishFlush;
    cloudSync.flush.mockReturnValueOnce(new Promise((resolve) => { finishFlush = resolve; }));
    const switching = button(phase(page, 'p2').tree, 'Settings').props.onClick();
    page.render();
    await page.flush();
    expect(store.getState().elevation.layers.phase.id).toBe('p1');
    expect(api.calls).toHaveLength(callsBefore);
    finishFlush({ ok: true });
    await switching;
    page.render();
    await page.flush();
    expect(api.calls.slice(callsBefore)).toEqual([['getProject', 42]]);
    expect(store.getState().elevation.layers).toMatchObject({ project: { id: 42 }, phase: { id: 'p2' } });
    expect(component(phase(page).tree, ProjectSettingsPanel)).toBeUndefined();
    expect(component(phase(page, 'p2').tree, ProjectSettingsPanel).props.level).toBe('phase');
    cloudSync.flush.mockResolvedValueOnce({ ok: false });
    await button(phase(page, 'p2').tree, 'Settings').props.onClick();
    await page.flush();
    expect(component(phase(page, 'p2').tree, ProjectSettingsPanel)).toBeDefined();
    await button(phase(page, 'p2').tree, 'Settings').props.onClick();
    page.render();
    await page.flush();
    expect(store.getState().elevation.layers.phase).toBeNull();
    expect(phaseNodes(page.tree).every(({ props }) => !props.settingsOpen)).toBe(true);
  });

  it('counts nested overrides in collapsed panels and groups, and disables settings without edit (anchors 5 and 6)', () => {
    store.dispatch(layersLoaded({
      project: { id: 42, values: { baseDepth: 25, insetFrame: { stile: 1.75 } } },
      phase: { id: 'p1', values: {} },
    }));
    for (const level of ['project', 'phase']) {
      const panel = renderComponent(ProjectSettingsPanel, { level });
      const header = nodes(panel.tree).find(({ type }) => type === 'button');
      expect(header.props['aria-expanded']).toBe(false);
      expect(text(header).replace(/\s+/g, ' ')).toContain(level === 'project' ? '2 overridden' : '0 overridden');
      expect(component(panel.tree, SettingGroups)).toBeUndefined();
      header.props.onClick();
      panel.render();
      expect(nodes(panel.tree).find(({ type }) => type === 'fieldset').props.disabled).toBe(false);
      const groups = renderComponent(SettingGroups, component(panel.tree, SettingGroups).props);
      expect(nodes(groups.tree).filter(({ type }) => type === 'button')).toHaveLength(11);
      expect(groupsFor(level).map(({ keys }) => keys.length)).toEqual([11, 9, 11, 9, 6, 15, 7, 7, 17, 7, 6]);
      if (level === 'project') {
        const headers = nodes(groups.tree).filter(({ type }) => type === 'button').map((node) => text(node).replace(/\s+/g, ' '));
        expect(headers[0]).toContain('Cabinets & depths 1 overridden');
        expect(headers[4]).toContain('Inset face frame 1 overridden');
      }
      auth.permissions.edit = false;
      panel.render();
      expect(nodes(panel.tree).find(({ type }) => type === 'fieldset').props.disabled).toBe(true);
      auth.permissions.edit = true;
    }
    expect(text(renderComponent(WorkspaceSourceBar).tree)).toContain('team-management permission');
    const bar = renderComponent(WorkspaceSourceBar, { allowSwitch: false, manageNote: false });
    expect(text(bar.tree)).toContain('All changes saved');
    expect(text(bar.tree)).not.toContain('team-management permission');
  });

  it('shows layer load failures without automatic retries and reloads layers after Reload shop data clears them', async () => {
    store.dispatch(layersLoaded({}));
    vi.spyOn(api, 'getProject').mockResolvedValueOnce({ ok: false, message: 'Settings unavailable' });
    const page = renderComponent(ProjectPage);
    await page.flush();
    expect(text(alert(page.tree))).toContain('Settings unavailable');
    const attempts = api.getProject.mock.calls.length;
    await page.flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.getProject).toHaveBeenCalledTimes(attempts);
    button(page.tree, 'Retry').props.onClick();
    page.render();
    await page.flush();
    expect(component(page.tree, ProjectSettingsPanel)).toBeDefined();
    store.dispatch(cloudSaveStatus({ conflict: { what: 'Project settings', updatedByName: 'Other' } }));
    const bar = renderComponent(WorkspaceSourceBar, { allowSwitch: false, manageNote: false });
    await button(bar.tree, 'Reload shop data').props.onClick();
    expect(store.getState().elevation.layers.project).toBeNull();
    page.render();
    await page.flush();
    expect(store.getState().elevation.layers.project.id).toBe(42);
    expect(api.getProject).toHaveBeenCalledTimes(attempts + 2);
    expect(text(bar.render())).toContain('All changes saved');
  });
});

describe('DB5 c project page', () => {
  it('expands Last issued into a full-width version list below the room for viewers (DB8b f anchor 5)', async () => {
    auth.permissions.edit = false;
    params.projectId = '12';
    const project = fixture();
    project.project.est_project_id = 12;
    project.phases[0].rooms[0].last_version = { seq: 2, label: 'KC 10/15/26' };
    project.phases[0].rooms[1].archived_at = null;
    setApi({ project });
    api.db.versions.push({ version_id: 'v9', room_id: 'r1', seq: 2, label: 'KC 10/15/26', issued_by_name: 'Jane', issued_at: '2026-10-15T18:30:00Z', note: 'Moved sink' });
    const page = renderComponent(ProjectPage);
    await page.flush();
    const section = phase(page);
    const issuedButton = button(section.tree, 'KC 10/15/26 (v2)');
    expect(issuedButton.props['aria-expanded']).toBe(false);
    expect(component(section.tree, VersionList)).toBeUndefined();
    expect(loadRoomVersions).not.toHaveBeenCalled();
    const pantry = row(section.tree, 'Pantry');
    expect(nodes(pantry).filter((node) => node.type === 'td')[2].props.children).toBe('—');
    expect(component(pantry, 'button')).toBeUndefined();
    issuedButton.props.onClick();
    section.render();
    expect(button(section.tree, 'KC 10/15/26 (v2)').props['aria-expanded']).toBe(true);
    const rows = nodes(section.tree).filter((node) => node.type === 'tr');
    const kitchenIndex = rows.indexOf(row(section.tree, 'Kitchen'));
    const expanded = rows[kitchenIndex + 1];
    expect(component(expanded, 'td').props.colSpan).toBe(nodes(section.tree).filter((node) => node.type === 'th').length);
    const child = component(expanded, VersionList);
    expect(child.props).toEqual({ projectId: 12, roomId: 'r1' });
    const list = renderComponent(VersionList, child.props);
    await list.flush();
    expect(loadRoomVersions).toHaveBeenCalledOnce();
    expect(loadRoomVersions).toHaveBeenCalledWith('r1');
    expect(links(list.tree)[0].props.to).toBe('/projects/12/rooms/r1/versions/v9');
    expect(api.calls).toContainEqual(['listRoomVersions', 'r1']);
    button(section.tree, 'KC 10/15/26 (v2)').props.onClick();
    expect(component(section.render(), VersionList)).toBeUndefined();
    expect(button(section.tree, 'KC 10/15/26 (v2)').props['aria-expanded']).toBe(false);
  });

  it('loads the project header and live phases and rooms with status, issued label, date and room link (anchor 1)', async () => {
    const page = renderComponent(ProjectPage);
    await page.flush();
    expect(api.calls).toEqual([['getProject', 42]]);
    expect(text(page.tree)).toContain('Smith Kitchen');
    expect(text(page.tree)).toContain('Smith');
    expect(text(page.tree)).toContain('Provo');
    expect(phaseNodes(page.tree).map((node) => node.props.phase.name)).toEqual(['Phase 1']);
    const section = phase(page);
    expect(text(section.tree)).toContain('Kitchen');
    expect(text(section.tree)).not.toContain('Pantry');
    expect(text(section.tree)).toContain('Approved');
    expect(text(section.tree)).toContain('KC 10/13/26');
    expect(text(section.tree).replace(/\s+/g, ' ')).toContain(`${new Date('2026-10-13T18:00:00Z').toLocaleDateString()} · KC`);
    expect(links(section.tree)[0].props.to).toBe('/projects/42/rooms/r1');
    expect(button(page.tree, 'Settings')).toBeUndefined();
    expect(button(section.tree, 'Settings').props['aria-expanded']).toBe(false);
  });

  it('shows archived phases and rooms, greys their rows, and restores Pantry then reloads (anchor 2)', async () => {
    api.db.project.phases.reverse();
    api.db.project.phases.find((entry) => entry.phase_id === 'p1').rooms.reverse();
    const page = renderComponent(ProjectPage);
    await page.flush();
    checkbox(page.tree).props.onChange({ target: { checked: true } });
    page.render();
    expect(api.calls).toHaveLength(1);
    expect(phaseNodes(page.tree).map((node) => node.props.phase.name)).toEqual(['Phase 1', 'Phase 2']);
    const section = phase(page);
    expect(links(section.tree).map((link) => text(link))).toEqual(['Kitchen', 'Pantry']);
    const pantry = row(section.tree, 'Pantry');
    expect(text(pantry)).toContain('—');
    expect(text(pantry)).toContain('Drafting');
    expect(pantry.props.className).toContain('text-gray-500');
    expect(button(pantry, 'Copy')).toBeUndefined();
    expect(component(pantry, InlineName).props.editable).toBe(false);
    const archivedPhase = phase(page, 'p2');
    expect(button(archivedPhase.tree, 'Restore')).toBeDefined();
    expect(button(archivedPhase.tree, '+ Room')).toBeUndefined();
    const inheritedArchive = renderComponent(PhaseSection, {
      ...phaseNodes(page.tree)[1].props,
      phase: { ...phaseNodes(page.tree)[1].props.phase, rooms: [fixture().phases[0].rooms[0]] },
    });
    const inheritedRoom = row(inheritedArchive.tree, 'Kitchen');
    expect(inheritedRoom.props.className).toContain('text-gray-500');
    expect(component(inheritedRoom, InlineName).props.editable).toBe(false);
    expect(button(inheritedRoom, 'Copy')).toBeUndefined();
    await button(pantry, 'Restore').props.onClick();
    page.render();
    await page.flush();
    expect(api.calls.slice(1)).toEqual([
      ['updateRoomInfo', 'r2', { name: null, sort: null, archived: false }], ['getProject', 42],
    ]);
    expect(button(row(phase(page).tree, 'Pantry'), 'Archive')).toBeDefined();
  });

  it('counts archived names for immediate Room 3 and Phase 3 creation and reloads after each (anchor 3)', async () => {
    const page = renderComponent(ProjectPage);
    await page.flush();
    await button(phase(page).tree, '+ Room').props.onClick();
    page.render();
    await page.flush();
    expect(api.calls[1]).toEqual(['createRoom', 'p1', 'Room 3', expect.objectContaining({ name: 'Room 3', id: expect.any(String) }), 4]);
    expect(api.calls[2]).toEqual(['getProject', 42]);
    await button(page.tree, '+ Phase').props.onClick();
    page.render();
    await page.flush();
    expect(api.calls.slice(3)).toEqual([['createPhase', 42, 'Phase 3'], ['getProject', 42]]);
    expect(phaseNodes(page.tree).map((node) => node.props.phase.name)).toEqual(['Phase 1', 'Phase 3']);
  });

  it('copies Kitchen with its default name and own live phase, then closes and reloads (anchor 4)', async () => {
    const page = renderComponent(ProjectPage);
    await page.flush();
    button(phase(page).tree, 'Copy').props.onClick();
    page.render();
    const dialog = renderComponent(CopyRoomDialog, component(page.tree, CopyRoomDialog).props);
    expect(input(dialog.tree, 'Name').props.value).toBe('Kitchen copy');
    const select = nodes(dialog.tree).find((node) => node.type === 'select');
    expect(select.props.value).toBe('p1');
    expect(nodes(select).filter((node) => node.type === 'option').map((node) => [node.props.value, text(node)])).toEqual([['p1', 'Phase 1']]);
    await submit(dialog.tree);
    page.render();
    await page.flush();
    expect(api.calls.slice(1)).toEqual([['copyRoom', 'r1', 'p1', 'Kitchen copy'], ['getProject', 42]]);
    expect(component(page.tree, CopyRoomDialog)).toBeUndefined();
    expect(api.db.project.phases[0].rooms.at(-1)).toMatchObject({ name: 'Kitchen copy', status: 'drafting', last_version: null });
  });

  it('renames phases and rooms on Enter or blur, trims, and ignores empty, unchanged and cancelled edits (anchor 5)', async () => {
    const page = renderComponent(ProjectPage);
    await page.flush();
    const section = phase(page);
    const rename = renderComponent(InlineName, component(section.tree, InlineName).props);
    function start(value) {
      button(rename.tree, 'Rename').props.onClick();
      rename.render();
      change(input(rename.tree, 'Phase name'), value);
      rename.render();
      return input(rename.tree, 'Phase name');
    }
    key(start('  '), 'Enter');
    rename.render();
    expect(api.calls).toHaveLength(1);
    start(' Phase 1 ').props.onBlur();
    rename.render();
    expect(api.calls).toHaveLength(1);
    const cancelled = start('Cancelled');
    key(cancelled, 'Escape');
    cancelled.props.onBlur();
    rename.render();
    expect(api.calls).toHaveLength(1);
    const committed = start(' Main floor ');
    key(committed, 'Enter');
    committed.props.onBlur();
    await settle();
    page.render();
    await page.flush();
    expect(api.calls.slice(1)).toEqual([['updatePhase', 'p1', { name: 'Main floor', sort: null, archived: null }], ['getProject', 42]]);
    const kitchen = row(phase(page).tree, 'Kitchen');
    const roomName = renderComponent(InlineName, component(kitchen, InlineName).props);
    button(roomName.tree, 'Rename').props.onClick();
    roomName.render();
    change(input(roomName.tree, 'Room name'), ' Pantry ');
    roomName.render();
    input(roomName.tree, 'Room name').props.onBlur();
    await settle();
    page.render();
    await page.flush();
    expect(api.calls.slice(3)).toEqual([['updateRoomInfo', 'r1', { name: 'Pantry', sort: null, archived: null }], ['getProject', 42]]);
  });

  it('prefills Edit info and saves only changed trimmed fields, including cleared fields (anchor 6)', async () => {
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

  it('shows a red write-failure banner and never reloads or retries the failed archive (anchor 7)', async () => {
    const page = renderComponent(ProjectPage);
    await page.flush();
    api.failNext = { ok: false, reason: 'permission', message: 'Not allowed' };
    await button(row(phase(page).tree, 'Kitchen'), 'Archive').props.onClick();
    await page.flush();
    expect(text(alert(page.tree))).toBe('Not allowed');
    expect(alert(page.tree).props.className).toContain('text-red-200');
    expect(button(page.tree, 'Retry')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.calls).toEqual([['getProject', 42], ['updateRoomInfo', 'r1', { name: null, sort: null, archived: true }]]);
    expect(text(phase(page).tree)).toContain('Kitchen');
  });

  it('shows the missing-project message with a Projects link (anchor 8)', async () => {
    setApi({});
    const page = renderComponent(ProjectPage);
    await page.flush();
    expect(text(page.tree)).toContain('That project is not in the designer.');
    expect(links(page.tree)[0].props.to).toBe('/projects');
    expect(button(page.tree, '+ Phase')).toBeUndefined();
  });

  it('keeps view-only pages read-only and makes no calls without a team or view permission', async () => {
    auth.permissions.edit = false;
    const page = renderComponent(ProjectPage);
    await page.flush();
    expect(button(page.tree, 'Edit info')).toBeUndefined();
    expect(button(page.tree, 'Archive project')).toBeUndefined();
    expect(button(page.tree, '+ Phase')).toBeUndefined();
    const section = phase(page);
    expect(nodes(section.tree).filter((node) => node.type === 'button').map(text)).toEqual(['Settings', 'KC 10/13/26 (v2)']);
    expect(nodes(section.tree).filter((node) => node.type === InlineName).every((node) => !node.props.editable)).toBe(true);
    expect(renderComponent(ProjectInfoDialog, { project: fixture().project }).tree).toBeNull();
    expect(renderComponent(CopyRoomDialog, { room: fixture().phases[0].rooms[0] }).tree).toBeNull();
    api.calls.length = 0;
    auth.permissions.view = false;
    await page.flush();
    expect(text(page.tree)).toBe("You don't have permission to view designs.");
    expect(api.calls).toEqual([]);
    auth.teamId = null;
    await page.flush();
    expect(text(page.tree)).toBe('You are not on a team.');
    expect(api.calls).toEqual([]);
  });

  it('archives and restores projects and phases and hides archived rooms without confirmation', async () => {
    const page = renderComponent(ProjectPage);
    await page.flush();
    for (const label of ['Archive project', 'Restore project']) {
      await button(page.tree, label).props.onClick();
      page.render();
      await page.flush();
      if (label === 'Archive project') expect(text(page.tree)).toContain('Archived');
    }
    expect(api.calls.slice(1, 5)).toEqual([
      ['archiveProject', 42, true], ['getProject', 42], ['archiveProject', 42, false], ['getProject', 42],
    ]);
    await button(row(phase(page).tree, 'Kitchen'), 'Archive').props.onClick();
    page.render();
    await page.flush();
    expect(text(phase(page).tree)).not.toContain('Kitchen');
    await button(phase(page).tree, 'Archive').props.onClick();
    page.render();
    await page.flush();
    expect(phaseNodes(page.tree)).toHaveLength(0);
    checkbox(page.tree).props.onChange({ target: { checked: true } });
    page.render();
    const archived = phase(page);
    expect(button(archived.tree, '+ Room')).toBeUndefined();
    expect(button(archived.tree, 'Copy')).toBeUndefined();
    expect(component(archived.tree, InlineName).props.editable).toBe(false);
    await button(archived.tree, 'Restore').props.onClick();
    page.render();
    await page.flush();
    expect(api.calls.at(-2)).toEqual(['updatePhase', 'p1', { name: null, sort: null, archived: false }]);
    expect(api.calls.at(-1)).toEqual(['getProject', 42]);
  });

  it('shows load failures with explicit Retry and ignores stale route replies', async () => {
    const oldGet = api.getProject;
    api.getProject = vi.fn().mockResolvedValueOnce({ ok: false, message: 'Load failed' }).mockImplementation(oldGet);
    const page = renderComponent(ProjectPage);
    await page.flush();
    expect(text(alert(page.tree))).toContain('Load failed');
    expect(text(page.tree)).not.toContain('That project is not in the designer.');
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.getProject).toHaveBeenCalledTimes(1);
    button(page.tree, 'Retry').props.onClick();
    page.render();
    await page.flush();
    expect(api.getProject).toHaveBeenCalledTimes(2);
    expect(text(page.tree)).toContain('Smith Kitchen');
    let resolveOld;
    const oldReply = new Promise((resolve) => { resolveOld = resolve; });
    api.getProject.mockImplementation((id) => id === 43 ? oldReply : Promise.resolve({ ok: true, project: null }));
    params.projectId = '43';
    page.render();
    await settle();
    params.projectId = '44';
    page.render();
    await page.flush();
    resolveOld({ ok: true, project: fixture() });
    await page.flush();
    expect(text(page.tree)).toContain('That project is not in the designer.');
    expect(text(page.tree)).not.toContain('Smith Kitchen');
  });

  it('keeps dialog failures inside the dialog and supports cancellation and copying to another live phase', async () => {
    const project = fixture();
    project.phases.push({ phase_id: 'p3', name: 'Phase 3', sort: 3, rooms: [], archived_at: null });
    setApi({ project });
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const info = renderComponent(ProjectInfoDialog, { project: project.project, onClose, onSaved });
    button(info.tree, 'Cancel').props.onClick();
    key(info.tree, 'Escape');
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(api.calls).toEqual([]);
    change(input(info.tree, 'Client'), 'Jones');
    info.render();
    api.failNext = { ok: false, message: 'Info failed' };
    await submit(info.tree);
    info.render();
    expect(text(alert(info.tree))).toBe('Info failed');
    expect(onSaved).not.toHaveBeenCalled();
    const onCopied = vi.fn();
    const copy = renderComponent(CopyRoomDialog, { room: project.phases[0].rooms[0], phaseId: 'p1', phases: project.phases, onClose, onCopied });
    button(copy.tree, 'Cancel').props.onClick();
    key(copy.tree, 'Escape');
    expect(onClose).toHaveBeenCalledTimes(4);
    change(input(copy.tree, 'Name'), '   ');
    copy.render();
    expect(button(copy.tree, 'Copy').props.disabled).toBe(true);
    await submit(copy.tree);
    expect(api.calls).toHaveLength(1);
    change(input(copy.tree, 'Name'), ' Kitchen upstairs ');
    change(nodes(copy.tree).find((node) => node.type === 'select'), 'p3');
    copy.render();
    api.failNext = { ok: false, message: 'Copy failed' };
    await submit(copy.tree);
    copy.render();
    expect(text(alert(copy.tree))).toBe('Copy failed');
    expect(onCopied).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.calls.map(([method]) => method)).toEqual(['updateProjectInfo', 'copyRoom']);
    await submit(copy.tree);
    expect(api.calls.at(-1)).toEqual(['copyRoom', 'r1', 'p3', 'Kitchen upstairs']);
    expect(onCopied).toHaveBeenCalledOnce();
  });

});

describe('DB6b f project presence', () => {
  it('joins project 42 on mount with team and view permission, including view-only access (anchor 1)', async () => {
    auth.permissions.edit = false;
    const page = renderComponent(ProjectPage);
    await page.flush();
    expect(joinProjectPresence).toHaveBeenCalledOnce();
    expect(joinProjectPresence).toHaveBeenCalledWith(42);
    params.projectId = '43';
    await page.flush();
    expect(joinProjectPresence).toHaveBeenLastCalledWith(43);
  });

  it.each(['view', 'team'])('does not join without %s (anchor 2)', async (missing) => {
    if (missing === 'view') auth.permissions.view = false;
    else auth.teamId = null;
    const page = renderComponent(ProjectPage);
    await page.flush();
    expect(joinProjectPresence).not.toHaveBeenCalled();
    expect(api.calls).toEqual([]);
  });

  it('shows live editing and viewing chips only on the matching room, excluding this tab (anchor 3)', async () => {
    const project = fixture();
    project.phases[0].rooms[0].room_id = 'rm-1';
    project.phases[0].rooms[1].archived_at = null;
    setApi({ project });
    store.dispatch(presenceJoining({ estProjectId: 42, selfKey: 'self' }));
    store.dispatch(presenceEntries([
      { key: 'jane', roomId: 'rm-1', userName: 'Jane', readOnly: false },
      { key: 'self', roomId: 'r2', userName: 'Me', readOnly: false },
    ]));
    const page = renderComponent(ProjectPage);
    await page.flush();
    expect(phaseNodes(page.tree)[0].props.openRooms['rm-1']).toMatchObject([{ userName: 'Jane', readOnly: false }]);
    let section = phase(page);
    expect(text(row(section.tree, 'Kitchen'))).toContain('Open · Jane');
    expect(text(row(section.tree, 'Pantry'))).not.toMatch(/Open ·|Viewing ·/);
    expect(nodes(row(section.tree, 'Kitchen')).find((node) => node.type === 'span' && text(node) === 'Open · Jane').props.className).toContain('bg-amber-950');

    store.dispatch(presenceEntries([
      { key: 'bob', roomId: 'rm-1', userName: 'Bob', readOnly: true },
      { key: 'jane', roomId: 'rm-1', userName: 'Jane', readOnly: false },
    ]));
    page.render();
    section = phase(page);
    const chips = nodes(row(section.tree, 'Kitchen')).filter((node) => node.type === 'span' && /^(Open|Viewing) ·/.test(text(node)));
    expect(chips.map(text)).toEqual(['Open · Jane', 'Viewing · Bob']);
    expect(chips[1].props.className).toContain('bg-gray-700');
    store.dispatch(presenceEntries([]));
    page.render();
    expect(text(phase(page).tree)).not.toMatch(/Open ·|Viewing ·/);
  });
});
