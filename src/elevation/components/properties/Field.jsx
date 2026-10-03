import { formatInches } from '../../model/index.js';

export default function Field({ label, children }) {
  return (
    <label className="block text-xs text-gray-400">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

export function ReadOnlyValue({ value, ariaLabel }) {
  return (
    <div
      aria-label={ariaLabel}
      className="w-full rounded border border-gray-700 bg-gray-900/60 px-2.5 py-1.5 text-sm text-gray-300"
    >
      {formatInches(value)}
    </div>
  );
}

