import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { withDesignApi } from '../elevation/store/cloudThunks.js';
import { projectAddress } from '../elevation/model/designProjects.js';
import { selectDesignPermissions } from '../store/permissions.js';
import NewProjectDialog from './NewProjectDialog.jsx';

const COLUMNS = 'grid grid-cols-[2fr_1.5fr_2fr_1fr_1fr] gap-4 px-4 py-3';

export default function ProjectsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const teamId = useSelector((state) => state.auth.teamId);
  const { view, edit } = useSelector(selectDesignPermissions);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!teamId || !view) return;
    let active = true;
    setLoading(true);
    setError(null);
    async function load() {
      const reply = await dispatch(withDesignApi((api) => api.listProjects(teamId, includeArchived)));
      if (!active) return;
      if (reply.ok) setRows(reply.rows);
      else setError(reply.message);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [dispatch, teamId, view, includeArchived, reload]);

  if (!teamId) return <p className="p-6">You are not on a team.</p>;
  if (!view) return <p className="p-6">You don&apos;t have permission to view designs.</p>;

  const query = search.toLowerCase();
  const filtered = rows.filter((row) => [row.est_project_name, row.est_client_name, projectAddress(row)]
    .some((value) => String(value ?? '').toLowerCase().includes(query)));

  return (
    <div className="h-full overflow-auto p-6 space-y-5">
      {error && (
        <div role="alert" className="rounded border border-red-700 bg-red-950 p-3 text-red-200">
          {error}
          <button type="button" className="ml-4 underline" onClick={() => setReload((value) => value + 1)}>Retry</button>
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Projects</h1>
        {edit && <button type="button" className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-500" onClick={() => setCreating(true)}>New project</button>}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <input aria-label="Search projects" type="search" placeholder="Search projects" value={search} onChange={(event) => setSearch(event.target.value)} className="rounded border border-gray-600 bg-gray-900 px-3 py-2" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
          Show archived
        </label>
      </div>
      {loading ? <p role="status">Loading projects…</p> : !error && rows.length === 0 ? <p>No projects yet.</p> : (
        <div className="overflow-x-auto rounded border border-gray-700">
          <div className="min-w-[720px]">
            <div className={`${COLUMNS} bg-gray-800 text-sm font-medium text-gray-400`}>
              {['Project', 'Client', 'Address', 'Phases / rooms', 'Updated'].map((heading) => <span key={heading}>{heading}</span>)}
            </div>
            {filtered.map((row) => (
              <Link key={row.est_project_id} to={`/projects/${row.est_project_id}`} className={`${COLUMNS} border-t border-gray-700 text-sm hover:bg-gray-800 ${row.archived_at ? 'text-gray-500' : 'text-gray-200'}`}>
                <span className="font-medium">{row.est_project_name}{row.archived_at && <span className="ml-2 rounded bg-gray-700 px-2 py-0.5 text-xs">Archived</span>}</span>
                <span>{row.est_client_name || '—'}</span>
                <span>{projectAddress(row) || '—'}</span>
                <span>{row.phase_count} / {row.room_count}</span>
                <span>{row.updated_at ? new Date(row.updated_at).toLocaleDateString() : '—'}</span>
              </Link>
            ))}
            {rows.length > 0 && filtered.length === 0 && <p className="p-4 text-sm text-gray-400">No matching projects.</p>}
          </div>
        </div>
      )}
      {creating && edit && <NewProjectDialog key={teamId} onClose={() => setCreating(false)} onCreated={(projectId) => {
        setCreating(false);
        setReload((value) => value + 1);
        navigate(`/projects/${projectId}`);
      }} />}
    </div>
  );
}
