import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
import { withDesignApi } from '../elevation/store/cloudThunks.js';
import { nextName, projectAddress } from '../elevation/model/designProjects.js';
import { selectDesignPermissions } from '../store/permissions.js';
import PhaseSection from './PhaseSection.jsx';
import ProjectInfoDialog from './ProjectInfoDialog.jsx';
import CopyRoomDialog from './CopyRoomDialog.jsx';

export default function ProjectPage() {
  const { projectId } = useParams();
  const estProjectId = Number(projectId);
  const dispatch = useDispatch();
  const teamId = useSelector((state) => state.auth.teamId);
  const { view, edit } = useSelector(selectDesignPermissions);
  const [loaded, setLoaded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [copying, setCopying] = useState(null);

  useEffect(() => {
    if (!teamId || !view) return;
    let active = true;
    setLoading(true);
    setError(null);
    setLoadFailed(false);
    async function load() {
      const reply = await dispatch(withDesignApi((api) => api.getProject(estProjectId)));
      if (!active) return;
      if (reply.ok) setLoaded({ estProjectId, teamId, data: reply.project });
      else { setError(reply.message); setLoadFailed(true); }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [dispatch, teamId, view, estProjectId, reload]);

  function refresh() {
    setLoading(true);
    setReload((value) => value + 1);
  }

  async function write(call) {
    if (!teamId || !view || !edit || loading || saving) return false;
    setSaving(true);
    setError(null);
    const reply = await dispatch(withDesignApi(call));
    setSaving(false);
    if (reply.ok) refresh();
    else setError(reply.message);
    return reply.ok;
  }

  if (!teamId) return <p className="p-6">You are not on a team.</p>;
  if (!view) return <p className="p-6">You don&apos;t have permission to view designs.</p>;

  const data = loaded?.estProjectId === estProjectId && loaded?.teamId === teamId ? loaded.data : null;
  const phases = [...(data?.phases ?? [])].sort((a, b) => a.sort - b.sort);
  const project = data?.project;
  const archived = Boolean(data?.design?.archived_at);

  return <div className="h-full overflow-auto p-6 space-y-5">
    {error && <div role="alert" className="rounded border border-red-700 bg-red-950 p-3 text-red-200">
      {error}{loadFailed && <button type="button" className="ml-4 underline" onClick={refresh}>Retry</button>}
    </div>}
    <Link to="/projects" className="text-blue-400 hover:underline">← Projects</Link>
    {loading ? <p role="status">Loading project…</p> : !data ? !loadFailed && <p>That project is not in the designer.</p> : <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{project.est_project_name}{archived && <span className="ml-2 rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-400">Archived</span>}</h1>
          <p className="text-gray-400">{project.est_client_name}</p>
          <p className="text-gray-400">{projectAddress(project)}</p>
        </div>
        {edit && <div className="flex gap-3">
          <button type="button" disabled={saving} onClick={() => setEditingInfo(true)}>Edit info</button>
          <button type="button" disabled={saving} onClick={() => write((api) => api.archiveProject(estProjectId, !archived))}>{archived ? 'Restore project' : 'Archive project'}</button>
        </div>}
      </header>
      {/* Project settings are added in DB5 d. */}
      <div className="flex justify-end">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />Show archived</label>
      </div>
      {phases.filter((phase) => includeArchived || !phase.archived_at).map((phase) => <PhaseSection
        key={phase.phase_id} phase={phase} projectId={estProjectId} edit={edit} busy={saving}
        includeArchived={includeArchived} onWrite={write} onCopy={(room) => setCopying({ room, phaseId: phase.phase_id })}
      />)}
      {edit && <button type="button" disabled={saving} className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-500 disabled:opacity-50" onClick={() => write((api) => api.createPhase(estProjectId, nextName('Phase', phases.map((phase) => phase.name))))}>+ Phase</button>}
      {editingInfo && edit && <ProjectInfoDialog key={`${teamId}:${estProjectId}`} project={project} onClose={() => setEditingInfo(false)} onSaved={() => { setEditingInfo(false); refresh(); }} />}
      {copying && edit && <CopyRoomDialog key={`${teamId}:${estProjectId}:${copying.room.room_id}`} room={copying.room} phaseId={copying.phaseId} phases={phases} onClose={() => setCopying(null)} onCopied={() => { setCopying(null); refresh(); }} />}
    </>}
  </div>;
}
