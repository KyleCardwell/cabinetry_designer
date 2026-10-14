import { describe, expect, it } from 'vitest';
import { withDesignApi } from '../cloudThunks.js';
import { cloudStore, fakeDesignApi } from './helpers/fakeDesignApi.js';

describe('DB5 a injected project API', () => {
  it('returns the fake reply through the thunk without changing Redux state (anchor 7)', async () => {
    const api = fakeDesignApi({ projects: [{ est_project_id: 4 }] });
    const store = cloudStore(api);
    const before = store.getState();
    expect(await store.dispatch(withDesignApi((api) => api.listProjects('t'))))
      .toEqual({ ok: true, rows: [{ est_project_id: 4 }] });
    expect(api.calls).toEqual([['listProjects', 't', false]]);
    const failure = { ok: false, reason: 'permission', message: 'no' };
    api.failNext = failure;
    expect(await store.dispatch(withDesignApi((api) => api.listProjects('t')))).toBe(failure);
    expect(store.getState()).toBe(before);
  });

  it('records all ten methods and supports project, phase and room writes', async () => {
    const api = fakeDesignApi({ attachableProjects: [{ est_project_id: 4, est_project_name: 'Smith', est_client_name: 'Jane' }] });
    const attachable = await api.listAttachableProjects('t', 'jAnE');
    expect(attachable.rows).toHaveLength(1);
    const created = await api.createProject({ teamId: 't', estProjectId: 4, phaseName: 'Phase 1' });
    expect(created).toEqual({ ok: true, est_project_id: 4, phase_id: expect.any(String), room_id: null });
    await api.updateProjectInfo(4, { city: 'Provo' });
    expect((await api.getProject(4)).project.project.city).toBe('Provo');
    const phase = await api.createPhase(4, 'Phase 2');
    await api.updatePhase(phase.phase_id, { name: 'Install', sort: 0, archived: false });
    const document = { name: 'Kitchen', walls: [{ id: 'w1' }] };
    const room = await api.createRoom(created.phase_id, 'Kitchen', document, 4);
    document.walls.length = 0;
    const source = api.db.project.phases[0].rooms[0];
    source.status = 'released';
    source.last_version = { label: 'Issued' };
    const copy = await api.copyRoom(room.room_id, phase.phase_id, 'Kitchen copy');
    const copied = api.db.project.phases[1].rooms[0];
    expect(copied).toMatchObject({ room_id: copy.room_id, name: 'Kitchen copy', status: 'drafting',
      document: { name: 'Kitchen', walls: [{ id: 'w1' }] }, schema_version: 4, last_version: null });
    copied.document.walls[0].id = 'changed';
    expect(source.document.walls[0].id).toBe('w1');
    await api.updateRoomInfo(room.room_id, { archived: true });
    expect(source.archived_at).toBe('t');
    expect((await api.listProjects('t')).rows[0]).toMatchObject({ phase_count: 2, room_count: 1 });
    await api.archiveProject(4);
    expect((await api.listProjects('t')).rows).toEqual([]);
    expect((await api.listProjects('t', true)).rows[0].archived_at).toBe('t');
    await api.archiveProject(4, false);
    expect((await api.listAttachableProjects('t')).rows).toEqual([]);
    expect(api.calls).toContainEqual(['listAttachableProjects', 't', 'jAnE']);
    expect(api.calls).toContainEqual(['createProject', { teamId: 't', estProjectId: 4, project: null,
      phaseName: 'Phase 1', roomName: null, roomDocument: null, schemaVersion: null }]);
    expect(api.calls).toContainEqual(['updateProjectInfo', 4, { city: 'Provo' }]);
    expect(api.calls).toContainEqual(['createPhase', 4, 'Phase 2']);
    expect(api.calls).toContainEqual(['updatePhase', phase.phase_id, { name: 'Install', sort: 0, archived: false }]);
    expect(api.calls).toContainEqual(['createRoom', created.phase_id, 'Kitchen', { name: 'Kitchen', walls: [{ id: 'w1' }] }, 4]);
    expect(api.calls).toContainEqual(['copyRoom', room.room_id, phase.phase_id, 'Kitchen copy']);
    expect(api.calls).toContainEqual(['updateRoomInfo', room.room_id, { name: null, sort: null, archived: true }]);
    expect(api.calls).toContainEqual(['archiveProject', 4, true]);
    expect(api.calls).toContainEqual(['listProjects', 't', false]);
  });

  it('uses configured replies without mutating the database and honors optional defaults', async () => {
    const api = fakeDesignApi();
    const options = { teamId: 't', project: { est_project_name: 'Smith' }, phaseName: 'Phase 1',
      roomName: 'Kitchen', roomDocument: { walls: [] }, schemaVersion: 4 };
    const created = await api.createProject(options);
    expect(created).toMatchObject({ ok: true, est_project_id: 1, phase_id: expect.any(String), room_id: expect.any(String) });
    expect((await api.listProjects('t')).rows[0]).toMatchObject({ phase_count: 1, room_count: 1 });
    const before = structuredClone(api.db);
    const failure = { ok: false, reason: 'permission', message: 'no' };
    api.replies.updatePhase = failure;
    expect(await api.updatePhase(created.phase_id, { archived: true })).toEqual(failure);
    api.failNext = failure;
    expect(await api.updateRoomInfo(created.room_id, { name: 'Other' })).toBe(failure);
    expect(api.db).toEqual(before);
    await api.updatePhase(created.phase_id);
    await api.updateRoomInfo(created.room_id);
    const copy = await api.copyRoom(created.room_id, created.phase_id);
    expect(api.db.project.phases[0].rooms.find((room) => room.room_id === copy.room_id).name).toBe('Kitchen');
    expect(api.calls).toContainEqual(['updatePhase', created.phase_id, { name: null, sort: null, archived: null }]);
    expect(api.calls).toContainEqual(['updateRoomInfo', created.room_id, { name: null, sort: null, archived: null }]);
    expect(api.calls).toContainEqual(['copyRoom', created.room_id, created.phase_id, null]);
  });
});
