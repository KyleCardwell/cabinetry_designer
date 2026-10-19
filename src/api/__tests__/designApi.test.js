import { describe, expect, it } from 'vitest';
import { createDesignApi } from '../designApi.js';

/** A chainable fake of the bits of supabase-js the API uses; records every call. */
function fakeClient({ rpc = {}, tables = {} } = {}) {
  const calls = [];
  const builder = (table) => {
    const chain = [];
    const node = {
      select: (cols) => { chain.push(['select', cols]); return node; },
      eq: (col, val) => { chain.push(['eq', col, val]); return node; },
      is: (col, val) => { chain.push(['is', col, val]); return node; },
      order: (col) => { chain.push(['order', col]); return node; },
      maybeSingle: () => { chain.push(['maybeSingle']); return node; },
      then: (resolve, reject) => {
        calls.push({ table, chain });
        const result = tables[table];
        return Promise.resolve(typeof result === 'function' ? result() : result).then(resolve, reject);
      },
    };
    return node;
  };
  return {
    calls,
    from: (table) => builder(table),
    rpc: async (name, args) => {
      calls.push({ rpc: name, args });
      const result = rpc[name];
      if (result instanceof Error) throw result;
      return typeof result === 'function' ? result(args) : result;
    },
  };
}

describe('designApi', () => {
  it('HP3b c lists live pulls in order and passes save arguments, defaults and conflicts through', async () => {
    let listed = { data: [{ pull_id: 'p' }], error: null };
    let saved = { data: { ok: true, pull_id: 'p', version: 3, updated_at: 't' }, error: null };
    const client = fakeClient({ tables: { design_pulls: () => listed }, rpc: { save_pull: () => saved } });
    const api = createDesignApi(client);
    expect(await api.listPulls('team')).toEqual({ ok: true, rows: [{ pull_id: 'p' }] });
    expect(client.calls[0]).toEqual({ table: 'design_pulls', chain: [
      ['select', 'pull_id, name, data, hardware_pull_id, version, sort, archived_at'],
      ['eq', 'team_id', 'team'], ['is', 'archived_at', null], ['order', 'sort'], ['order', 'created_at'],
    ] });
    const args = { teamId: 'team', pullId: 'p', name: 'Bar', data: { kind: 'pull' }, hardwarePullId: 3, sort: 4, expectedVersion: 2 };
    expect(await api.savePull(args)).toEqual(saved.data);
    expect(client.calls.at(-1)).toEqual({ rpc: 'save_pull', args: {
      p_team_id: 'team', p_pull_id: 'p', p_name: 'Bar', p_data: { kind: 'pull' },
      p_hardware_pull_id: 3, p_sort: 4, p_expected_version: 2,
    } });
    saved = { data: { ok: false, reason: 'conflict', version: 4 }, error: null };
    expect(await api.savePull({ teamId: 'team', pullId: null, name: 'Bar', data: {}, expectedVersion: 0 })).toEqual(saved.data);
    expect(client.calls.at(-1).args).toMatchObject({ p_pull_id: null, p_hardware_pull_id: null, p_sort: null, p_expected_version: 0 });
    listed = { data: null, error: null };
    expect(await api.listPulls('team')).toEqual({ ok: true, rows: [] });
    listed = { error: { code: '42501', message: 'No permission' } };
    expect(await api.listPulls('team')).toEqual({ ok: false, reason: 'permission', message: 'No permission' });
  });

  it('IN4b c lists live slides in order and passes save arguments, defaults and conflicts through', async () => {
    let listed = { data: [{ slide_id: 'p' }], error: null };
    let saved = { data: { ok: true, slide_id: 'p', version: 3, updated_at: 't' }, error: null };
    const client = fakeClient({ tables: { design_slides: () => listed }, rpc: { save_slide: () => saved } });
    const api = createDesignApi(client);
    expect(await api.listSlides('team')).toEqual({ ok: true, rows: [{ slide_id: 'p' }] });
    expect(client.calls[0]).toEqual({ table: 'design_slides', chain: [
      ['select', 'slide_id, name, data, hardware_slide_id, version, sort, archived_at'],
      ['eq', 'team_id', 'team'], ['is', 'archived_at', null], ['order', 'sort'], ['order', 'created_at'],
    ] });
    const args = { teamId: 'team', slideId: 'p', name: 'Hettich', data: { mount: 'side' }, hardwareSlideId: 3, sort: 4, expectedVersion: 2 };
    expect(await api.saveSlide(args)).toEqual(saved.data);
    expect(client.calls.at(-1)).toEqual({ rpc: 'save_slide', args: {
      p_team_id: 'team', p_slide_id: 'p', p_name: 'Hettich', p_data: { mount: 'side' },
      p_hardware_slide_id: 3, p_sort: 4, p_expected_version: 2,
    } });
    saved = { data: { ok: false, reason: 'conflict', version: 4 }, error: null };
    expect(await api.saveSlide({ teamId: 'team', slideId: null, name: 'Hettich', data: {}, expectedVersion: 0 })).toEqual(saved.data);
    expect(client.calls.at(-1).args).toMatchObject({ p_slide_id: null, p_hardware_slide_id: null, p_sort: null, p_expected_version: 0 });
    listed = { data: null, error: null };
    expect(await api.listSlides('team')).toEqual({ ok: true, rows: [] });
    listed = { error: { code: '42501', message: 'No permission' } };
    expect(await api.listSlides('team')).toEqual({ ok: false, reason: 'permission', message: 'No permission' });
  });

  it('IN12a lists live accessories in order and passes save arguments, defaults and conflicts through', async () => {
    let listed = { data: [{ accessory_id: 'a' }], error: null };
    let saved = { data: { ok: true, accessory_id: 'a', version: 3, updated_at: 't' }, error: null };
    const client = fakeClient({ tables: { design_accessories: () => listed }, rpc: { save_accessory: () => saved } });
    const api = createDesignApi(client);
    expect(await api.listAccessories('team')).toEqual({ ok: true, rows: [{ accessory_id: 'a' }] });
    expect(client.calls[0]).toEqual({ table: 'design_accessories', chain: [
      ['select', 'accessory_id, name, data, accessory_catalog_id, version, sort, archived_at'],
      ['eq', 'team_id', 'team'], ['is', 'archived_at', null], ['order', 'sort'], ['order', 'created_at'],
    ] });
    const args = { teamId: 'team', accessoryId: 'a', name: 'Lazy susan', data: { attachesTo: 'section' }, accessoryCatalogId: 3, sort: 4, expectedVersion: 2 };
    expect(await api.saveAccessory(args)).toEqual(saved.data);
    expect(client.calls.at(-1)).toEqual({ rpc: 'save_accessory', args: {
      p_team_id: 'team', p_accessory_id: 'a', p_name: 'Lazy susan', p_data: { attachesTo: 'section' },
      p_accessory_catalog_id: 3, p_sort: 4, p_expected_version: 2,
    } });
    saved = { data: { ok: false, reason: 'conflict', version: 4 }, error: null };
    expect(await api.saveAccessory({ teamId: 'team', accessoryId: null, name: 'Lazy susan', data: {}, expectedVersion: 0 })).toEqual(saved.data);
    expect(client.calls.at(-1).args).toMatchObject({ p_accessory_id: null, p_accessory_catalog_id: null, p_sort: null, p_expected_version: 0 });
    saved = { error: { code: '23505', message: 'duplicate key' } };
    expect(await api.saveAccessory({ teamId: 'team', accessoryId: null, name: 'lazy susan', data: {}, expectedVersion: 0 }))
      .toEqual({ ok: false, reason: 'duplicate', message: 'duplicate key' });
    listed = { data: null, error: null };
    expect(await api.listAccessories('team')).toEqual({ ok: true, rows: [] });
    listed = { error: { code: '42501', message: 'No permission' } };
    expect(await api.listAccessories('team')).toEqual({ ok: false, reason: 'permission', message: 'No permission' });
  });

  it('passes a version-checked reply through', async () => {
    const client = fakeClient({ rpc: { save_team_settings: { data: { ok: true, version: 4, updated_at: 't' }, error: null } } });
    const reply = await createDesignApi(client).saveTeamSettings('team-1', { roundTo: 0.5 }, 3);
    expect(reply).toEqual({ ok: true, version: 4, updated_at: 't' });
    expect(client.calls[0]).toEqual({ rpc: 'save_team_settings', args: { p_team_id: 'team-1', p_settings: { roundTo: 0.5 }, p_expected_version: 3 } });
  });

  it('passes a conflict through untouched', async () => {
    const conflict = { ok: false, reason: 'conflict', version: 5, updated_by_name: 'KC', updated_at: 't' };
    const client = fakeClient({ rpc: { save_profile: { data: conflict, error: null } } });
    expect(await createDesignApi(client).saveProfile({ teamId: 't', profileId: 'p', kind: 'crown', name: 'C', data: {}, expectedVersion: 4 }))
      .toEqual(conflict);
  });

  it('maps database error codes and network failures', async () => {
    const client = fakeClient({ rpc: {
      save_door_design: { data: null, error: { code: '23505', message: 'Code taken' } },
      archive_library_item: { data: null, error: { code: '42501', message: 'No permission' } },
      save_phase_overrides: new Error('Failed to fetch'),
    } });
    const api = createDesignApi(client);
    expect(await api.saveDoorDesign({ teamId: 't', designId: null, code: '110', data: {}, expectedVersion: 0 }))
      .toEqual({ ok: false, reason: 'duplicate', message: 'Code taken' });
    expect(await api.archiveLibraryItem('profile', 'p')).toEqual({ ok: false, reason: 'permission', message: 'No permission' });
    expect(await api.savePhaseOverrides('ph', {}, 1)).toEqual({ ok: false, reason: 'network', message: 'Failed to fetch' });
  });

  it('loads the shop standard (null when the team has none) and the library', async () => {
    const client = fakeClient({ tables: {
      design_team_settings: { data: null, error: null },
      design_profiles: { data: [{ profile_id: 'p' }], error: null },
      design_door_designs: { data: [], error: null },
    } });
    const api = createDesignApi(client);
    expect(await api.loadTeamSettings('t')).toEqual({ ok: true, row: null });
    expect(await api.listProfiles('t')).toEqual({ ok: true, rows: [{ profile_id: 'p' }] });
    expect(await api.listDoorDesigns('t')).toEqual({ ok: true, rows: [] });
    const designs = client.calls.find((call) => call.table === 'design_door_designs');
    expect(designs.chain).toContainEqual(['is', 'archived_at', null]);
  });

  it('wraps get_design_project', async () => {
    const client = fakeClient({ rpc: { get_design_project: { data: { project: { est_project_id: 7 } }, error: null } } });
    expect(await createDesignApi(client).getProject(7)).toEqual({ ok: true, project: { project: { est_project_id: 7 } } });
  });

  it('creates a project with explicit null defaults (anchor 1)', async () => {
    const data = { ok: true, est_project_id: 4, phase_id: 'p1', room_id: null };
    const client = fakeClient({ rpc: { create_design_project: { data, error: null } } });
    expect(await createDesignApi(client).createProject({ teamId: 't', project: { est_project_name: 'Smith' }, phaseName: 'Phase 1' }))
      .toEqual(data);
    expect(client.calls).toEqual([{ rpc: 'create_design_project', args: {
      p_team_id: 't', p_est_project_id: null, p_project: { est_project_name: 'Smith' },
      p_phase_name: 'Phase 1', p_room_name: null, p_room_document: null, p_schema_version: null,
    } }]);
  });

  it('maps project list arrays and preserves permission failures (anchor 2)', async () => {
    let result = { data: [{ est_project_id: 4 }], error: null };
    const client = fakeClient({ rpc: {
      list_design_projects: () => result,
      list_attachable_estimate_projects: { data: null, error: null },
    } });
    const api = createDesignApi(client);
    expect(await api.listProjects('t', true)).toEqual({ ok: true, rows: [{ est_project_id: 4 }] });
    result = { error: { code: '42501', message: 'no' } };
    expect(await api.listProjects('t')).toEqual({ ok: false, reason: 'permission', message: 'no' });
    expect(await api.listAttachableProjects('t')).toEqual({ ok: true, rows: [] });
    expect(await api.listAttachableProjects('t', 'Smith')).toEqual({ ok: true, rows: [] });
    expect(client.calls).toEqual([
      { rpc: 'list_design_projects', args: { p_team_id: 't', p_include_archived: true } },
      { rpc: 'list_design_projects', args: { p_team_id: 't', p_include_archived: false } },
      { rpc: 'list_attachable_estimate_projects', args: { p_team_id: 't', p_search: '' } },
      { rpc: 'list_attachable_estimate_projects', args: { p_team_id: 't', p_search: 'Smith' } },
    ]);
  });

  it('archives a phase and copies a saved room without sending a document (anchor 3)', async () => {
    const client = fakeClient({ rpc: {
      update_design_phase: { data: { ok: true }, error: null },
      copy_design_room: { data: { ok: true, room_id: 'r2', sort: 0, version: 1 }, error: null },
    } });
    const api = createDesignApi(client);
    expect(await api.updatePhase('p1', { archived: true })).toEqual({ ok: true });
    expect(await api.copyRoom('r1', 'p2', 'Kitchen copy')).toEqual({ ok: true, room_id: 'r2', sort: 0, version: 1 });
    await api.copyRoom('r1', 'p2');
    expect(client.calls).toEqual([
      { rpc: 'update_design_phase', args: { p_phase_id: 'p1', p_name: null, p_sort: null, p_archived: true } },
      { rpc: 'copy_design_room', args: { p_room_id: 'r1', p_to_phase_id: 'p2', p_name: 'Kitchen copy' } },
      { rpc: 'copy_design_room', args: { p_room_id: 'r1', p_to_phase_id: 'p2', p_name: null } },
    ]);
  });

  it('passes every other D5 write argument and default through', async () => {
    const names = ['create_design_project', 'update_design_project_info', 'archive_design_project',
      'create_design_phase', 'update_design_phase', 'create_design_room', 'update_design_room_info'];
    const client = fakeClient({ rpc: Object.fromEntries(names.map((name) => [name, { data: { ok: true }, error: null }])) });
    const api = createDesignApi(client);
    const document = { name: 'Kitchen', walls: [] };
    const options = { teamId: 't', estProjectId: 4, phaseName: 'Phase 1', roomName: 'Kitchen', roomDocument: document, schemaVersion: 4 };
    const replies = [
      await api.createProject(options), await api.updateProjectInfo(4, { city: '' }),
      await api.archiveProject(4), await api.archiveProject(4, false), await api.createPhase(4, 'Phase 2'),
      await api.updatePhase('p1'), await api.updatePhase('p1', { name: 'Finish', sort: 0, archived: false }),
      await api.createRoom('p1', 'Kitchen', document, 4), await api.updateRoomInfo('r1'),
      await api.updateRoomInfo('r1', { name: 'Kitchen 2', sort: 0, archived: false }),
    ];
    expect(replies.every((reply) => reply.ok)).toBe(true);
    expect(client.calls).toEqual([
      { rpc: 'create_design_project', args: { p_team_id: 't', p_est_project_id: 4, p_project: null,
        p_phase_name: 'Phase 1', p_room_name: 'Kitchen', p_room_document: document, p_schema_version: 4 } },
      { rpc: 'update_design_project_info', args: { p_est_project_id: 4, p_info: { city: '' } } },
      { rpc: 'archive_design_project', args: { p_est_project_id: 4, p_archived: true } },
      { rpc: 'archive_design_project', args: { p_est_project_id: 4, p_archived: false } },
      { rpc: 'create_design_phase', args: { p_est_project_id: 4, p_name: 'Phase 2' } },
      { rpc: 'update_design_phase', args: { p_phase_id: 'p1', p_name: null, p_sort: null, p_archived: null } },
      { rpc: 'update_design_phase', args: { p_phase_id: 'p1', p_name: 'Finish', p_sort: 0, p_archived: false } },
      { rpc: 'create_design_room', args: { p_phase_id: 'p1', p_name: 'Kitchen', p_document: document, p_schema_version: 4 } },
      { rpc: 'update_design_room_info', args: { p_room_id: 'r1', p_name: null, p_sort: null, p_archived: null } },
      { rpc: 'update_design_room_info', args: { p_room_id: 'r1', p_name: 'Kitchen 2', p_sort: 0, p_archived: false } },
    ]);
  });

  it('resolves D5 read and write failures without throwing', async () => {
    const failure = { ok: false, reason: 'bad_input', message: 'Bad room' };
    const client = fakeClient({ rpc: {
      create_design_room: { data: failure, error: null },
      list_attachable_estimate_projects: new Error('Offline'),
      archive_design_project: { error: { code: 'P0002', message: 'Project missing' } },
    } });
    const api = createDesignApi(client);
    expect(await api.createRoom('p1', '', {}, 4)).toEqual(failure);
    expect(await api.listAttachableProjects('t')).toEqual({ ok: false, reason: 'network', message: 'Offline' });
    expect(await api.archiveProject(4)).toEqual({ ok: false, reason: 'not_found', message: 'Project missing' });
  });

  it('reads one room by id and maps a missing room to null', async () => {
    const row = { room_id: 'r1', name: 'Kitchen', version: 5, document: {} };
    const client = fakeClient({ tables: { design_rooms: { data: row, error: null } } });
    expect(await createDesignApi(client).getRoom('r1')).toEqual({ ok: true, room: row });
    expect(client.calls[0].chain).toEqual([
      ['select', 'room_id, phase_id, name, status, status_at, version, schema_version, document, archived_at, updated_at'],
      ['eq', 'room_id', 'r1'],
      ['maybeSingle'],
    ]);
    const empty = fakeClient({ tables: { design_rooms: { data: null, error: null } } });
    expect(await createDesignApi(empty).getRoom('nope')).toEqual({ ok: true, room: null });
  });

  it('saves a room document with the expected version and the demote flag', async () => {
    const client = fakeClient({ rpc: { save_room_document: { data: { ok: true, version: 6, updated_at: 't', status: 'drafting' }, error: null } } });
    const api = createDesignApi(client);
    expect(await api.saveRoomDocument({ roomId: 'r1', document: { a: 1 }, schemaVersion: 4, expectedVersion: 5 }))
      .toEqual({ ok: true, version: 6, updated_at: 't', status: 'drafting' });
    await api.saveRoomDocument({ roomId: 'r1', document: { a: 1 }, schemaVersion: 4, expectedVersion: 5, demote: true });
    expect(client.calls.map((call) => call.args)).toEqual([
      { p_room_id: 'r1', p_document: { a: 1 }, p_schema_version: 4, p_expected_version: 5, p_demote: false },
      { p_room_id: 'r1', p_document: { a: 1 }, p_schema_version: 4, p_expected_version: 5, p_demote: true },
    ]);
  });

  it('passes the status and archived replies of a room save through', async () => {
    const status = { ok: false, reason: 'status', status: 'approved', status_by_name: 'Kyle', status_at: 't', version: 5 };
    const client = fakeClient({ rpc: { save_room_document: { data: status, error: null } } });
    expect(await createDesignApi(client).saveRoomDocument({ roomId: 'r1', document: {}, schemaVersion: 4, expectedVersion: 5 })).toEqual(status);
  });

  it('issues a version and sets a status with the expected version (DB8a)', async () => {
    const client = fakeClient({ rpc: {
      issue_room_version: { data: { ok: true, version_id: 'v1', seq: 1, label: 'KC', issued_at: 't' }, error: null },
      set_room_status: { data: { ok: true, status: 'approved', status_at: 't', version: 5 }, error: null },
    } });
    const api = createDesignApi(client);
    expect(await api.issueRoomVersion({ roomId: 'r1', label: 'KC', settingsSnapshot: { format: 1 }, expectedVersion: 5 }))
      .toEqual({ ok: true, version_id: 'v1', seq: 1, label: 'KC', issued_at: 't' });
    expect(await api.setRoomStatus({ roomId: 'r1', status: 'approved', expectedVersion: 5 }))
      .toEqual({ ok: true, status: 'approved', status_at: 't', version: 5 });
    expect(client.calls.map((call) => [call.rpc, call.args])).toEqual([
      ['issue_room_version', { p_room_id: 'r1', p_label: 'KC', p_note: null, p_settings_snapshot: { format: 1 }, p_expected_version: 5 }],
      ['set_room_status', { p_room_id: 'r1', p_status: 'approved', p_expected_version: 5 }],
    ]);
  });

  it('lists versions and reads one with its document and snapshot (DB8a)', async () => {
    const row = { version_id: 'v1', room_id: 'r1', seq: 1, document: {}, settings_snapshot: {} };
    const client = fakeClient({
      rpc: { list_design_room_versions: { data: [{ version_id: 'v1', seq: 1 }], error: null } },
      tables: { design_room_versions: { data: row, error: null } },
    });
    const api = createDesignApi(client);
    expect(await api.listRoomVersions('r1')).toEqual({ ok: true, rows: [{ version_id: 'v1', seq: 1 }] });
    expect(await api.getRoomVersion('v1')).toEqual({ ok: true, version: row });
    expect(client.calls[0]).toEqual({ rpc: 'list_design_room_versions', args: { p_room_id: 'r1' } });
    expect(client.calls[1].chain).toEqual([
      ['select', 'version_id, room_id, seq, label, note, document, schema_version, settings_snapshot, issued_by, issued_at'],
      ['eq', 'version_id', 'v1'],
      ['maybeSingle'],
    ]);
  });
});
