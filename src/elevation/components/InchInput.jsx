import { useEffect, useState } from 'react';
import { formatInchesInput, parseInches } from '../model/units.js';

function displayValue(value, step) {
  return value === null || value === undefined ? '' : formatInchesInput(value, step);
}

export default function InchInput({
  value,
  onCommit,
  allowBlank = false,
  allowAuto = false,
  allowStandard = false,
  onStandard,
  displayStep,
  borderClass = 'border-gray-600',
  className = '',
  ...inputProps
}) {
  const [text, setText] = useState(() => displayValue(value, displayStep));

  useEffect(() => {
    setText(displayValue(value, displayStep));
  }, [value, displayStep]);

  const revert = () => setText(displayValue(value, displayStep));

  const commit = () => {
    const trimmed = text.trim();
    if (allowStandard && ['std', 'standard'].includes(trimmed.toLowerCase())) {
      const accepted = onStandard();
      if (accepted === false) revert();
      else setText('');
      return;
    }
    if ((allowBlank && trimmed === '') || (allowAuto && trimmed.toLowerCase() === 'auto')) {
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
    else setText(formatInchesInput(parsed, displayStep));
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
      className={`w-full px-2.5 py-1.5 bg-gray-900 border ${borderClass} rounded text-sm text-gray-100 focus:outline-none focus:border-blue-500 ${className}`}
    />
  );
}
