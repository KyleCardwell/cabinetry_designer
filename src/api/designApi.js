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
const ROOM_COLUMNS = 'room_id, phase_id, name, status, status_at, version, schema_version, document, archived_at, updated_at';
const DESIGN_COLUMNS = 'design_id, code, data, version, sort, archived_at';
const PULL_COLUMNS = 'pull_id, name, data, hardware_pull_id, version, sort, archived_at';
const VERSION_COLUMNS = 'version_id, room_id, seq, label, note, document, schema_version, settings_snapshot, issued_by, issued_at';

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
    /** Live pulls only, in library order. → { ok, rows } */
    async listPulls(teamId) {
      const reply = await run(() => client.from('design_pulls').select(PULL_COLUMNS)
        .eq('team_id', teamId).is('archived_at', null).order('sort').order('created_at'));
      return reply.ok ? { ok: true, rows: reply.data ?? [] } : reply;
    },
    /** → { ok, project: <get_design_project reply> | null } */
    async getProject(estProjectId) {
      const reply = await rpc(client, 'get_design_project', { p_est_project_id: estProjectId });
      return reply.ok ? { ok: true, project: reply.data ?? null } : reply;
    },
    /**
     * One room with its document (a plain select, DB16). → { ok, room: row | null }
     * Row: room_id, phase_id, name, status, status_at, version, schema_version, document, archived_at, updated_at.
     */
    async getRoom(roomId) {
      const reply = await run(() => client.from('design_rooms')
        .select(ROOM_COLUMNS).eq('room_id', roomId).maybeSingle());
      return reply.ok ? { ok: true, room: reply.data ?? null } : reply;
    },
    /**
     * Autosave of a room's document. → { ok, version, updated_at, status } | conflict
     * | { ok:false, reason:'status', status, status_by_name, status_at, version } | { ok:false, reason:'archived' }
     * `demote` is true only after the user confirmed editing an Approved/Released room.
     */
    saveRoomDocument({ roomId, document, schemaVersion, expectedVersion, demote = false }) {
      return rpc(client, 'save_room_document', {
        p_room_id: roomId, p_document: document, p_schema_version: schemaVersion,
        p_expected_version: expectedVersion, p_demote: demote,
      });
    },
    /** → { ok, status, status_at, version } | conflict */
    setRoomStatus({ roomId, status, expectedVersion }) {
      return rpc(client, 'set_room_status', {
        p_room_id: roomId, p_status: status, p_expected_version: expectedVersion,
      });
    },
    /** Freeze the room's saved draft as its next version. → { ok, version_id, seq, label, issued_at } | conflict */
    issueRoomVersion({ roomId, label, note = null, settingsSnapshot, expectedVersion }) {
      return rpc(client, 'issue_room_version', {
        p_room_id: roomId, p_label: label, p_note: note,
        p_settings_snapshot: settingsSnapshot, p_expected_version: expectedVersion,
      });
    },
    /** A room's issued versions, newest first, without documents. → { ok, rows } */
    async listRoomVersions(roomId) {
      const reply = await rpc(client, 'list_design_room_versions', { p_room_id: roomId });
      return reply.ok ? { ok: true, rows: reply.data ?? [] } : reply;
    },
    /**
     * One issued version with its document and settings snapshot (a plain select). → { ok, version: row | null }
     * Row: version_id, room_id, seq, label, note, document, schema_version, settings_snapshot, issued_by, issued_at.
     */
    async getRoomVersion(versionId) {
      const reply = await run(() => client.from('design_room_versions')
        .select(VERSION_COLUMNS).eq('version_id', versionId).maybeSingle());
      return reply.ok ? { ok: true, version: reply.data ?? null } : reply;
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
    savePull({ teamId, pullId, name, data, hardwarePullId = null, sort = null, expectedVersion }) {
      return rpc(client, 'save_pull', {
        p_team_id: teamId, p_pull_id: pullId, p_name: name, p_data: data,
        p_hardware_pull_id: hardwarePullId, p_sort: sort, p_expected_version: expectedVersion,
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
    async listProjects(teamId, includeArchived = false) {
      const reply = await rpc(client, 'list_design_projects', {
        p_team_id: teamId, p_include_archived: includeArchived,
      });
      return reply.ok ? { ok: true, rows: reply.data ?? [] } : reply;
    },
    async listAttachableProjects(teamId, search = '') {
      const reply = await rpc(client, 'list_attachable_estimate_projects', {
        p_team_id: teamId, p_search: search,
      });
      return reply.ok ? { ok: true, rows: reply.data ?? [] } : reply;
    },
    createProject({ teamId, estProjectId = null, project = null, phaseName = null,
      roomName = null, roomDocument = null, schemaVersion = null }) {
      return rpc(client, 'create_design_project', {
        p_team_id: teamId, p_est_project_id: estProjectId, p_project: project,
        p_phase_name: phaseName, p_room_name: roomName, p_room_document: roomDocument,
        p_schema_version: schemaVersion,
      });
    },
    updateProjectInfo(estProjectId, info) {
      return rpc(client, 'update_design_project_info', { p_est_project_id: estProjectId, p_info: info });
    },
    archiveProject(estProjectId, archived = true) {
      return rpc(client, 'archive_design_project', { p_est_project_id: estProjectId, p_archived: archived });
    },
    createPhase(estProjectId, name) {
      return rpc(client, 'create_design_phase', { p_est_project_id: estProjectId, p_name: name });
    },
    updatePhase(phaseId, { name = null, sort = null, archived = null } = {}) {
      return rpc(client, 'update_design_phase', {
        p_phase_id: phaseId, p_name: name, p_sort: sort, p_archived: archived,
      });
    },
    createRoom(phaseId, name, document, schemaVersion) {
      return rpc(client, 'create_design_room', {
        p_phase_id: phaseId, p_name: name, p_document: document, p_schema_version: schemaVersion,
      });
    },
    copyRoom(roomId, toPhaseId, name = null) {
      return rpc(client, 'copy_design_room', { p_room_id: roomId, p_to_phase_id: toPhaseId, p_name: name });
    },
    updateRoomInfo(roomId, { name = null, sort = null, archived = null } = {}) {
      return rpc(client, 'update_design_room_info', {
        p_room_id: roomId, p_name: name, p_sort: sort, p_archived: archived,
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
