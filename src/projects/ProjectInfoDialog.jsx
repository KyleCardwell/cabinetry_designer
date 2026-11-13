import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { withDesignApi } from '../elevation/store/cloudThunks.js';
import { selectDesignPermissions } from '../store/permissions.js';

const FIELDS = [['est_project_name', 'Project name'], ['est_client_name', 'Client'], ['street', 'Street'], ['city', 'City'], ['state', 'State'], ['zip', 'Zip']];

export default function ProjectInfoDialog({ project, onClose, onSaved }) {
  const dispatch = useDispatch();
  const teamId = useSelector((state) => state.auth.teamId);
  const { view, edit } = useSelector(selectDesignPermissions);
  const [fields, setFields] = useState(Object.fromEntries(FIELDS.map(([key]) => [key, project[key] ?? ''])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  if (!teamId || !view || !edit) return null;

  const info = Object.fromEntries(FIELDS.map(([key]) => [key, fields[key].trim()])
    .filter(([key, value]) => value !== String(project[key] ?? '').trim()));
  const canSave = Boolean(fields.est_project_name.trim()) && Object.keys(info).length > 0;
  async function save(event) {
    event.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    const reply = await dispatch(withDesignApi((api) => api.updateProjectInfo(project.est_project_id, info)));
    setSaving(false);
    if (reply.ok) onSaved();
    else setError(reply.message);
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onKeyDown={(event) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
  }}>
    <section role="dialog" aria-modal="true" aria-labelledby="project-info-title" className="w-full max-w-xl max-h-[90vh] overflow-auto rounded border border-gray-700 bg-gray-800 p-6 space-y-4">
      <h2 id="project-info-title" className="text-lg font-semibold">Edit info</h2>
      {error && <div role="alert" className="rounded border border-red-700 bg-red-950 p-3 text-red-200">{error}</div>}
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map(([key, label]) => <label key={key} className="space-y-1 text-sm">
            <span>{label}</span>
            <input aria-label={label} autoFocus={key === 'est_project_name'} required={key === 'est_project_name'} value={fields[key]} disabled={saving} onChange={(event) => setFields((values) => ({ ...values, [key]: event.target.value }))} className="w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-gray-100" />
          </label>)}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded border border-gray-600 px-4 py-2 hover:bg-gray-700" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={!canSave || saving} className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-500 disabled:opacity-50">Save</button>
        </div>
      </form>
    </section>
  </div>;
}
