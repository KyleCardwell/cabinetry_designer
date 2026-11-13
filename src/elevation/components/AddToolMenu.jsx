import { useEffect, useRef, useState } from 'react';

/**
 * The tools that add a detail to a wall (SPEC-38.1), behind one "Add" button so the toolbar stays short.
 * `tools` is [[name, label]]; the button reads "Add: <label>" while one of them is the active tool.
 */
export default function AddToolMenu({ tools, tool, disabledTools = [], disabledTitle, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const active = tools.find(([name]) => name === tool);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`rounded px-3 py-1.5 text-sm transition-colors ${
          active ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`}
      >
        {active ? `Add: ${active[1]}` : 'Add'} ▾
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 min-w-36 rounded border border-gray-700 bg-gray-900 py-1 shadow-lg"
        >
          {tools.map(([name, label]) => {
            const disabled = disabledTools.includes(name);
            return (
              <button
                key={name}
                type="button"
                role="menuitem"
                disabled={disabled}
                title={disabled ? disabledTitle : undefined}
                onClick={() => {
                  onPick(name);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                  tool === name ? 'bg-blue-600/30 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
