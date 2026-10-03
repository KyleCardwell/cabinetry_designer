import { useDispatch, useSelector } from 'react-redux';
import { NavLink } from 'react-router-dom';
import { supabase } from '../../api/supabaseClient';
import { clearAuth } from '../../store/slices/authSlice';

export default function AppShell({ children }) {
  const dispatch = useDispatch();
  const { userName } = useSelector((state) => state.auth);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    dispatch(clearAuth());
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold tracking-tight">Cabinetry Designer</h1>
          <nav className="flex items-center gap-1 text-sm" aria-label="Primary navigation">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `px-3 py-1.5 rounded transition-colors ${
                isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700/60'
              }`}
            >
              Projects
            </NavLink>
            <NavLink
              to="/elevation-lab"
              className={({ isActive }) => `px-3 py-1.5 rounded transition-colors ${
                isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700/60'
              }`}
            >
              Elevation Lab
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {userName && <span className="text-gray-400">{userName}</span>}
          <button
            onClick={handleSignOut}
            className="text-gray-400 hover:text-white transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
