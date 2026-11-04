import { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { CABINET_TYPE_IDS } from '../../model/constants.js';
import { runLegs } from '../../model/legs.js';
import { partNumbers } from '../../model/partNumbers.js';
import { replaceRun } from '../../store/elevationSlice.js';
import PanelSection from '../panel/PanelSection.jsx';
import AddLegsRow from './AddLegsRow.jsx';
import LegRow from './LegRow.jsx';

export default function RunLegsSection({ room, wall, run, settings }) {
  const dispatch = useDispatch();
  const key = `${room.id}:${wall.id}:${run.id}`;
  const [history, setHistory] = useState(() => ({ key, current: run.legs, past: [], future: [] }));
  // Keep history scoped to this run's legs, including edits made by the child rows.
  // Restoring merges only legs into the live run so later geometry edits survive.
  if (history.key !== key) {
    setHistory({ key, current: run.legs, past: [], future: [] });
  } else if (JSON.stringify(history.current) !== JSON.stringify(run.legs)) {
    setHistory({ key, current: run.legs, past: [...history.past, history.current].slice(-100), future: [] });
  }
  const numbers = useMemo(() => partNumbers(room, settings), [room, settings]);
  const placed = useMemo(() => runLegs(room, wall, run, settings), [room, wall, run, settings]);
  if (!run.legs?.length && ![CABINET_TYPE_IDS.BASE, CABINET_TYPE_IDS.TALL].includes(run.cabinetTypeId)
    && !history.past.length && !history.future.length) return null;
  const restore = (redo) => {
    if (history.key !== key) return;
    const stack = redo ? history.future : history.past;
    if (!stack.length) return;
    const legs = stack.at(-1);
    // Panel runs are resolved wall views; restore onto the stored run, especially
    // on a back face where the view's x is mirrored.
    const stored = room.walls.find(({ id }) => id === wall.id)?.runs.find(({ id }) => id === run.id);
    if (!stored) return;
    const restored = { ...stored };
    if (legs?.length) restored.legs = legs;
    else delete restored.legs;
    setHistory({ key, current: legs,
      past: redo ? [...history.past, run.legs] : history.past.slice(0, -1),
      future: redo ? history.future.slice(0, -1) : [...history.future, run.legs] });
    dispatch(replaceRun({ roomId: room.id, wallId: wall.id, run: restored }));
  };
  return (
    <PanelSection id="run.legs" title="Legs" actions={<div className="flex gap-2">
      <button type="button" aria-label="Undo legs edit" disabled={!history.past.length}
        onClick={() => restore(false)} className="text-xs text-gray-300 disabled:opacity-40">Undo</button>
      <button type="button" aria-label="Redo legs edit" disabled={!history.future.length}
        onClick={() => restore(true)} className="text-xs text-gray-300 disabled:opacity-40">Redo</button>
    </div>}>
      <div className="space-y-3">
        {(run.legs ?? []).map((leg, index) => <LegRow key={leg.id} room={room} wall={wall} run={run}
          leg={leg} index={index} settings={settings} numbers={numbers} warnings={placed.warnings} />)}
        <AddLegsRow room={room} wall={wall} run={run} settings={settings} />
      </div>
    </PanelSection>
  );
}
