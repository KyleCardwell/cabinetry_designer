import SettingsPanel from '../elevation/components/SettingsPanel.jsx';
import WorkspaceSourceBar, { useSandboxHidden, useShopReadOnly } from './WorkspaceSourceBar.jsx';

/** `/settings`: the shop standard (SPEC-DB4 g; moved up from plan round D5). */
export default function SettingsPage() {
  const readOnly = useShopReadOnly();
  const sandboxHidden = useSandboxHidden();
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-blue-400">Shop settings</p>
        <WorkspaceSourceBar />
        {!sandboxHidden && <fieldset disabled={readOnly} className="min-w-0">
          <SettingsPanel />
        </fieldset>}
      </div>
    </div>
  );
}
