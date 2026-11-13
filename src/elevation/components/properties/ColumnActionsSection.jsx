import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { columnLayoutOf, findCell } from '../../model/cellTree.js';
import { isNestedGrid } from '../../model/grid.js';
import {
  applyColumnToRun,
  pasteColumn,
  removeColumn,
  setClipboard,
} from '../../store/elevationSlice.js';
import PanelSection from '../panel/PanelSection.jsx';

const BUTTON_CLASS = 'rounded bg-gray-700 px-2.5 py-2 text-xs text-gray-100 hover:bg-gray-600';
const REMOVE_CLASS = 'rounded bg-red-900/70 px-2.5 py-2 text-xs text-red-100 hover:bg-red-800';

// cellId names the root column, including when a nested leaf is selected.
export default function ColumnActionsSection({ wall, run, cellId }) {
  const dispatch = useDispatch();
  const clipboard = useSelector((state) => state.elevation.clipboard);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef(null);
  useEffect(() => {
    setCopied(false);
    return () => clearTimeout(copyTimer.current);
  }, [wall.id, run.id, cellId]);

  const node = run.grid && findCell(run.grid, cellId)?.cell.node;
  if (!node) return null;
  const targetable = isNestedGrid(node) || node.kind === 'cabinet';
  const actionBase = { wallId: wall.id, runId: run.id, cellId };

  return (
    <PanelSection id="piece.column" title="Column">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            dispatch(setClipboard({ kind: 'columnLayout', data: columnLayoutOf(run.grid, cellId) }));
            setCopied(true);
            clearTimeout(copyTimer.current);
            copyTimer.current = setTimeout(() => setCopied(false), 1500);
          }}
          className={BUTTON_CLASS}
        >
          {copied ? 'Copied' : 'Copy column'}
        </button>
        {targetable && clipboard?.kind === 'columnLayout' && (
          <button type="button" onClick={() => dispatch(pasteColumn(actionBase))} className={BUTTON_CLASS}>
            Paste column
          </button>
        )}
        {targetable && (
          <button type="button" onClick={() => dispatch(applyColumnToRun(actionBase))} className={BUTTON_CLASS}>
            Apply to all columns
          </button>
        )}
        <button type="button" onClick={() => dispatch(removeColumn(actionBase))} className={REMOVE_CLASS}>
          Remove column
        </button>
      </div>
    </PanelSection>
  );
}
