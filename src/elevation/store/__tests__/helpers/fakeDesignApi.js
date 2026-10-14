import { configureStore } from '@reduxjs/toolkit';
import elevationReducer from '../../elevationSlice.js';

let counter = 0;
export function fakeUuid() {
  counter += 1;
  return `0192a1b2-c3d4-7e5f-8a9b-${String(counter).padStart(12, '0')}`;
}

/**
 * An in-memory stand-in for createDesignApi(): keeps rows, bumps versions, answers conflicts
 * like the RPCs, and records every call. `hold()` makes saves wait until `release()`.
 */
export function fakeDesignApi({ teamSettings = null, profiles = [], doorDesigns = [], project = null } = {}) {
  const db = {
    teamSettings: teamSettings && { ...teamSettings },
    profiles: profiles.map((row) => ({ ...row })),
    doorDesigns: doorDesigns.map((row) => ({ ...row })),
    project,
  };
  const calls = [];
  let gate = null;
  const wait = () => gate?.promise ?? Promise.resolve();
  const conflict = (version) => ({ ok: false, reason: 'conflict', version, updated_by_name: 'Other', updated_at: 't' });
  const api = {
    db,
    calls,
    failNext: null,
    hold() { let release; gate = { promise: new Promise((resolve) => { release = resolve; }) }; gate.release = release; },
    release() { const current = gate; gate = null; current?.release(); },
    async loadTeamSettings() { calls.push(['loadTeamSettings']); return { ok: true, row: db.teamSettings && structuredClone(db.teamSettings) }; },
    async listProfiles() { calls.push(['listProfiles']); return { ok: true, rows: structuredClone(db.profiles) }; },
    async listDoorDesigns() { calls.push(['listDoorDesigns']); return { ok: true, rows: structuredClone(db.doorDesigns.filter((row) => !row.archived_at)) }; },
    async getProject(id) { calls.push(['getProject', id]); return { ok: true, project: db.project && structuredClone(db.project) }; },
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
    async archiveLibraryItem(kind, id, archived) {
      calls.push(['archiveLibraryItem', kind, id, archived]);
      await wait();
      const list = kind === 'profile' ? db.profiles : db.doorDesigns;
      const key = kind === 'profile' ? 'profile_id' : 'design_id';
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
  };
  return api;
}

export const TEAM_ID = '0192a1b2-0000-7000-8000-00000000000a';
export const ALL = { view: true, edit: true, manage: true };

export function cloudStore(api, permissions = ALL, teamId = TEAM_ID) {
  return configureStore({
    reducer: {
      auth: (state = { teamId, permissions }) => state,
      elevation: elevationReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({
      thunk: { extraArgument: { getDesignApi: async () => api } },
      serializableCheck: false,
      immutableCheck: false,
    }),
  });
}
