import { useState } from 'react';
import { useSelector } from 'react-redux';
import { groupsFor } from '../elevation/model/settingGroups.js';
import SettingGroups, { countOverrides } from '../elevation/components/SettingGroups.jsx';
import { selectDesignPermissions } from '../store/permissions.js';

export default function ProjectSettingsPanel({ level }) {
  const [open, setOpen] = useState(false);
  const layer = useSelector((state) => state.elevation.layers[level]);
  const { edit } = useSelector(selectDesignPermissions);
  const count = countOverrides(groupsFor(level).flatMap(({ keys }) => keys), layer?.values);

  return <section className="rounded border border-gray-700 p-4">
    <button
      type="button"
      aria-expanded={open}
      onClick={() => setOpen((current) => !current)}
      className="flex w-full items-center justify-between gap-2 text-sm font-semibold text-gray-300"
    >
      <span>{level === 'project' ? 'Project settings' : 'Phase settings'}</span>
      <span className="text-teal-400">{count} overridden</span>
      <span className="text-gray-500" aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
    {open && <fieldset disabled={!edit} className="mt-3"><SettingGroups scope={level} /></fieldset>}
  </section>;
}
