import { useNavigate, useParams } from 'react-router-dom';
import WorkspaceSourceBar, { useSandboxHidden, useShopReadOnly } from '../WorkspaceSourceBar.jsx';
import ProfileEditor from './ProfileEditor.jsx';

export default function ProfileEditorPage() {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const readOnly = useShopReadOnly();
  const sandboxHidden = useSandboxHidden();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-6 pt-3 empty:hidden">
        <WorkspaceSourceBar allowSwitch={false} />
      </div>
      {!sandboxHidden && <fieldset disabled={readOnly} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ProfileEditor profileId={profileId} backLabel="← Profiles" onClose={() => navigate('/library/profiles')} />
      </fieldset>}
    </div>
  );
}
