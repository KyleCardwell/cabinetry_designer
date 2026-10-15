import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import useLeaveProjectPresence, { inProject } from '../useLeaveProjectPresence.js';
import { leaveProjectPresence } from '../../elevation/store/presenceThunks.js';

vi.mock('react', async (original) => ({ ...await original(), useEffect: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));
vi.mock('react-router-dom', () => ({ useLocation: vi.fn() }));
vi.mock('../../elevation/store/presenceThunks.js', () => ({ leaveProjectPresence: vi.fn() }));

let dispatch;
let pathname;
let previousDeps;

beforeEach(() => {
  vi.clearAllMocks();
  dispatch = vi.fn();
  previousDeps = undefined;
  useDispatch.mockReturnValue(dispatch);
  useLocation.mockImplementation(() => ({ pathname }));
  useEffect.mockImplementation((run, deps) => {
    if (!previousDeps || deps.some((dep, i) => !Object.is(dep, previousDeps[i]))) run();
    previousDeps = deps;
  });
  leaveProjectPresence.mockReturnValue({ type: 'test/leaveProjectPresence' });
});

describe('DB6b f leaving project presence', () => {
  it('recognizes project pages and their room paths (anchor 4)', () => {
    expect(inProject('/projects/42')).toBe(true);
    expect(inProject('/projects/42/rooms/rm-1')).toBe(true);
    expect(inProject('/projects/42/')).toBe(true);
  });

  it('excludes the project list, Library, sandbox, and settings (anchor 5)', () => {
    for (const path of ['/projects', '/library/door-designs', '/elevation-lab', '/settings', '/projects/', '/projects//rooms/rm-1']) {
      expect(inProject(path)).toBe(false);
    }
  });

  it('keeps presence between rooms and the project, then leaves once on navigation to Library (anchor 6)', () => {
    pathname = '/projects/42/rooms/rm-1';
    useLeaveProjectPresence();
    pathname = '/projects/42';
    useLeaveProjectPresence();
    pathname = '/projects/42/rooms/rm-2';
    useLeaveProjectPresence();
    pathname = '/projects/43';
    useLeaveProjectPresence();
    expect(dispatch).not.toHaveBeenCalled();
    expect(leaveProjectPresence).not.toHaveBeenCalled();
    pathname = '/library/profiles';
    useLeaveProjectPresence();
    useLeaveProjectPresence();
    expect(leaveProjectPresence).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: 'test/leaveProjectPresence' });
  });
});
