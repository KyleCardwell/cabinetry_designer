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
});
