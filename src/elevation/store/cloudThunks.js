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
  cloudRoomLoaded,
  cloudRoomPatch,
  cloudRoomRecovered,
  cloudWorkspaceFailed,
  cloudWorkspaceLoaded,
  cloudWorkspaceLoading,
  layersLoaded,
  localWorkspaceLoaded,
} from './elevationSlice.js';
import { cloudSync } from './cloudSync.js';
import { loadElevationDocument, roomFromDocument, toRoomDocument } from './persistence.js';
import { readDraft } from './roomDrafts.js';
import { selectRoomEditors } from './presenceSlice.js';
import { joinProjectPresence, setPresenceRoom } from './presenceThunks.js';

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

// ---------------------------------------------------------------------------------------
// Opening and saving one shop room (SPEC-DB6a). The thunk extra argument may carry
// `drafts` (the IndexedDB draft store) and `sync` (the running cloud sync); the app sets
// `drafts`, and the sync defaults to the registered `cloudSync`.
// ---------------------------------------------------------------------------------------

const syncOf = (extra) => extra?.sync ?? cloudSync;

// Only the latest openCloudRoom may load: a slow reply for a room the user already left is dropped.
let openSeq = 0;

function overridesLayer(id, row) {
  return { id, values: cleanOverrides(row?.overrides, 'project'), version: row?.version ?? 1 };
}

const roomText = (room) => JSON.stringify(toRoomDocument(room));

/**
 * Open one room from the shop data: its drawing, with the shop standard, library and the
 * project / phase overrides it inherits. The editor then holds just this room (`rooms: [room]`).
 * The room's row id and name win over whatever the document says.
 *
 * Unsaved edits are settled first (draft copy written, saves flushed). Then, if this browser
 * holds a draft of the room from an earlier session, either
 *  - it started from the room's current version → it is put back as an edit (`recovered`), saved by the sync; or
 *  - the room was saved by someone else since → the server's room opens and the draft waits
 *    (`cloud.room.staleDraft`) for `applyStaleRoomDraft` / `discardStaleRoomDraft`.
 * `discardLocal` throws away this room's draft and any unsaved edits instead (after a conflict).
 *
 * It also joins the project's presence channel and says this tab has the room open. The room
 * opens read-only (`cloud.room.readOnly`, nothing edits or saves) when the user can't edit
 * (`readOnlyReason: 'permission'`), the room is archived ('archived'), or another tab is
 * editing it ('others', listed in `openBy`; `editRoomAnyway` lifts it). Draft recovery waits
 * while read-only.
 * → { ok: true, recovered, staleDraft, readOnlyReason, openBy } | { ok: false, reason, message }
 */
export function openCloudRoom({ estProjectId, roomId, discardLocal = false }) {
  return async (dispatch, getState, extra) => {
    const sync = syncOf(extra);
    const drafts = extra?.drafts ?? null;
    const seq = ++openSeq;
    const superseded = { ok: false, reason: 'superseded', message: 'Another room was opened.' };

    if (discardLocal) {
      await drafts?.delete(roomId);
    } else if (getState().elevation.source === 'cloud') {
      await sync.saveDraftNow();
      await sync.flush(); // best effort: a paused room keeps its draft copy
    }
    if (getState().elevation.source !== 'cloud' || !getState().elevation.cloud) {
      const opened = await dispatch(openCloudWorkspace());
      if (!opened.ok) return opened;
    }
    const api = await apiFrom(extra);
    const [projectReply, roomReply] = await Promise.all([
      api.getProject(estProjectId),
      api.getRoom(roomId),
      dispatch(joinProjectPresence(estProjectId)), // best effort: never blocks for long
    ]);
    if (seq !== openSeq) return superseded;
    const failed = [projectReply, roomReply].find((reply) => !reply.ok);
    if (failed) return { ok: false, reason: failed.reason, message: `Couldn't open the room: ${failed.message}` };
    const { project } = projectReply;
    const row = roomReply.room;
    if (!project) return { ok: false, reason: 'not_found', message: 'That project is not in the designer.' };
    const phase = project.phases?.find((entry) => entry.rooms?.some((candidate) => candidate.room_id === roomId));
    if (!row || !phase || row.phase_id !== phase.phase_id) {
      return { ok: false, reason: 'not_found', message: 'That room is not in this project.' };
    }
    const listed = phase.rooms.find((candidate) => candidate.room_id === roomId);

    const { settings } = getState().elevation;
    const loaded = roomFromDocument(row.document, row.schema_version, settings);
    if (!loaded.ok) return loaded;

    // Read-only when the user can't edit, the room is archived, or someone else is editing it.
    const openBy = selectRoomEditors(getState(), roomId);
    const readOnlyReason = !getState().elevation.cloud.permissions?.edit ? 'permission'
      : row.archived_at ? 'archived'
        : openBy.length ? 'others' : null;

    dispatch(cloudRoomLoaded({
      room: { ...loaded.room, id: row.room_id, name: row.name },
      layers: {
        project: overridesLayer(estProjectId, project.design),
        phase: { id: phase.phase_id, values: cleanOverrides(phase.overrides, 'phase'), version: phase.version },
      },
      meta: {
        id: row.room_id,
        phaseId: row.phase_id,
        estProjectId,
        version: row.version,
        status: row.status,
        statusAt: row.status_at ?? null,
        statusByName: listed?.status_by_name ?? null,
        archived: Boolean(row.archived_at),
        updatedAt: row.updated_at ?? null,
        schemaVersion: row.schema_version,
        readOnly: Boolean(readOnlyReason),
        readOnlyReason,
      },
    }));
    await dispatch(setPresenceRoom({ roomId, readOnly: Boolean(readOnlyReason) }));

    const result = { ok: true, recovered: false, staleDraft: null, readOnlyReason, openBy };
    if (discardLocal) {
      await drafts?.delete(roomId); // again, in case a queued draft write landed after the first delete
      return result;
    }
    if (readOnlyReason) return result; // a draft waits until the room can be edited (editRoomAnyway)
    const recovery = await recoverDraft(dispatch, getState, drafts, () => seq === openSeq);
    return { ...result, ...recovery };
  };
}

/**
 * Put back this browser's unsaved draft of the open room, if it has one (see openCloudRoom).
 * → { recovered, staleDraft }
 */
async function recoverDraft(dispatch, getState, drafts, stillCurrent = () => true) {
  const none = { recovered: false, staleDraft: null };
  const info = getState().elevation.cloud?.room;
  if (!drafts || !info) return none;
  const roomId = info.id;
  const draft = readDraft(await drafts.get(roomId));
  if (!stillCurrent() || !draft) return none;
  const { settings, cloud } = getState().elevation;
  const usable = draft.teamId === cloud.teamId ? roomFromDocument(draft.document, draft.schemaVersion, settings) : { ok: false };
  if (!usable.ok) {
    await drafts.delete(roomId);
    return none;
  }
  if (draft.baseVersion !== info.version) {
    const staleDraft = { savedAt: draft.savedAt, baseVersion: draft.baseVersion };
    dispatch(cloudRoomPatch({ staleDraft }));
    return { recovered: false, staleDraft };
  }
  const before = roomText(getState().elevation.rooms[0]);
  dispatch(cloudRoomRecovered({ room: usable.room, savedAt: draft.savedAt }));
  if (roomText(getState().elevation.rooms[0]) === before) {
    dispatch(cloudRoomPatch({ recovered: false, recoveredAt: null }));
    await drafts.delete(roomId);
    return none;
  }
  return { recovered: true, staleDraft: null };
}

/**
 * Someone else has the room open and the user chose to edit anyway: the room becomes editable,
 * this tab tells the others it's editing, and a draft from an earlier session is offered as on open.
 * Only for `readOnlyReason: 'others'` (not without permission or for an archived room).
 * → { ok: true, recovered, staleDraft } | { ok: false, reason, message }
 */
export function editRoomAnyway() {
  return async (dispatch, getState, extra) => {
    const info = getState().elevation.cloud?.room;
    if (!info?.readOnly || info.readOnlyReason !== 'others') {
      return { ok: false, reason: 'not_allowed', message: 'This room can\'t be edited here.' };
    }
    dispatch(cloudRoomPatch({ readOnly: false, readOnlyReason: null }));
    await dispatch(setPresenceRoom({ roomId: info.id, readOnly: false }));
    return { ok: true, ...(await recoverDraft(dispatch, getState, extra?.drafts ?? null)) };
  };
}

/** The waiting draft replaces the room as it was saved (others' newer changes are overwritten); the sync saves it. */
export function applyStaleRoomDraft() {
  return async (dispatch, getState, extra) => {
    const info = getState().elevation.cloud?.room;
    const drafts = extra?.drafts ?? null;
    if (!info?.staleDraft || !drafts) return { ok: false, reason: 'no_draft', message: 'There is no saved copy to restore.' };
    const draft = readDraft(await drafts.get(info.id));
    const usable = draft ? roomFromDocument(draft.document, draft.schemaVersion, getState().elevation.settings) : { ok: false };
    if (!usable.ok) {
      await drafts.delete(info.id);
      dispatch(cloudRoomPatch({ staleDraft: null }));
      return { ok: false, reason: 'no_draft', message: 'The saved copy could not be read, so it was removed.' };
    }
    dispatch(cloudRoomRecovered({ room: usable.room, savedAt: draft.savedAt }));
    return { ok: true };
  };
}

/** Forget the waiting draft; the room stays as the server has it. */
export function discardStaleRoomDraft() {
  return async (dispatch, getState, extra) => {
    const info = getState().elevation.cloud?.room;
    if (!info) return { ok: false, reason: 'no_room', message: 'No room is open.' };
    await extra?.drafts?.delete(info.id);
    dispatch(cloudRoomPatch({ staleDraft: null }));
    return { ok: true };
  };
}

/** Conflict, "keep mine": save over the newer version. The user confirmed overwriting the other save. */
export function overwriteRoomConflict() {
  return async (dispatch, getState, extra) => {
    const info = getState().elevation.cloud?.room;
    if (!info || info.conflictVersion === null || info.conflictVersion === undefined) {
      return { ok: false, reason: 'no_conflict', message: 'There is no conflict to settle.' };
    }
    dispatch(cloudRoomPatch({ version: info.conflictVersion, conflictVersion: null }));
    return syncOf(extra).resume('room');
  };
}

/** Conflict, "use theirs": drop this browser's edits and open the room as saved. */
export function reloadRoomAfterConflict() {
  return (dispatch, getState) => {
    const info = getState().elevation.cloud?.room;
    if (!info) return Promise.resolve({ ok: false, reason: 'no_room', message: 'No room is open.' });
    return dispatch(openCloudRoom({ estProjectId: info.estProjectId, roomId: info.id, discardLocal: true }));
  };
}

/**
 * The user agreed to edit an Approved / Released room: the next save drops it to Drafting.
 * Resumes the paused save.
 */
export function allowRoomDemote() {
  return (dispatch, getState, extra) => {
    if (!getState().elevation.cloud?.room) return Promise.resolve({ ok: false, reason: 'no_room', message: 'No room is open.' });
    dispatch(cloudRoomPatch({ demote: true }));
    return syncOf(extra).resume('room');
  };
}

/** Leaving the room page: copy unsaved edits to the draft cache, send what can be sent, and tell the others. */
export function leaveCloudRoom() {
  return async (dispatch, getState, extra) => {
    const reply = await syncOf(extra).flush();
    await dispatch(setPresenceRoom({ roomId: null }));
    return reply;
  };
}
