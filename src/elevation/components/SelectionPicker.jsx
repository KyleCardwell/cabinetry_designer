import { useEffect, useRef } from 'react';
import { Rect } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';

const KIND_NAMES = {
  face: 'Face', piece: 'Part', run: 'Run', end_panel: 'Wall end', opening: 'Opening',
  soffit: 'Soffit', recess: 'Recess', wall: 'Wall',
};

/** The list of everything under a click (SPEC-39.1): ↑/↓ to move, Enter to choose, Esc to close. */
export default function SelectionPicker({ picker, onChoose, onHover, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!picker) return undefined;
    const keys = picker.candidates.map(({ key }) => key);
    const handleKeyDown = (event) => {
      if (!['Escape', 'ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      const current = keys.indexOf(picker.hoverKey ?? picker.activeKey);
      if (event.key === 'Enter') {
        if (current >= 0) onChoose(keys[current]);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      onHover(keys[(current + step + keys.length) % keys.length]);
    };
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('wheel', onClose, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('wheel', onClose, true);
    };
  }, [onChoose, onClose, onHover, picker]);

  if (!picker) return null;
  return (
    <div
      ref={menuRef}
      className="absolute z-20 min-w-48 rounded border border-gray-600 bg-gray-950/95 py-1 text-sm shadow-xl"
      style={{ left: picker.x + 12, top: picker.y + 12 }}
    >
      {picker.candidates.map((candidate) => (
        <button
          key={candidate.key}
          type="button"
          className={`flex w-full items-baseline gap-2 px-3 py-1 text-left ${
            candidate.key === picker.hoverKey ? 'bg-gray-800' : ''
          } ${candidate.key === picker.activeKey ? 'text-cyan-300' : 'text-gray-200'}`}
          onMouseEnter={() => onHover(candidate.key)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onChoose(candidate.key)}
        >
          <span className="w-16 shrink-0 text-[10px] uppercase tracking-wide text-gray-500">
            {KIND_NAMES[candidate.kind]}
          </span>
          <span className="truncate">{candidate.label}</span>
        </button>
      ))}
      <p className="px-3 pt-1 text-[10px] text-gray-500">↑↓ Enter · Esc to close</p>
    </div>
  );
}

/** The canvas outline of the row being hovered in the picker (SPEC-39.1). */
export function PickOutline({ candidate, transform }) {
  if (!candidate || !transform) return null;
  return (
    <Rect
      {...wallRectToScreen(candidate.rect, transform)}
      stroke="#f472b6"
      strokeWidth={2}
      dash={[6, 4]}
      listening={false}
    />
  );
}
