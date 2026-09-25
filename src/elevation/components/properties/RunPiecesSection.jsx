import { useDispatch } from 'react-redux';
import {
  KIND_LABELS,
  formatInches,
  runItems,
} from '../../model/index.js';
import { setSelection } from '../../store/elevationSlice.js';

export default function RunPiecesSection({ run, layout }) {
  const dispatch = useDispatch();

  return (
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Pieces
        </h3>
        <div className="overflow-hidden rounded border border-gray-700">
          {layout.pieces.map((piece) => {
            const item = piece.role === 'item'
              ? runItems(run).find((candidate) => candidate.id === piece.id)
              : null;
            const lockState = piece.kind === 'cabinet'
              ? (item?.width === null ? 'Auto' : 'Locked')
              : (piece.auto ? 'Auto' : 'Fixed');
            return (
              <button
                key={piece.id}
                type="button"
                onClick={() => dispatch(setSelection({ runId: run.id, pieceId: piece.id }))}
                className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-gray-700 bg-gray-900/35 px-2.5 py-2 text-left text-xs last:border-b-0 hover:bg-gray-700/65"
              >
                <span className="truncate text-gray-200">{KIND_LABELS[piece.kind]}</span>
                <span className="tabular-nums text-gray-300">
                  {formatInches(piece.width)}
                  {Number.isFinite(piece.absorbed)
                    ? ` (${piece.absorbed >= 0 ? '+' : ''}${formatInches(piece.absorbed)})`
                    : ''}
                </span>
                <span className="text-gray-500">{lockState}</span>
              </button>
            );
          })}
          {layout.pieces.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-500">No pieces.</p>
          )}
        </div>
      </section>
  );
}
