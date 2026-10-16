import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { supabase } from './api/supabaseClient';
import { initAuth, setSession, clearAuth } from './store/slices/authSlice';
import AppShell from './components/layout/AppShell';
import ProjectsPage from './projects/ProjectsPage.jsx';
import ProjectPage from './projects/ProjectPage.jsx';
import useLeaveProjectPresence from './projects/useLeaveProjectPresence.js';
import RoomPage from './projects/RoomPage.jsx';
import VersionPage from './projects/VersionPage.jsx';
import Login from './components/auth/Login';
import ElevationLab from './elevation/ElevationLab';
import LibraryLayout from './library/LibraryLayout.jsx';
import DoorDesignsPage from './library/DoorDesignsPage.jsx';
import TeamDoorStylePage from './library/TeamDoorStylePage.jsx';
import ProfilesPage from './library/ProfilesPage.jsx';
import PullsPage from './library/PullsPage.jsx';
import SettingsPage from './library/SettingsPage.jsx';
import ProfileEditorPage from './library/profileEditor/ProfileEditorPage.jsx';
import { SANDBOX_ENABLED } from './sandbox.js';

function App() {
  const dispatch = useDispatch();
  const { session, loading } = useSelector((state) => state.auth);

  useEffect(() => {
    // Bootstrap: check for existing session on mount
    dispatch(initAuth());

    // Listen for auth state changes (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          dispatch(setSession(session));
          // Re-fetch team membership when session changes
          dispatch(initAuth());
        } else {
          dispatch(clearAuth());
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [dispatch]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-gray-400 text-lg">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return <SignedInApp />;
}

function SignedInApp() {
  useLeaveProjectPresence();
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectPage />} />
        {SANDBOX_ENABLED && <Route path="/elevation-lab" element={<ElevationLab />} />}
        <Route path="/projects/:projectId/rooms/:roomId" element={<RoomPage />} />
        <Route path="/projects/:projectId/rooms/:roomId/versions/:versionId" element={<VersionPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/library/profiles/:profileId" element={<ProfileEditorPage />} />
        <Route path="/library" element={<LibraryLayout />}>
          <Route index element={<Navigate to="door-designs" replace />} />
          <Route path="door-designs" element={<DoorDesignsPage />} />
          <Route path="door-style" element={<TeamDoorStylePage />} />
          <Route path="profiles" element={<ProfilesPage />} />
          <Route path="pulls" element={<PullsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </AppShell>
  );
}

export default App;
