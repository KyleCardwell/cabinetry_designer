import { formatInches } from '../../model/index.js';

export default function Field({ label, tag, children }) {
  return (
    <label className="block text-xs text-gray-400">
      <span className="mb-1 flex items-center justify-between gap-2">
        <span>{label}</span>
        {tag && <span className="text-[10px] text-gray-500">{tag.toLowerCase()}</span>}
      </span>
      {children}
    </label>
  );
}

export function ReadOnlyValue({ value, ariaLabel, tag }) {
  return (
    <div
      aria-label={ariaLabel}
      className="flex w-full items-center justify-between gap-2 rounded border border-dashed border-gray-700 bg-gray-900/60 px-2.5 py-1.5 text-sm text-gray-500"
    >
      {formatInches(value)}
      {tag && <span className="text-[10px] text-gray-500">{tag.toLowerCase()}</span>}
    </div>
  );
}

