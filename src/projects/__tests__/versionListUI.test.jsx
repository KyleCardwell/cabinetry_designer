import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import VersionList from '../VersionList.jsx';
import RoomHeader from '../RoomHeader.jsx';
import { VersionHeader } from '../VersionPage.jsx';
import { loadRoomVersions } from '../../elevation/store/cloudThunks.js';

vi.mock('react', async (original) => ({ ...await original(), useEffect: vi.fn(), useRef: vi.fn(), useState: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('../../elevation/DesignerEditor.jsx', () => ({ default: 'designer-editor' }));
vi.mock('../../elevation/store/cloudThunks.js', async (original) => ({ ...await original(), loadRoomVersions: vi.fn() }));

const versions = [
  { versionId: 'v9', seq: 2, label: 'KC 10/15/26', issuedByName: 'Jane', issuedAt: '2026-10-15T18:30:00Z', note: 'Moved sink' },
  { versionId: 'v8', seq: 1, label: 'KC 10/1/26', issuedByName: null, issuedAt: '2026-10-01T18:30:00Z', note: null },
];

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
let state;

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

beforeEach(() => {
  vi.clearAllMocks();
  renders = [];
  state = { elevation: {
    source: 'cloud', rooms: [{ id: 'r1', name: 'Kitchen' }],
    cloud: { permissions: { view: true, edit: false }, pending: 0, room: {
      readOnly: true, status: 'drafting', lastVersion: null, issued: versions[0],
    } },
  } };
  useSelector.mockImplementation((select) => select(state));
  useDispatch.mockReturnValue(vi.fn((action) => action()));
  loadRoomVersions.mockImplementation(() => async () => ({ ok: true, versions: structuredClone(versions) }));
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

afterEach(() => renders.forEach((renderer) => renderer.unmount()));

describe('DB8b f version lists', () => {
  it('loads r1 on mount and shows newest-first links, author fallback, dates and notes (anchor 1)', async () => {
    const list = renderComponent(VersionList, { projectId: '12', roomId: 'r1' });
    expect(text(list.tree)).toBe('Loading versions…');
    expect(list.tree.props.role).toBe('status');
    await list.flush();
    expect(loadRoomVersions).toHaveBeenCalledOnce();
    expect(loadRoomVersions).toHaveBeenCalledWith('r1');
    const rows = nodes(list.tree).filter((node) => node.type === 'li');
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => text(component(row, Link)))).toEqual(['v2 · KC 10/15/26', 'v1 · KC 10/1/26']);
    expect(rows.map((row) => component(row, Link).props.to)).toEqual([
      '/projects/12/rooms/r1/versions/v9', '/projects/12/rooms/r1/versions/v8',
    ]);
    expect(text(rows[0])).toContain(`Jane · ${new Date(versions[0].issuedAt).toLocaleDateString()}`);
    expect(text(rows[1])).toContain(`Someone · ${new Date(versions[1].issuedAt).toLocaleDateString()}`);
    const note = nodes(rows[0]).find((node) => node.type === 'p' && text(node) === 'Moved sink');
    expect(note.props.className).toContain('text-gray-400');
    expect(nodes(rows[1]).filter((node) => node.type === 'p')).toHaveLength(1);
    await list.flush();
    expect(loadRoomVersions).toHaveBeenCalledOnce();
  });

  it('makes only the current version bold without a link (anchor 2)', async () => {
    const list = renderComponent(VersionList, { projectId: '12', roomId: 'r1', currentVersionId: 'v9' });
    await list.flush();
    const rows = nodes(list.tree).filter((node) => node.type === 'li');
    expect(rows[0].props.className).toBe('font-semibold');
    expect(rows[1].props.className).toBeUndefined();
    expect(text(component(rows[0], 'strong'))).toBe('v2 · KC 10/15/26');
    expect(component(rows[0], Link)).toBeUndefined();
    expect(component(rows[1], Link).props.to).toBe('/projects/12/rooms/r1/versions/v8');
  });

  it('shows the empty state (anchor 3)', async () => {
    loadRoomVersions.mockImplementationOnce(() => async () => ({ ok: true, versions: [] }));
    const list = renderComponent(VersionList, { projectId: '12', roomId: 'r1' });
    await list.flush();
    expect(text(list.tree)).toBe('No versions issued yet.');
    expect(component(list.tree, Link)).toBeUndefined();
  });

  it('shows offline and retries r1 only on click (anchor 4)', async () => {
    loadRoomVersions.mockImplementationOnce(() => async () => ({ ok: false, message: 'offline' }));
    const list = renderComponent(VersionList, { projectId: '12', roomId: 'r1' });
    await list.flush();
    expect(list.tree.props.role).toBe('alert');
    expect(text(list.tree)).toContain('offline');
    await list.flush();
    expect(loadRoomVersions).toHaveBeenCalledOnce();
    button(list.tree, 'Retry').props.onClick();
    expect(text(list.render())).toBe('Loading versions…');
    await list.flush();
    expect(loadRoomVersions).toHaveBeenCalledTimes(2);
    expect(loadRoomVersions).toHaveBeenLastCalledWith('r1');
    expect(component(list.tree, Link)).toBeDefined();
    expect(text(list.tree)).not.toContain('offline');
  });

  it('toggles both headers for viewers and remounts the room list after an issue', async () => {
    const props = { projectId: '12', roomId: 'r1' };
    const header = renderComponent(RoomHeader, props);
    expect(button(header.tree, 'Issue…')).toBeUndefined();
    expect(button(header.tree, 'Versions').props['aria-expanded']).toBe(false);
    expect(component(header.tree, VersionList)).toBeUndefined();
    button(header.tree, 'Versions').props.onClick();
    header.render();
    expect(button(header.tree, 'Versions').props['aria-expanded']).toBe(true);
    const initial = component(header.tree, VersionList);
    expect(initial.props).toEqual(props);
    const list = renderComponent(VersionList, initial.props);
    await list.flush();
    state.elevation.cloud.room.lastVersion = { seq: 2, label: 'KC 10/15/26' };
    header.render();
    const issued = component(header.tree, VersionList);
    expect(issued.key).not.toBe(initial.key);
    list.unmount();
    await renderComponent(VersionList, issued.props).flush();
    expect(loadRoomVersions).toHaveBeenCalledTimes(2);
    button(header.tree, 'Versions').props.onClick();
    expect(component(header.render(), VersionList)).toBeUndefined();
    expect(button(header.tree, 'Versions').props['aria-expanded']).toBe(false);

    const versionHeader = renderComponent(VersionHeader, { ...props, versionId: 'v9' });
    expect(component(versionHeader.tree, VersionList)).toBeUndefined();
    button(versionHeader.tree, 'Versions').props.onClick();
    versionHeader.render();
    expect(button(versionHeader.tree, 'Versions').props['aria-expanded']).toBe(true);
    expect(component(versionHeader.tree, VersionList).props).toEqual({ ...props, currentVersionId: 'v9' });
    button(versionHeader.tree, 'Versions').props.onClick();
    expect(component(versionHeader.render(), VersionList)).toBeUndefined();
  });

  it('reloads for a different room and ignores the old room reply', async () => {
    const pending = deferred();
    loadRoomVersions.mockImplementationOnce(() => () => pending.promise);
    const props = { projectId: '12', roomId: 'r1' };
    const list = renderComponent(VersionList, props);
    props.roomId = 'r2';
    list.render();
    await list.flush();
    expect(loadRoomVersions).toHaveBeenLastCalledWith('r2');
    expect(component(list.tree, Link).props.to).toBe('/projects/12/rooms/r2/versions/v9');
    pending.resolve({ ok: false, message: 'Old room failure' });
    await list.flush();
    expect(component(list.tree, Link).props.to).toBe('/projects/12/rooms/r2/versions/v9');
    expect(text(list.tree)).not.toContain('Old room failure');
  });
});
