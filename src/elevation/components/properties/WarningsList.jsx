import { formatRunWarning } from '../../properties/helpers.js';

const ERROR_MESSAGES = {
  'over-constrained': 'Fixed widths exceed the run width.',
  'does-not-fill': 'The fixed pieces do not fill the run.',
  'pin-gap': 'The space between pinned cabinets is not filled.',
  'no-room-for-box': 'The height profile leaves no room for this cabinet box.',
  'anchor-opening-missing': 'The anchored opening no longer exists.',
  'anchor-opening-overlap': 'The run anchor datums cross.',
};

const WARNING_MESSAGES = {
  'mixed-counter-heights': 'Overlapping base runs have different counter heights.',
  'crown-above-ceiling': 'The crown profile extends above the wall height.',
  'soffit-conflict': "Runs into a soffit — anchor it to the soffit's side or split it.",
};

export default function WarningsList({ layout }) {
  const warnings = layout.warnings.filter((warning) => warning.code !== 'overhang');
  const hasOverhang = warnings.length !== layout.warnings.length;
  const hasIssues = warnings.length > 0 || layout.errors.length > 0;

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Warnings &amp; errors
      </h3>
      {!hasIssues ? (
        <p className="mt-2 text-xs text-gray-500">
          {hasOverhang ? 'No other warnings or errors.' : 'No warnings or errors.'}
        </p>
      ) : (
        <ul className="mt-2 space-y-2 text-xs">
          {layout.errors.map((error, index) => (
            <li
              key={`${error.code}-${index}`}
              className="rounded border border-red-900/80 bg-red-950/45 px-2.5 py-2 text-red-300"
            >
              {ERROR_MESSAGES[error.code] ?? error.code}
            </li>
          ))}
          {warnings.map((warning, index) => (
            <li
              key={`${warning.code}-${warning.pieceId}-${index}`}
              className="rounded border border-amber-900/80 bg-amber-950/35 px-2.5 py-2 text-amber-300"
            >
              {formatRunWarning(warning) ?? WARNING_MESSAGES[warning.code] ?? warning.code}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

