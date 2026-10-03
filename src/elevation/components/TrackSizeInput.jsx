import { useEffect, useRef, useState } from 'react';
import { formatInchesInput, parseInches } from '../model/units.js';

export default function TrackSizeInput({ edit, onCommit, onCancel }) {
  const inputRef = useRef(null);
  const [text, setText] = useState(() => formatInchesInput(edit.value));

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'auto') {
      onCommit(null);
      return;
    }
    const value = parseInches(trimmed);
    if (Number.isFinite(value) && value > 0) onCommit(value);
  };

  return (
    <div
      className="absolute z-20 w-44 rounded border border-cyan-700 bg-gray-950/95 p-2 shadow-xl"
      style={{ left: edit.x + 12, top: edit.y + 12 }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <label className="block text-xs font-medium text-cyan-200">
        {edit.label}
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onCancel();
            }
          }}
          onBlur={onCancel}
          aria-label={edit.label}
          className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-gray-100 focus:border-cyan-500 focus:outline-none"
        />
      </label>
      <p className="mt-1.5 text-[10px] text-gray-500">
        Enter to set · auto to unlock · Esc to cancel
      </p>
    </div>
  );
}
