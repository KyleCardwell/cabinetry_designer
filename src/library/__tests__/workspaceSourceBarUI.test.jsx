import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { createInitialElevationState } from '../../elevation/store/elevationSlice.js';
import WorkspaceSourceBar from '../WorkspaceSourceBar.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn(), useRef: () => ({ current: false }) }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('../../sandbox.js', () => ({ SANDBOX_ENABLED: true }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => nodes(tree).flatMap(({ props }) => [props?.children].flat())
  .filter((child) => typeof child === 'string').join(' ');
const button = (tree, label) => nodes(tree).find(({ type, props }) => type === 'button' && [props.children].flat().join('') === label);

let elevation;
let auth;

function cloudState(cloud) {
  return {
    ...createInitialElevationState(null),
    source: 'cloud',
    cloud: { teamId: 't', permissions: { view: true, edit: true, manage: true }, pending: 0, conflict: null, error: null, ...cloud },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  elevation = createInitialElevationState(null);
  auth = { teamId: 't' };
  useState.mockReturnValue([false, vi.fn()]);
  useSelector.mockImplementation((selector) => selector({ elevation, auth }));
  useDispatch.mockReturnValue(vi.fn());
});

describe('DB4 g workspace source bar', () => {
  it('starts on this browser with the shop button available', () => {
    const tree = WorkspaceSourceBar({});
    expect(button(tree, 'This browser').props['aria-pressed']).toBe(true);
    expect(button(tree, 'Shop (Supabase)').props.disabled).toBe(false);
    expect(text(tree)).toMatch(/Nothing here reaches the shop data/);
  });

  it('cannot open shop data without a team', () => {
    auth = { teamId: null };
    expect(button(WorkspaceSourceBar({}), 'Shop (Supabase)').props.disabled).toBe(true);
  });

  it('shows saving, and blocks switching back until saves finish', () => {
    elevation = cloudState({ pending: 2 });
    const tree = WorkspaceSourceBar({});
    expect(text(tree)).toMatch(/Saving/);
    expect(button(tree, 'This browser').props.disabled).toBe(true);
    elevation = cloudState({});
    expect(text(WorkspaceSourceBar({}))).toMatch(/All changes saved/);
  });

  it('explains a conflict and offers a reload', () => {
    elevation = cloudState({ conflict: { target: 'team', what: 'Shop settings', updatedByName: 'KC', updatedAt: null } });
    const tree = WorkspaceSourceBar({});
    expect(text(tree)).toMatch(/Shop settings/);
    expect(text(tree)).toMatch(/were changed by KC/);
    expect(button(tree, 'Reload shop data')).toBeDefined();
  });

  it('shows an error with Retry, and view-only users are told why', () => {
    elevation = cloudState({ error: { target: 'team', what: 'Shop settings', message: 'Failed to fetch' }, permissions: { view: true, edit: false, manage: false } });
    const tree = WorkspaceSourceBar({});
    expect(text(tree)).toMatch(/Failed to fetch/);
    expect(button(tree, 'Retry')).toBeDefined();
    expect(text(tree)).toMatch(/View only/);
  });
});
