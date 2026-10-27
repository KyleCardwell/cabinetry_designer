import { useEffect, useRef } from 'react';
import { useMenuInCanvas } from './canvas/menuPosition.js';

export default function CanvasContextMenu({ position, items, onClose }) {
  const menuRef = useRef(null);
  useMenuInCanvas(menuRef, position);

  useEffect(() => {
    if (!position) return undefined;
    menuRef.current?.querySelector('button')?.focus();
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('wheel', onClose, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('wheel', onClose, true);
    };
  }, [onClose, position]);

  if (!position) return null;
  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Run actions"
      className="absolute z-20 min-w-40 rounded border border-gray-600 bg-gray-950 py-1 text-sm text-gray-200 shadow-xl"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {items.map(({ label, onSelect }) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          className="block w-full px-3 py-1 text-left hover:bg-gray-800 focus:bg-gray-800 focus:outline-none"
          onClick={() => {
            onClose();
            onSelect();
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
