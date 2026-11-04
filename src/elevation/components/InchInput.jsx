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
  readOnly = false,
  arrowStep,
  arrowBase = 0,
  ...inputProps
}) {
  const [text, setText] = useState(() => displayValue(value, displayStep));

  useEffect(() => {
    setText(displayValue(value, displayStep));
  }, [value, displayStep]);

  const revert = () => setText(displayValue(value, displayStep));

  const commit = () => {
    if (readOnly) return;
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

  // Opt-in arrow keys step the value and commit at once; a blank field steps from arrowBase (e.g. its Auto value).
  const stepBy = (direction) => {
    const trimmed = text.trim();
    const current = trimmed === '' || trimmed.toLowerCase() === 'auto' ? arrowBase : parseInches(trimmed);
    if (current === null) return;
    const next = current + direction * arrowStep;
    if (onCommit(next) !== false) setText(formatInchesInput(next, displayStep));
  };

  return (
    <input
      {...inputProps}
      type="text"
      inputMode="decimal"
      readOnly={readOnly}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (arrowStep && !readOnly && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
          event.preventDefault();
          stepBy(event.key === 'ArrowUp' ? 1 : -1);
        }
        if (event.key === 'Escape') {
          revert();
          event.currentTarget.blur();
        }
      }}
      className={`w-full px-2.5 py-1.5 bg-gray-900 border rounded text-sm ${readOnly
        ? 'text-gray-500 border-gray-700 border-dashed'
        : `${borderClass} text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-blue-500`} ${className}`}
    />
  );
}
