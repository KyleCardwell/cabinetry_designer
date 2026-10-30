import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { runShortLabel, wallLabel } from '../model/index.js';
import { setSelection } from '../store/elevationSlice.js';
import WarningsList from './properties/WarningsList.jsx';

function pieceLabel({ piece, side, tee }, cells) {
  if (tee || piece.role === 'tee') return 'T-filler';
  if (side) return side === 'left' ? 'Left end' : 'Right end';
  if (piece.kind === 'cabinet') {
    const cabinets = cells.pieces.filter((candidate) => candidate.kind === 'cabinet')
      .sort((left, right) => left.x - right.x || left.z - right.z);
    return `Cab ${cabinets.findIndex((candidate) => candidate.id === piece.id) + 1}`;
  }
  return piece.kind === 'filler' ? 'Filler' : 'Section';
}

export default function PropertiesHeader({
  room, wall, run, opening, soffit, recess, endPanel, line, cells, selectionContext, layout,
}) {
  const dispatch = useDispatch();
  const [warningsOpen, setWarningsOpen] = useState(false);
  const segments = [];
  if (wall) {
    segments.push({
      label: `${wallLabel(room, wall)}${wall.side === 'back' ? ' · Back' : ''}`,
      selection: { wallId: wall.id },
    });
    if (line) {
      segments.push({ label: `Layout line ${line.label}` });
    } else if (opening || soffit || recess || endPanel) {
      const label = opening ? (opening.kind === 'window' ? 'Window' : 'Door')
        : recess ? 'Recess' : soffit ? 'Soffit'
          : `${endPanel[wall.side ?? 'front'].side === 'left' ? 'Left' : 'Right'} end panel`;
      segments.push({ label });
    } else if (run) {
      segments.push({
        label: `Run ${wall.runs.findIndex((candidate) => candidate.id === run.id) + 1}`,
        title: runShortLabel(run),
        selection: { wallId: wall.id, runId: run.id, pieceId: null },
      });
      if (selectionContext) segments.push({ label: pieceLabel(selectionContext, cells) });
    }
  }
  // Match WarningsList: overhang is already shown beside the run geometry.
  const issueCount = run && !opening && !soffit && !recess && !endPanel && layout
    ? layout.warnings.filter((warning) => warning.code !== 'overhang').length + layout.errors.length
    : 0;

  return (
    <header className="sticky top-0 z-10 -mx-4 -mt-4 border-b border-gray-700 bg-gray-800 px-4 py-3">
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 text-sm font-semibold text-gray-300">
          {segments.length === 0 ? 'Properties' : (
            <span aria-label="Selection path" className="flex min-w-0 items-center gap-1">
              {segments.map((segment, index) => (
                <span key={index} className={index === segments.length - 1
                  ? 'flex shrink-0 items-center gap-1 whitespace-nowrap'
                  : 'flex min-w-0 shrink items-center gap-1'}>
                  {index > 0 && <span aria-hidden="true" className="shrink-0">›</span>}
                  {index === segments.length - 1 ? (
                    <span title={segment.title}>{segment.label}</span>
                  ) : (
                    <button type="button" title={segment.title ?? segment.label}
                      className="truncate text-left hover:text-white focus-visible:text-white"
                      onClick={() => dispatch(setSelection(segment.selection))}>
                      {segment.label}
                    </button>
                  )}
                </span>
              ))}
            </span>
          )}
        </h2>
        {issueCount > 0 && (
          <button type="button" className="shrink-0 rounded px-1.5 py-1 text-xs text-amber-300 hover:bg-gray-700"
            aria-label={`Warnings and errors: ${issueCount}`} aria-expanded={warningsOpen}
            aria-controls="properties-warnings" onClick={() => setWarningsOpen((open) => !open)}>
            ⚠ {issueCount}
          </button>
        )}
      </div>
      {issueCount > 0 && warningsOpen && (
        <div id="properties-warnings" className="absolute left-0 right-0 top-full max-h-80 overflow-y-auto border border-gray-700 bg-gray-800 p-4 shadow-lg">
          <WarningsList layout={layout} />
        </div>
      )}
    </header>
  );
}
