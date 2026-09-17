import { useEffect, useState } from 'react';
import { formatInchesInput, parseInches } from '../model/units.js';

function displayValue(value) {
  return value === null || value === undefined ? '' : formatInchesInput(value);
}

export default function InchInput({
  value,
  onCommit,
  allowBlank = false,
  className = '',
  ...inputProps
}) {
  const [text, setText] = useState(() => displayValue(value));

  useEffect(() => {
    setText(displayValue(value));
  }, [value]);

  const revert = () => setText(displayValue(value));

  const commit = () => {
    const trimmed = text.trim();
    if (allowBlank && trimmed === '') {
      const accepted = onCommit(null);
      if (accepted === false) revert();
      else setText('');
      return;
    }

    const parsed = parseInches(trimmed);
    if (parsed === null) {
      revert();
      return;
    }

    const accepted = onCommit(parsed);
    if (accepted === false) revert();
    else setText(formatInchesInput(parsed));
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
          revert();
          event.currentTarget.blur();
        }
      }}
      className={`w-full px-2.5 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-100 focus:outline-none focus:border-blue-500 ${className}`}
    />
  );
}
