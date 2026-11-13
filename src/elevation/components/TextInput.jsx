import { useEffect, useState } from 'react';

/** Keep spaces while typing; trim and validate the completed setting on blur. */
export default function TextInput({
  value,
  onCommit,
  borderClass = 'border-gray-600',
  className = '',
  ...inputProps
}) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed.length > 120 || onCommit(trimmed) === false) setText(value ?? '');
    else setText(trimmed);
  };

  return (
    <input
      {...inputProps}
      type="text"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setText(value ?? '');
          event.currentTarget.blur();
        }
      }}
      className={`w-full px-2.5 py-1.5 bg-gray-900 border ${borderClass} rounded text-sm text-gray-100 focus:outline-none focus:border-blue-500 ${className}`}
    />
  );
}
