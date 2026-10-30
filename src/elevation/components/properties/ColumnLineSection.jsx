import { useDispatch } from 'react-redux';
import { ATTACHABLE_KINDS } from '../../model/constants.js';
import { runItems } from '../../model/grid.js';
import { findLine, linesOn, placedAt } from '../../model/layoutLines.js';
import { wallSideOf } from '../../model/wallSides.js';
import {
  attachColumnToNewLine,
  attachColumnToOpening,
  setAttachment,
} from '../../store/elevationSlice.js';
import PanelSection from '../panel/PanelSection.jsx';
import LineAttachSection from './LineAttachSection.jsx';

export const SECOND_LINE_NOTE = 'Attaching a second column locks both to their current widths.';

/** LL4: a root cabinet or open column on a layout line (replaces wall-end and opening pins). */
export default function ColumnLineSection({ wall, run, item, piece, nested = false }) {
  const dispatch = useDispatch();
  if (!ATTACHABLE_KINDS.has(item?.kind) || !piece || item.pin) return null;
  const actionBase = { wallId: wall.id, runId: run.id, itemId: item.id };
  const lines = linesOn(wall, wallSideOf(run));
  const attach = item.attach ?? null;
  const line = attach ? findLine(wall, attach.lineId) : null;
  const others = runItems(run).filter((candidate) => candidate.id !== item.id && placedAt(candidate));
  const noun = item.kind === 'void' ? 'open' : nested ? 'column' : 'cabinet';
  return (
    <PanelSection id="piece.line" title={nested ? 'Column layout line' : 'Layout line'}>
      {!attach && others.length === 1 && (
        <p className="mb-2 rounded border border-cyan-900/70 bg-cyan-950/30 p-2 text-xs text-cyan-200">
          {SECOND_LINE_NOTE}
        </p>
      )}
      <LineAttachSection
        lines={lines}
        attach={attach}
        line={line}
        ariaPrefix="Column"
        onAttach={(next) => dispatch(setAttachment({
          wallId: wall.id, target: { kind: 'column', runId: run.id, itemId: item.id }, attach: next,
        }))}
        onNewLine={() => dispatch(attachColumnToNewLine({ ...actionBase, at: 'center' }))}
        extraOptions={(wall.openings ?? []).map((opening) => ({
          value: `opening:${opening.id}`,
          label: `Centre on ${opening.label}`,
          onSelect: () => dispatch(attachColumnToOpening({ ...actionBase, openingId: opening.id })),
        }))}
        note={line ? `Moves with ${line.label}. To move this ${noun}, change ${line.label} or detach.` : undefined}
      />
    </PanelSection>
  );
}
