/**
 * Thin wrapper over the D3 tables and RPCs (SPEC-DB3 "RPC reference") for what D4 loads
 * and saves. Every call resolves (never throws) to one of:
 *   { ok: true, ...data }
 *   { ok: false, reason: 'conflict', version, updated_by_name, updated_at }   (from the RPC)
 *   { ok: false, reason: 'permission' | 'not_found' | 'bad_input' | 'duplicate' | 'stale'
 *               | 'network' | 'error', message }
 * `client` is a supabase-js client; tests pass a fake.
 */
const ERROR_REASONS = {
  42501: 'permission',
  P0002: 'not_found',
  22023: 'bad_input',
  23505: 'duplicate',
  40001: 'stale',
};

export function errorReply(error) {
  return {
    ok: false,
    reason: ERROR_REASONS[error?.code] ?? 'error',
    message: error?.message ?? 'Unknown error',
  };
}

async function run(query) {
  try {
    const { data, error } = await query();
    if (error) return errorReply(error);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, reason: 'network', message: error?.message ?? 'Network error' };
  }
}

async function rpc(client, name, args) {
  const reply = await run(() => client.rpc(name, args));
  if (!reply.ok) return reply;
  const { data } = reply;
  if (data && typeof data === 'object' && !Array.isArray(data) && 'ok' in data) return data;
  return { ok: true, data };
}

const PROFILE_COLUMNS = 'profile_id, kind, name, data, version, sort, archived_at';
const DESIGN_COLUMNS = 'design_id, code, data, version, sort, archived_at';

export function createDesignApi(client) {
  return {
    /** → { ok, row: { settings, version, updated_at } | null } */
    async loadTeamSettings(teamId) {
      const reply = await run(() => client.from('design_team_settings')
        .select('settings, version, updated_at').eq('team_id', teamId).maybeSingle());
      return reply.ok ? { ok: true, row: reply.data ?? null } : reply;
    },
    /** Every profile, archived too (archived profiles still draw old rooms, DB8). → { ok, rows } */
    async listProfiles(teamId) {
      const reply = await run(() => client.from('design_profiles').select(PROFILE_COLUMNS)
        .eq('team_id', teamId).order('sort').order('created_at'));
      return reply.ok ? { ok: true, rows: reply.data ?? [] } : reply;
    },
    /** Live door designs only (an archived one shows as missing → reassign). → { ok, rows } */
    async listDoorDesigns(teamId) {
      const reply = await run(() => client.from('design_door_designs').select(DESIGN_COLUMNS)
        .eq('team_id', teamId).is('archived_at', null).order('sort').order('created_at'));
      return reply.ok ? { ok: true, rows: reply.data ?? [] } : reply;
    },
    /** → { ok, project: <get_design_project reply> | null } */
    async getProject(estProjectId) {
      const reply = await rpc(client, 'get_design_project', { p_est_project_id: estProjectId });
      return reply.ok ? { ok: true, project: reply.data ?? null } : reply;
    },
    saveTeamSettings(teamId, settings, expectedVersion) {
      return rpc(client, 'save_team_settings', {
        p_team_id: teamId, p_settings: settings, p_expected_version: expectedVersion,
      });
    },
    saveProfile({ teamId, profileId, kind, name, data, sort = null, expectedVersion }) {
      return rpc(client, 'save_profile', {
        p_team_id: teamId, p_profile_id: profileId, p_kind: kind, p_name: name,
        p_data: data, p_sort: sort, p_expected_version: expectedVersion,
      });
    },
    saveDoorDesign({ teamId, designId, code, data, sort = null, expectedVersion }) {
      return rpc(client, 'save_door_design', {
        p_team_id: teamId, p_design_id: designId, p_code: code,
        p_data: data, p_sort: sort, p_expected_version: expectedVersion,
      });
    },
    archiveLibraryItem(kind, id, archived = true) {
      return rpc(client, 'archive_library_item', { p_kind: kind, p_id: id, p_archived: archived });
    },
    saveProjectOverrides(estProjectId, overrides, expectedVersion) {
      return rpc(client, 'save_project_overrides', {
        p_est_project_id: estProjectId, p_overrides: overrides, p_expected_version: expectedVersion,
      });
    },
    savePhaseOverrides(phaseId, overrides, expectedVersion) {
      return rpc(client, 'save_phase_overrides', {
        p_phase_id: phaseId, p_overrides: overrides, p_expected_version: expectedVersion,
      });
    },
  };
}

let defaultApi = null;

/** The app's API over the real Supabase client, loaded on first use (keeps tests env-free). */
export async function getDesignApi() {
  if (!defaultApi) {
    const { supabase } = await import('./supabaseClient.js');
    defaultApi = createDesignApi(supabase);
  }
  return defaultApi;
}
