import { configureStore } from '@reduxjs/toolkit';
import elevationReducer from '../../elevationSlice.js';
import presenceReducer from '../../presenceSlice.js';

let counter = 0;
export function fakeUuid() {
  counter += 1;
  return `0192a1b2-c3d4-7e5f-8a9b-${String(counter).padStart(12, '0')}`;
}

/**
 * An in-memory stand-in for createDesignApi(): keeps rows, bumps versions, answers conflicts
 * like the RPCs, and records every call. `hold()` makes saves wait until `release()`.
 */
export function fakeDesignApi({ teamSettings = null, profiles = [], doorDesigns = [], pulls = [], project = null,
  projects = [], attachableProjects = [] } = {}) {
  const db = {
    teamSettings: teamSettings && { ...teamSettings },
    profiles: profiles.map((row) => ({ ...row })),
    doorDesigns: doorDesigns.map((row) => ({ ...row })),
    pulls: structuredClone(pulls),
    project,
    projects: structuredClone(projects),
    attachableProjects: structuredClone(attachableProjects),
    versions: [],
  };
  const calls = [];
  let gate = null;
  const wait = () => gate?.promise ?? Promise.resolve();
  const conflict = (version) => ({ ok: false, reason: 'conflict', version, updated_by_name: 'Other', updated_at: 't' });
  const missing = (kind) => ({ ok: false, reason: 'not_found', message: `${kind} not found` });
  const phaseFor = (id) => db.project?.phases.find((phase) => phase.phase_id === id);
  const roomFor = (id) => db.project?.phases.flatMap((phase) => phase.rooms).find((room) => room.room_id === id);
  const nextSort = (rows) => Math.max(-1, ...rows.map((row) => row.sort ?? 0)) + 1;
  const patchInfo = (row, { name, sort, archived }) => {
    if (name !== null) row.name = name;
    if (sort !== null) row.sort = sort;
    if (archived !== null) row.archived_at = archived ? 't' : null;
    row.updated_at = 't';
  };
  const addPhase = (name) => {
    const phase = { phase_id: fakeUuid(), name, sort: nextSort(db.project.phases),
      archived_at: null, overrides: {}, version: 1, rooms: [], updated_at: 't' };
    db.project.phases.push(phase);
    return phase;
  };
  const addRoom = (phase, name, document, schemaVersion) => {
    const room = { room_id: fakeUuid(), phase_id: phase.phase_id, name,
      document: structuredClone(document), schema_version: schemaVersion,
      sort: nextSort(phase.rooms), archived_at: null, status: 'drafting',
      version: 1, last_version: null, updated_at: 't' };
    phase.rooms.push(room);
    return room;
  };
  const d5Call = async (name, args, run) => {
    calls.push([name, ...structuredClone(args)]);
    await wait();
    if (api.failNext) { const reply = api.failNext; api.failNext = null; return reply; }
    if (name in api.replies) return structuredClone(api.replies[name]);
    return run();
  };
  const api = {
    db,
    calls,
    failNext: null,
    replies: {},
    hold() { let release; gate = { promise: new Promise((resolve) => { release = resolve; }) }; gate.release = release; },
    release() { const current = gate; gate = null; current?.release(); },
    async loadTeamSettings() { calls.push(['loadTeamSettings']); return { ok: true, row: db.teamSettings && structuredClone(db.teamSettings) }; },
    async listProfiles() { calls.push(['listProfiles']); return { ok: true, rows: structuredClone(db.profiles) }; },
    async listDoorDesigns() { calls.push(['listDoorDesigns']); return { ok: true, rows: structuredClone(db.doorDesigns.filter((row) => !row.archived_at)) }; },
    async listPulls() {
      calls.push(['listPulls']);
      return api.replies.listPulls ?? { ok: true, rows: structuredClone(db.pulls.filter((row) => !row.archived_at)) };
    },
    async getProject(id) { calls.push(['getProject', id]); return { ok: true, project: db.project && structuredClone(db.project) }; },
    async getRoom(roomId) {
      calls.push(['getRoom', roomId]);
      await wait();
      if (api.failNext) { const reply = api.failNext; api.failNext = null; return reply; }
      const room = roomFor(roomId);
      return { ok: true, room: room ? structuredClone({ status_at: null, ...room }) : null };
    },
    async saveRoomDocument({ roomId, document, schemaVersion, expectedVersion, demote = false }) {
      calls.push(['saveRoomDocument', roomId, expectedVersion, demote]);
      await wait();
      if (api.failNext) { const reply = api.failNext; api.failNext = null; return reply; }
      const room = roomFor(roomId);
      if (!room) return missing('Room');
      if (room.archived_at) return { ok: false, reason: 'archived' };
      if (room.version !== expectedVersion) return conflict(room.version);
      if (room.status !== 'drafting' && !demote) {
        return { ok: false, reason: 'status', status: room.status, status_by_name: 'Other', status_at: 't', version: room.version };
      }
      Object.assign(room, { document: structuredClone(document), schema_version: schemaVersion,
        version: room.version + 1, status: 'drafting', updated_at: 't2' });
      return { ok: true, version: room.version, updated_at: room.updated_at, status: room.status };
    },
    async setRoomStatus({ roomId, status, expectedVersion }) {
      calls.push(['setRoomStatus', roomId, status, expectedVersion]);
      await wait();
      if (api.failNext) { const reply = api.failNext; api.failNext = null; return reply; }
      const room = roomFor(roomId);
      if (!room) return missing('Room');
      if (room.version !== expectedVersion) return conflict(room.version);
      Object.assign(room, { status, status_at: 't-status', status_by_name: 'Me' });
      return { ok: true, status, status_at: room.status_at, version: room.version };
    },
    async issueRoomVersion({ roomId, label, note = null, settingsSnapshot, expectedVersion }) {
      calls.push(['issueRoomVersion', roomId, label, note, expectedVersion]);
      await wait();
      if (api.failNext) { const reply = api.failNext; api.failNext = null; return reply; }
      const room = roomFor(roomId);
      if (!room) return missing('Room');
      if (room.version !== expectedVersion) return conflict(room.version);
      const seq = db.versions.filter((entry) => entry.room_id === roomId).length + 1;
      const version = { version_id: fakeUuid(), room_id: roomId, seq, label: label.trim(), note,
        document: structuredClone(room.document), schema_version: room.schema_version,
        settings_snapshot: structuredClone(settingsSnapshot), issued_by: 'user-me', issued_by_name: 'Me',
        issued_at: `t-issued-${seq}` };
      db.versions.push(version);
      room.last_version = { seq, label: version.label, issued_at: version.issued_at };
      return { ok: true, version_id: version.version_id, seq, label: version.label, issued_at: version.issued_at };
    },
    async listRoomVersions(roomId) {
      calls.push(['listRoomVersions', roomId]);
      const rows = db.versions.filter((entry) => entry.room_id === roomId)
        .sort((a, b) => b.seq - a.seq)
        .map((entry) => {
          const row = structuredClone(entry);
          for (const key of ['document', 'settings_snapshot', 'room_id']) delete row[key];
          return row;
        });
      return { ok: true, rows };
    },
    async getRoomVersion(versionId) {
      calls.push(['getRoomVersion', versionId]);
      const row = db.versions.find((entry) => entry.version_id === versionId);
      if (!row) return { ok: true, version: null };
      const version = structuredClone(row);
      delete version.issued_by_name; // a plain select has no names
      return { ok: true, version };
    },
    async saveTeamSettings(teamId, settings, expected) {
      calls.push(['saveTeamSettings', expected]);
      await wait();
      if (api.failNext) { const reply = api.failNext; api.failNext = null; return reply; }
      const version = db.teamSettings?.version ?? 0;
      if (expected !== version) return conflict(version);
      db.teamSettings = { settings: structuredClone(settings), version: version + 1 };
      return { ok: true, version: version + 1, updated_at: 't' };
    },
    async saveProfile({ profileId, kind, name, data, expectedVersion }) {
      calls.push(['saveProfile', profileId, expectedVersion]);
      await wait();
      if (expectedVersion === 0) {
        const row = { profile_id: profileId ?? fakeUuid(), kind, name, data: structuredClone(data), version: 1, archived_at: null };
        db.profiles.push(row);
        return { ok: true, profile_id: row.profile_id, version: 1, updated_at: 't' };
      }
      const row = db.profiles.find((entry) => entry.profile_id === profileId);
      if (row.version !== expectedVersion) return conflict(row.version);
      Object.assign(row, { kind, name, data: structuredClone(data), version: row.version + 1 });
      return { ok: true, profile_id: profileId, version: row.version, updated_at: 't' };
    },
    async saveDoorDesign({ designId, code, data, expectedVersion }) {
      calls.push(['saveDoorDesign', designId, expectedVersion, code]);
      await wait();
      if (expectedVersion === 0) {
        const row = { design_id: designId ?? fakeUuid(), code, data: structuredClone(data), version: 1, archived_at: null };
        db.doorDesigns.push(row);
        return { ok: true, design_id: row.design_id, version: 1, updated_at: 't' };
      }
      const row = db.doorDesigns.find((entry) => entry.design_id === designId);
      if (row.version !== expectedVersion) return conflict(row.version);
      Object.assign(row, { code, data: structuredClone(data), version: row.version + 1 });
      return { ok: true, design_id: designId, version: row.version, updated_at: 't' };
    },
    async savePull({ pullId, name, data, hardwarePullId = null, sort = null, expectedVersion }) {
      calls.push(['savePull', pullId, expectedVersion, name]);
      await wait();
      if (api.replies.savePull) return structuredClone(api.replies.savePull);
      if (expectedVersion === 0) {
        const row = { pull_id: pullId ?? fakeUuid(), name, data: structuredClone(data), hardware_pull_id: hardwarePullId,
          sort, version: 1, archived_at: null };
        db.pulls.push(row);
        return { ok: true, pull_id: row.pull_id, version: 1, updated_at: 't' };
      }
      const row = db.pulls.find((entry) => entry.pull_id === pullId);
      if (!row) return missing('Pull');
      if (row.version !== expectedVersion) return conflict(row.version);
      Object.assign(row, { name, data: structuredClone(data), hardware_pull_id: hardwarePullId, version: row.version + 1 });
      if (sort !== null) row.sort = sort;
      return { ok: true, pull_id: pullId, version: row.version, updated_at: 't' };
    },
    async archiveLibraryItem(kind, id, archived) {
      calls.push(['archiveLibraryItem', kind, id, archived]);
      await wait();
      const list = kind === 'profile' ? db.profiles : kind === 'pull' ? db.pulls : db.doorDesigns;
      const key = kind === 'profile' ? 'profile_id' : kind === 'pull' ? 'pull_id' : 'design_id';
      const row = list.find((entry) => entry[key] === id);
      row.archived_at = archived ? 't' : null;
      return { ok: true };
    },
    async saveProjectOverrides(id, overrides, expected) {
      calls.push(['saveProjectOverrides', id, expected]);
      await wait();
      const design = db.project.design;
      if (design.version !== expected) return conflict(design.version);
      Object.assign(design, { overrides: structuredClone(overrides), version: design.version + 1 });
      return { ok: true, version: design.version, updated_at: 't' };
    },
    async savePhaseOverrides(id, overrides, expected) {
      calls.push(['savePhaseOverrides', id, expected]);
      await wait();
      const phase = db.project.phases.find((entry) => entry.phase_id === id);
      if (phase.version !== expected) return conflict(phase.version);
      Object.assign(phase, { overrides: structuredClone(overrides), version: phase.version + 1 });
      return { ok: true, version: phase.version, updated_at: 't' };
    },
    listProjects(teamId, includeArchived = false) {
      return d5Call('listProjects', [teamId, includeArchived], () => {
        const rows = db.projects.map((row) => {
          if (db.project?.project.est_project_id !== row.est_project_id) return row;
          const phases = db.project.phases.filter((phase) => !phase.archived_at);
          return { ...row, phase_count: phases.length,
            room_count: phases.flatMap((phase) => phase.rooms).filter((room) => !room.archived_at).length };
        }).filter((row) => includeArchived || !row.archived_at);
        return { ok: true, rows: structuredClone(rows) };
      });
    },
    listAttachableProjects(teamId, search = '') {
      return d5Call('listAttachableProjects', [teamId, search], () => ({ ok: true,
        rows: structuredClone(db.attachableProjects.filter((row) =>
          !db.projects.some((entry) => entry.est_project_id === row.est_project_id)
          && [row.est_project_name, row.est_client_name].some((value) =>
            (value ?? '').toLowerCase().includes(search.trim().toLowerCase())))),
      }));
    },
    createProject({ teamId, estProjectId = null, project = null, phaseName = null,
      roomName = null, roomDocument = null, schemaVersion = null }) {
      return d5Call('createProject', [{ teamId, estProjectId, project, phaseName,
        roomName, roomDocument, schemaVersion }], () => {
        const id = estProjectId ?? Math.max(0, ...db.projects.map((row) => row.est_project_id),
          ...db.attachableProjects.map((row) => row.est_project_id)) + 1;
        const info = estProjectId === null ? project
          : db.attachableProjects.find((row) => row.est_project_id === id);
        if (!info) return missing('Project');
        const row = { ...structuredClone(info), est_project_id: id, archived_at: null,
          phase_count: 0, room_count: 0, updated_at: 't' };
        db.projects.unshift(row);
        db.project = { project: { ...row }, design: { overrides: {}, version: 1, archived_at: null }, phases: [] };
        const phase = phaseName === null ? null : addPhase(phaseName);
        const room = phase && roomName !== null ? addRoom(phase, roomName, roomDocument, schemaVersion) : null;
        return { ok: true, est_project_id: id, phase_id: phase?.phase_id ?? null, room_id: room?.room_id ?? null };
      });
    },
    updateProjectInfo(estProjectId, info) {
      return d5Call('updateProjectInfo', [estProjectId, info], () => {
        const row = db.projects.find((entry) => entry.est_project_id === estProjectId);
        const detail = db.project?.project.est_project_id === estProjectId ? db.project.project : null;
        if (!row && !detail) return missing('Project');
        if (row) Object.assign(row, info);
        if (detail) Object.assign(detail, info);
        return { ok: true };
      });
    },
    archiveProject(estProjectId, archived = true) {
      return d5Call('archiveProject', [estProjectId, archived], () => {
        const row = db.projects.find((entry) => entry.est_project_id === estProjectId);
        const detail = db.project?.project.est_project_id === estProjectId ? db.project.design : null;
        if (!row && !detail) return missing('Project');
        if (row) row.archived_at = archived ? 't' : null;
        if (detail) detail.archived_at = archived ? 't' : null;
        return { ok: true };
      });
    },
    createPhase(estProjectId, name) {
      return d5Call('createPhase', [estProjectId, name], () => {
        if (db.project?.project.est_project_id !== estProjectId) return missing('Project');
        const phase = addPhase(name);
        return { ok: true, phase_id: phase.phase_id, sort: phase.sort, version: 1 };
      });
    },
    updatePhase(phaseId, { name = null, sort = null, archived = null } = {}) {
      return d5Call('updatePhase', [phaseId, { name, sort, archived }], () => {
        const phase = phaseFor(phaseId);
        if (!phase) return missing('Phase');
        patchInfo(phase, { name, sort, archived });
        return { ok: true };
      });
    },
    createRoom(phaseId, name, document, schemaVersion) {
      return d5Call('createRoom', [phaseId, name, document, schemaVersion], () => {
        const phase = phaseFor(phaseId);
        if (!phase) return missing('Phase');
        const room = addRoom(phase, name, document, schemaVersion);
        return { ok: true, room_id: room.room_id, sort: room.sort, version: 1 };
      });
    },
    copyRoom(roomId, toPhaseId, name = null) {
      return d5Call('copyRoom', [roomId, toPhaseId, name], () => {
        const source = roomFor(roomId);
        const phase = phaseFor(toPhaseId);
        if (!source || !phase) return missing(!source ? 'Room' : 'Phase');
        const room = addRoom(phase, name ?? source.name, source.document, source.schema_version);
        room.copied_from_room_id = roomId;
        return { ok: true, room_id: room.room_id, sort: room.sort, version: 1 };
      });
    },
    updateRoomInfo(roomId, { name = null, sort = null, archived = null } = {}) {
      return d5Call('updateRoomInfo', [roomId, { name, sort, archived }], () => {
        const room = roomFor(roomId);
        if (!room) return missing('Room');
        patchInfo(room, { name, sort, archived });
        return { ok: true };
      });
    },
  };
  return api;
}

export const TEAM_ID = '0192a1b2-0000-7000-8000-00000000000a';
export const ALL = { view: true, edit: true, manage: true };

export function cloudStore(api, permissions = ALL, teamId = TEAM_ID, extra = {}) {
  return configureStore({
    reducer: {
      auth: (state = { teamId, permissions, userName: extra.userName ?? 'Me', session: { user: { id: extra.userId ?? 'user-me' } } }) => state,
      elevation: elevationReducer,
      presence: presenceReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({
      thunk: { extraArgument: { getDesignApi: async () => api, ...extra } },
      serializableCheck: false,
      immutableCheck: false,
    }),
  });
}
