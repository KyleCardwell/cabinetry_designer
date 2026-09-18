import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatInches } from '../model/units.js';

const OFFSET = 14;
const EDGE_GAP = 8;

function displayValue(entry) {
  if (entry.typed !== null) return entry.typed;
  if (entry.kind === 'wall-perpendicular' && Math.abs(entry.value) > 1e-9) {
    return `${entry.value > 0 ? '+' : '−'}${formatInches(Math.abs(entry.value))}`;
  }
  return formatInches(entry.value);
}

export default function LiveEntryInput({
  entry,
  position,
  containerRef,
  containerSize,
  onTyped,
  onCommit,
  onCancel,
}) {
  const popupRef = useRef(null);
  const inputRef = useRef(null);
  const [placement, setPlacement] = useState({ left: EDGE_GAP, top: EDGE_GAP });

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [entry.kind, entry.label]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const popup = popupRef.current;
    if (!container || !popup) return;
    const containerRect = container.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const left = Math.max(
      EDGE_GAP,
      Math.min(
        containerRect.width - popupRect.width - EDGE_GAP,
        (position?.x ?? 0) + OFFSET,
      ),
    );
    const top = Math.max(
      EDGE_GAP,
      Math.min(
        containerRect.height - popupRect.height - EDGE_GAP,
        (position?.y ?? 0) + OFFSET,
      ),
    );
    setPlacement({ left, top });
  }, [containerRef, containerSize?.height, containerSize?.width, position]);

  return (
    <div
      ref={popupRef}
      className="absolute z-20 w-44 rounded border border-cyan-700 bg-gray-950/95 p-2 shadow-xl"
      style={placement}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <label className="block text-xs font-medium text-cyan-200">
        {entry.label}
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={displayValue(entry)}
          onChange={(event) => onTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              onCommit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }
          }}
          aria-label={entry.label}
          className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-gray-100 focus:border-cyan-500 focus:outline-none"
        />
      </label>
      <p className="mt-1.5 text-[10px] text-gray-500">Enter to set · Esc to cancel</p>
    </div>
  );
}
