import { controlBorder, overrideTitle, shortSourceLabel } from './overrideHelpers.js';

export default function OverrideField({
  label,
  overridden,
  level = 'room',
  inheritedSource = { level: 'team' },
  inheritedText,
  onReset,
  note,
  children,
}) {
  return (
    <div title={overrideTitle({ level, overridden, source: inheritedSource, inheritedText })}>
      <div className="flex items-center justify-between gap-2 mb-1 text-xs">
        <span className="text-gray-400">{label}</span>
        {overridden && onReset && (
          <button type="button" aria-label={`Reset ${label}`} onClick={onReset} className="text-teal-400 hover:underline">
            Reset
          </button>
        )}
        {!overridden && <span className="text-[10px] text-gray-500">{shortSourceLabel(inheritedSource)}</span>}
      </div>
      {children(controlBorder(overridden))}
      {note && <div className="mt-1 text-xs text-gray-400">{note}</div>}
    </div>
  );
}
