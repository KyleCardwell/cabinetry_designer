import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { withDesignApi } from '../elevation/store/cloudThunks.js';
import { projectAddress } from '../elevation/model/designProjects.js';
import { selectDesignPermissions } from '../store/permissions.js';

const FIELDS = [['est_project_name', 'Project name'], ['est_client_name', 'Client'], ['street', 'Street'], ['city', 'City'], ['state', 'State'], ['zip', 'Zip']];
const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-gray-100';
const BUTTON_CLASS = 'rounded border border-gray-600 px-4 py-2 hover:bg-gray-700 disabled:opacity-50';

export default function NewProjectDialog({ onClose, onCreated }) {
  const dispatch = useDispatch();
  const teamId = useSelector((state) => state.auth.teamId);
  const { view, edit } = useSelector(selectDesignPermissions);
  const [tab, setTab] = useState('new');
  const [fields, setFields] = useState({});
  const [searchRequest, setSearchRequest] = useState({ value: '', delay: 0 });
  const { value: search, delay } = searchRequest;
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (tab !== 'estimate' || !teamId || !view || !edit) return;
    let active = true;
    setLoading(true);
    setLoadError(null);
    async function load() {
      const reply = await dispatch(withDesignApi((api) => api.listAttachableProjects(teamId, search)));
      if (!active) return;
      if (reply.ok) setRows(reply.rows);
      else setLoadError(reply.message);
      setLoading(false);
    }
    const timer = delay ? setTimeout(load, delay) : null;
    if (!delay) load();
    return () => { active = false; clearTimeout(timer); };
  }, [dispatch, teamId, view, edit, tab, search, delay, reload]);

  if (!teamId || !view || !edit) return null;

  const canCreate = tab === 'new' ? Boolean(fields.est_project_name?.trim()) : selected !== null && !loading && !loadError;
  async function create(event) {
    event.preventDefault();
    if (!canCreate || saving) return;
    setSaving(true);
    setError(null);
    const options = { teamId, phaseName: 'Phase 1' };
    if (tab === 'new') {
      options.project = Object.fromEntries(FIELDS.map(([key]) => [key, (fields[key] ?? '').trim()]).filter(([, value]) => value));
    } else options.estProjectId = selected;
    const reply = await dispatch(withDesignApi((api) => api.createProject(options)));
    setSaving(false);
    if (reply.ok) onCreated(reply.est_project_id);
    else setError(reply.message);
  }

  function switchTab(next) {
    if (next === tab) return;
    setTab(next);
    setSearchRequest({ value: '', delay: 0 });
    setSelected(null);
    setRows([]);
    setError(null);
    setLoadError(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="new-project-title" className="w-full max-w-xl max-h-[90vh] overflow-auto rounded border border-gray-700 bg-gray-800 p-6 space-y-4">
        <h2 id="new-project-title" className="text-lg font-semibold">New project</h2>
        <div role="tablist" aria-label="Project source" className="flex gap-2">
          {[['new', 'New project'], ['estimate', 'From an estimate project']].map(([value, label]) => (
            <button key={value} id={`project-tab-${value}`} type="button" role="tab" aria-selected={tab === value} aria-controls="project-source-panel" disabled={saving} className={`${BUTTON_CLASS} ${tab === value ? 'bg-gray-700' : ''}`} onClick={() => switchTab(value)}>{label}</button>
          ))}
        </div>
        {error && <div role="alert" className="rounded border border-red-700 bg-red-950 p-3 text-red-200">{error}</div>}
        <form onSubmit={create} className="space-y-4">
          <div id="project-source-panel" role="tabpanel" aria-labelledby={`project-tab-${tab}`}>
            {tab === 'new' ? (
              <div className="grid grid-cols-2 gap-3">
                {FIELDS.map(([key, label]) => <label key={key} className="space-y-1 text-sm">
                  <span>{label}</span>
                  <input aria-label={label} autoFocus={key === 'est_project_name'} required={key === 'est_project_name'} value={fields[key] ?? ''} disabled={saving} onChange={(event) => setFields((values) => ({ ...values, [key]: event.target.value }))} className={INPUT_CLASS} />
                </label>)}
              </div>
            ) : (
              <div className="space-y-3">
                <input autoFocus aria-label="Search estimate projects" type="search" placeholder="Search estimate projects" value={search} disabled={saving} onChange={(event) => { setSearchRequest({ value: event.target.value, delay: 300 }); setSelected(null); }} className={INPUT_CLASS} />
                {loadError && <div role="alert" className="rounded border border-red-700 bg-red-950 p-3 text-red-200">
                  {loadError}<button type="button" className="ml-4 underline" onClick={() => setReload((value) => value + 1)}>Retry</button>
                </div>}
                {loading ? <p role="status">Loading estimate projects…</p> : !loadError && <div className="max-h-64 overflow-auto space-y-2">
                  {rows.map((row) => <button key={row.est_project_id} type="button" aria-pressed={selected === row.est_project_id} disabled={saving} onClick={() => setSelected(row.est_project_id)} className={`w-full rounded border p-3 text-left ${selected === row.est_project_id ? 'border-blue-500 bg-gray-700' : 'border-gray-600'}`}>
                    <span className="block font-medium">{row.est_project_name}</span>
                    <span className="block text-sm text-gray-400">{row.est_client_name}</span>
                    <span className="block text-sm text-gray-400">{projectAddress({ street: row.street, city: row.city })}</span>
                  </button>)}
                  {rows.length === 0 && <p className="text-sm text-gray-400">No estimate projects found.</p>}
                </div>}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={BUTTON_CLASS} onClick={onClose}>Cancel</button>
            <button type="submit" disabled={!canCreate || saving} className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-500 disabled:opacity-50">{tab === 'new' ? 'Create' : 'Add to designer'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
