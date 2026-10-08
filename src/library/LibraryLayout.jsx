import { NavLink, Outlet } from 'react-router-dom';

export default function LibraryLayout() {
  return (
    <div className="flex h-full min-h-0">
      <aside className="w-56 shrink-0 border-r border-gray-700 bg-gray-800/60 p-4">
        <p className="mb-5 text-xs font-medium uppercase tracking-[0.18em] text-blue-400">Library</p>
        <nav className="flex flex-col gap-1 text-sm" aria-label="Library navigation">
          <NavLink
            to="door-designs"
            className={({ isActive }) => `rounded px-3 py-1.5 transition-colors ${
              isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700/60'
            }`}
          >
            Door designs
          </NavLink>
          <NavLink
            to="door-style"
            className={({ isActive }) => `rounded px-3 py-1.5 transition-colors ${
              isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700/60'
            }`}
          >
            Team door style
          </NavLink>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
