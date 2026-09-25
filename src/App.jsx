import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { supabase } from './api/supabaseClient';
import { initAuth, setSession, clearAuth } from './store/slices/authSlice';
import AppShell from './components/layout/AppShell';
import ProjectList from './components/projects/ProjectList';
import RoomEditor from './components/rooms/RoomEditor';
import Login from './components/auth/Login';
import ElevationLab from './elevation/ElevationLab';

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

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/elevation-lab" element={<ElevationLab />} />
        <Route path="/projects/:projectId/rooms/:roomId" element={<RoomEditor />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default App;
