import { useDispatch, useSelector } from 'react-redux';
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
        <h1 className="text-lg font-semibold tracking-tight">Cabinetry Designer</h1>
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
