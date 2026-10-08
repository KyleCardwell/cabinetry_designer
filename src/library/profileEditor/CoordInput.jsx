import { useEffect, useRef, useState } from 'react';
import { formatProfileCoord } from '../../elevation/model/profileEditing.js';
import { parseInches } from '../../elevation/model/units.js';

export default function CoordInput({ value, onCommit, className = '', ...inputProps }) {
  const [text, setText] = useState(() => formatProfileCoord(value));
  const shown = useRef(formatProfileCoord(value));
  const skipCommit = useRef(false);

  useEffect(() => {
    shown.current = formatProfileCoord(value);
    setText(shown.current);
  }, [value]);

  const revert = () => {
    shown.current = formatProfileCoord(value);
    setText(shown.current);
  };

  const commit = () => {
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    if (text === shown.current) return;
    const parsed = parseInches(text.trim());
    if (parsed === null || onCommit(parsed) === false) {
      revert();
      return;
    }
    shown.current = formatProfileCoord(parsed);
    setText(shown.current);
  };

  return (
    <input
      {...inputProps}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          skipCommit.current = true;
          revert();
          event.currentTarget.blur();
        }
      }}
      className={`w-full px-2.5 py-1 bg-gray-900 border border-gray-600 rounded text-gray-100 focus:outline-none focus:border-blue-500 font-mono text-xs ${className}`}
    />
  );
}
