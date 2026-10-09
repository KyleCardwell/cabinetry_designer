import { useNavigate, useParams } from 'react-router-dom';
import ProfileEditor from './ProfileEditor.jsx';

export default function ProfileEditorPage() {
  const { profileId } = useParams();
  const navigate = useNavigate();

  return <ProfileEditor profileId={profileId} backLabel="← Profiles" onClose={() => navigate('/library/profiles')} />;
}
