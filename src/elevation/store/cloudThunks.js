/**
 * Loading the shop (Supabase) workspace and switching back to this browser's sandbox
 * (SPEC-DB4 e). The API comes from the thunk extra argument `{ getDesignApi }` (tests pass
 * a fake), falling back to the real client.
 */
import { getDesignApi as defaultGetDesignApi } from '../../api/designApi.js';
import {
  doorDesignFromRow,
  doorDesignToRow,
  profileFromRow,
  teamSettingsFromRow,
} from '../model/cloudRows.js';
import { SEEDED_DESIGN_IDS, isDoorDesignList } from '../model/doorDesigns.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS, findDoorDesign } from '../model/doorStyles.js';
import { cleanOverrides } from '../model/settingsResolve.js';
import {
  cloudWorkspaceFailed,
  cloudWorkspaceLoaded,
  cloudWorkspaceLoading,
  layersLoaded,
  localWorkspaceLoaded,
} from './elevationSlice.js';
import { loadElevationDocument } from './persistence.js';

function apiFrom(extra) {
  return (extra?.getDesignApi ?? defaultGetDesignApi)();
}

/** Hand a component's call the store's API and return its reply. */
export function withDesignApi(fn) {
  return async (dispatch, getState, extra) => {
    const api = await apiFrom(extra);
    return await fn(api);
  };
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** Built-ins first (in seed order), then the team's own designs in row order. */
function orderDesigns(designs) {
  const seeded = SEEDED_DESIGN_IDS.map((id) => designs.find((design) => design.id === id)).filter(Boolean);
  return [...seeded, ...designs.filter((design) => !SEEDED_DESIGN_IDS.includes(design.id))];
}

/**
 * Load the team's shop standard and library and make them the workspace.
 * Resolves `{ ok: true }` or `{ ok: false, reason, message }`.
 */
export function openCloudWorkspace() {
  return async (dispatch, getState, extra) => {
    const { teamId, permissions } = getState().auth ?? {};
    if (!teamId) {
      const failure = { ok: false, reason: 'no_team', message: 'You are not on a team, so there is no shop data to open.' };
      dispatch(cloudWorkspaceFailed(failure.message));
      return failure;
    }
    dispatch(cloudWorkspaceLoading());
    const api = await apiFrom(extra);
    const [settingsReply, profilesReply, designsReply] = await Promise.all([
      api.loadTeamSettings(teamId), api.listProfiles(teamId), api.listDoorDesigns(teamId),
    ]);
    const failed = [settingsReply, profilesReply, designsReply].find((reply) => !reply.ok);
    if (failed) {
      const message = `Couldn't load the shop data: ${failed.message}`;
      dispatch(cloudWorkspaceFailed(message));
      return { ok: false, reason: failed.reason, message };
    }

    const notes = [];
    const rows = { profiles: {}, doorDesigns: {} };

    const profiles = [];
    for (const row of profilesReply.rows) {
      const profile = profileFromRow(row);
      if (!profile) continue;
      profiles.push(profile);
      rows.profiles[profile.id] = { rowId: row.profile_id, version: row.version };
    }
    const skippedProfiles = profilesReply.rows.length - profiles.length;
    if (skippedProfiles) notes.push(`${plural(skippedProfiles, 'profile')} couldn't be read and ${skippedProfiles === 1 ? 'was' : 'were'} left out.`);

    let designs = [];
    for (const row of designsReply.rows) {
      const design = doorDesignFromRow(row);
      if (!design || designs.some((entry) => entry.id === design.id)) continue;
      designs.push(design);
      rows.doorDesigns[design.id] = { rowId: row.design_id, version: row.version };
    }

    // Built-in designs are rows like any other, written once per team (SPEC-DB4 §1).
    for (const seed of DOOR_DESIGNS.filter((design) => SEEDED_DESIGN_IDS.includes(design.id))) {
      if (designs.some((design) => design.id === seed.id)) continue;
      if (permissions?.manage) {
        const { code, data } = doorDesignToRow(seed);
        const reply = await api.saveDoorDesign({ teamId, designId: null, code, data, expectedVersion: 0 });
        if (reply.ok) {
          designs.push(structuredClone(seed));
          rows.doorDesigns[seed.id] = { rowId: reply.design_id, version: reply.version };
          continue;
        }
        notes.push(`The built-in "${seed.code}" design couldn't be saved (${reply.message ?? reply.reason}); using it unsaved.`);
      }
      designs.push(structuredClone(seed));
    }
    designs = orderDesigns(designs);
    if (!isDoorDesignList(designs)) {
      const message = 'The shop\'s door designs conflict (two designs share a code). Fix them in Supabase, then reload.';
      dispatch(cloudWorkspaceFailed(message));
      return { ok: false, reason: 'bad_input', message };
    }

    const settings = teamSettingsFromRow(settingsReply.row?.settings);
    if (!findDoorDesign(settings.teamDoorStyle.designId, designs)) {
      settings.teamDoorStyle = structuredClone(DEFAULT_DOOR_STYLE);
      notes.push('The team door style used a door design that no longer exists; it was reset to the default.');
    }
    settings.doorDesigns = designs;
    settings.sectionProfiles = profiles;

    dispatch(cloudWorkspaceLoaded({
      teamId,
      permissions: { view: false, edit: false, manage: false, ...permissions },
      settings,
      teamVersion: settingsReply.row?.version ?? 0,
      rows,
      message: notes.length ? notes.join(' ') : null,
    }));
    return { ok: true };
  };
}

/** Load a project's (and optionally one phase's) overrides into the shop workspace. */
export function loadProjectLayers({ estProjectId, phaseId = null }) {
  return async (dispatch, getState, extra) => {
    if (getState().elevation.source !== 'cloud') return { ok: false, reason: 'not_cloud', message: 'Open the shop data first.' };
    const api = await apiFrom(extra);
    const reply = await api.getProject(estProjectId);
    if (!reply.ok) return reply;
    if (!reply.project) return { ok: false, reason: 'not_found', message: 'That project is not in the designer.' };
    const { design, phases = [] } = reply.project;
    const phase = phaseId == null ? null : phases.find((entry) => entry.phase_id === phaseId);
    if (phaseId != null && !phase) return { ok: false, reason: 'not_found', message: 'That phase is not in this project.' };
    dispatch(layersLoaded({
      project: { id: estProjectId, values: cleanOverrides(design?.overrides, 'project'), version: design?.version ?? 1 },
      phase: phase ? { id: phase.phase_id, values: cleanOverrides(phase.overrides, 'phase'), version: phase.version } : null,
    }));
    return { ok: true };
  };
}

/** Back to this browser's sandbox (the localStorage document, untouched while on shop data). */
export function openLocalWorkspace() {
  return (dispatch) => {
    dispatch(localWorkspaceLoaded(loadElevationDocument()));
    return { ok: true };
  };
}
