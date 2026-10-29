import { useState } from 'react';

export const SELECT_CLASS = 'w-auto rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
export const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-700';
export const LEVEL_NAMES = { team: 'shop standard', project: 'project settings', phase: 'phase settings' };

export default function MissingCatalogRow({ message, canMove, readOnly, options, ariaLabel, onMove }) {
  const [choice, setChoice] = useState(null);
  const reassignTo = options.some((o) => o.value === choice) ? choice : (options[0]?.value ?? '');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p>{message}{canMove && readOnly && ' Someone who can edit the room can move them.'}</p>
      {canMove && !readOnly && <>
        <label className="flex items-center gap-2">
          Move them to
          <select value={reassignTo} onChange={(event) => setChoice(event.target.value)}
            aria-label={ariaLabel} className={SELECT_CLASS}>
            {options.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button type="button" className={BUTTON_CLASS}
          onClick={() => onMove(reassignTo)}>Move</button>
      </>}
    </div>
  );
}
