import { useDispatch } from 'react-redux';
import { ruleEndGap } from '../../model/splitRun.js';
import { setRunEndGap } from '../../store/elevationSlice.js';
import GapField from './GapField.jsx';

const PANEL_ENDS = new Set(['end_panel', 'filler']);

/**
 * The gap between a run end and its end box (Kyle 2026-11-17), edited from the end box. Offered beside an
 * end panel or filler, and at any end of a face frame run; blank is the run's rule (bead gap on beaded).
 */
export default function RunEndGapField({ wall, run, settings, side }) {
  const dispatch = useDispatch();
  const type = run.ends?.[side]?.type;
  if (!PANEL_ENDS.has(type) && !(run._frame && type === 'none')) return null;
  return (
    <div className="mt-2">
      <GapField
        label={`Gap ${side} to run end (blank = run)`}
        value={run.ends[side].gap}
        fallback={ruleEndGap(run, settings, side)}
        onCommit={(gap) => dispatch(setRunEndGap({ wallId: wall.id, runId: run.id, side, gap }))}
        ariaLabel={`Run end gap ${side}`}
      />
    </div>
  );
}
