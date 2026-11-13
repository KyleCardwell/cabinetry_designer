import InchInput from '../InchInput.jsx';

const BUTTONS = [
  { grow: 'left', symbol: '‹', title: 'Stretch toward the left (right end stays)' },
  { grow: 'right', symbol: '›', title: 'Stretch toward the right (left end stays)' },
  { grow: 'both', symbol: '↔', title: 'Stretch both ways (center stays)' },
];

function toggleClass(active) {
  return `w-7 shrink-0 rounded border text-lg leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
    active
      ? 'border-cyan-500 bg-cyan-950/70 text-cyan-200'
      : 'border-gray-600 bg-gray-900 text-gray-500 hover:bg-gray-700'
  }`;
}

/**
 * A width/length input with ‹ › arrows on either side and a ↔ button: which way the
 * change goes. `locked` lists grow values that aren't allowed (e.g. an anchored end).
 */
export default function StretchInput({
  label,
  value,
  grow,
  onGrowChange,
  onCommit,
  locked = [],
  ariaLabel,
}) {
  const button = ({ grow: option, symbol, title }) => (
    <button
      key={option}
      type="button"
      onClick={() => onGrowChange(option)}
      disabled={locked.includes(option)}
      title={title}
      aria-label={`${ariaLabel}: ${title}`}
      aria-pressed={grow === option}
      className={toggleClass(grow === option)}
    >
      {symbol}
    </button>
  );

  return (
    <div className="block text-xs text-gray-400">
      <span className="mb-1 block">{label}</span>
      <div className="flex items-stretch gap-1">
        {button(BUTTONS[0])}
        <InchInput
          value={value}
          onCommit={onCommit}
          aria-label={ariaLabel}
          className="min-w-0"
        />
        {button(BUTTONS[1])}
        {button(BUTTONS[2])}
      </div>
    </div>
  );
}
