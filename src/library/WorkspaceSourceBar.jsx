import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { cloudSync } from '../elevation/store/cloudSync.js';
import { openCloudWorkspace, openLocalWorkspace } from '../elevation/store/cloudThunks.js';

const TAB = 'px-3 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50';

function when(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : ` at ${date.toLocaleString()}`;
}

/** True when the shop data is open and this user may not change the library / shop standard. */
export function useShopReadOnly() {
  const elevation = useSelector((state) => state.elevation);
  return elevation.source === 'cloud' && !elevation.cloud?.permissions?.manage;
}

/**
 * Which data the Library and Shop settings pages edit (SPEC-DB4 g): this browser's sandbox
 * (localStorage, what the Elevation Lab uses) or the team's shop data in Supabase. Shows
 * save status, conflicts and errors for the shop data.
 */
export default function WorkspaceSourceBar({ allowSwitch = true }) {
  const dispatch = useDispatch();
  const { source, cloud, workspace, message } = useSelector((state) => state.elevation);
  const teamId = useSelector((state) => state.auth?.teamId ?? null);
  const [busy, setBusy] = useState(false);
  const isCloud = source === 'cloud';
  const pending = cloud?.pending ?? 0;
  const stuck = Boolean(cloud?.conflict || cloud?.error);

  const openShop = async () => {
    setBusy(true);
    await dispatch(openCloudWorkspace());
    setBusy(false);
  };
  const openLocal = async () => {
    setBusy(true);
    await cloudSync.flush();
    dispatch(openLocalWorkspace());
    setBusy(false);
  };

  let status = null;
  if (workspace?.loading || busy) status = <span className="text-gray-400">Loading…</span>;
  else if (isCloud && pending > 0) status = <span className="text-gray-400">Saving…</span>;
  else if (isCloud && !stuck) status = <span className="text-teal-400">All changes saved</span>;

  return (
    <div className="mb-5 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {allowSwitch && (
          <div className="flex overflow-hidden rounded border border-gray-600" role="group" aria-label="Data source">
            <button
              type="button"
              className={`${TAB} ${!isCloud ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700/60'}`}
              aria-pressed={!isCloud}
              disabled={busy || !isCloud || pending > 0}
              title={pending > 0 ? 'Wait for shop changes to finish saving' : 'The Elevation Lab sandbox, saved in this browser'}
              onClick={openLocal}
            >
              This browser
            </button>
            <button
              type="button"
              className={`${TAB} ${isCloud ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700/60'}`}
              aria-pressed={isCloud}
              disabled={busy || isCloud || !teamId}
              title={teamId ? 'Your team\'s shop data, saved in Supabase' : 'You are not on a team'}
              onClick={openShop}
            >
              Shop (Supabase)
            </button>
          </div>
        )}
        {status && <span className="text-xs">{status}</span>}
        {isCloud && !cloud?.permissions?.manage && (
          <span className="text-xs text-amber-300">View only — changing the shop library needs team-management permission.</span>
        )}
      </div>

      {!isCloud && allowSwitch && (
        <p className="text-xs text-gray-500">Editing this browser&apos;s sandbox (the Elevation Lab&apos;s library and settings). Nothing here reaches the shop data.</p>
      )}
      {workspace?.error && <p className="rounded border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-200">{workspace.error}</p>}
      {isCloud && message && <p className="text-xs text-gray-400">{message}</p>}

      {cloud?.conflict && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-100" role="alert">
          <span>
            {cloud.conflict.what} {cloud.conflict.updatedByName ? `were changed by ${cloud.conflict.updatedByName}` : 'were changed somewhere else'}
            {when(cloud.conflict.updatedAt)}. Your change to it wasn&apos;t saved.
          </span>
          <button type="button" className="rounded border border-amber-400/60 px-2 py-1 text-xs hover:bg-amber-500/20" onClick={openShop}>
            Reload shop data
          </button>
          {pending > 0 && <span className="text-xs">Other changes are still saving; reload after they finish.</span>}
        </div>
      )}
      {cloud?.error && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">
          <span>Couldn&apos;t save {cloud.error.what}: {cloud.error.message}</span>
          <button type="button" className="rounded border border-red-400/60 px-2 py-1 text-xs hover:bg-red-500/20" onClick={() => cloudSync.retry()}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
