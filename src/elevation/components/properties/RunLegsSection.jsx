import { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { CABINET_TYPE_IDS } from '../../model/constants.js';
import { endFit } from '../../model/endLegs.js';
import { runLegs } from '../../model/legs.js';
import { partNumbers } from '../../model/partNumbers.js';
import { wallEndpointSide } from '../../model/wallEndPanels.js';
import { wallSideOf } from '../../model/wallSides.js';
import { replaceRun } from '../../store/elevationSlice.js';
import PanelSection from '../panel/PanelSection.jsx';
import AddLegsRow from './AddLegsRow.jsx';
import LegRow from './LegRow.jsx';

export default function RunLegsSection({ room, wall, run, settings }) {
  const dispatch = useDispatch();
  const key = `${room.id}:${wall.id}:${run.id}`;
  const snapshot = { legs: run.legs, endLegs: run.endLegs, ends: run.ends };
  const [history, setHistory] = useState(() => ({ key, current: snapshot, past: [], future: [] }));
  // End pieces and end legs travel with hand legs through undo/redo.
  if (history.key !== key) {
    setHistory({ key, current: snapshot, past: [], future: [] });
  } else if (JSON.stringify(history.current) !== JSON.stringify(snapshot)) {
    setHistory({ key, current: snapshot, past: [...history.past, history.current].slice(-100), future: [] });
  }
  const numbers = useMemo(() => partNumbers(room, settings), [room, settings]);
  const placed = useMemo(() => runLegs(room, wall, run, settings), [room, wall, run, settings]);
  if (!run.legs?.length && !Object.keys(run.endLegs ?? {}).length
    && !run._wallLegs?.length && !Object.keys(run._wallEnds ?? {}).length
    && ![CABINET_TYPE_IDS.BASE, CABINET_TYPE_IDS.TALL, CABINET_TYPE_IDS.UPPER].includes(run.cabinetTypeId)
    && !history.past.length && !history.future.length) return null;
  const restore = (redo) => {
    if (history.key !== key) return;
    const stack = redo ? history.future : history.past;
    if (!stack.length) return;
    const target = stack.at(-1);
    // Panel runs are resolved wall views; restore onto the stored run, especially
    // on a back face where the view's x is mirrored.
    const stored = room.walls.find(({ id }) => id === wall.id)?.runs.find(({ id }) => id === run.id);
    if (!stored) return;
    const restored = { ...stored };
    for (const field of ['legs', 'endLegs', 'ends']) {
      if (target[field] !== undefined) restored[field] = target[field];
      else delete restored[field];
    }
    setHistory({ key, current: target,
      past: redo ? [...history.past, snapshot] : history.past.slice(0, -1),
      future: redo ? history.future.slice(0, -1) : [...history.future, snapshot] });
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
        {['left', 'right'].filter((side) => run._wallEnds?.[side] || run.endLegs?.[side]).map((side) => {
          if (run._wallEnds?.[side]) {
            const source = wall.sideSource ?? wall;
            const endpoint = ['start', 'end'].find((endpoint) =>
              wallEndpointSide(room, source, endpoint, wallSideOf(run)) === side);
            const legs = source.endLegs?.[endpoint]?.faces[wallSideOf(run)]?.legs;
            const description = legs === 'both' ? 'front and back legs' : legs ? `${legs} leg` : 'legs';
            return <p key={side} className="text-xs text-gray-300">
              {`${side === 'left' ? 'Left' : 'Right'} end: ${description} (set on the wall, under End panels).`}
            </p>;
          }
          const legs = run.endLegs[side].legs;
          const fit = endFit(run, side);
          const description = legs === 'both' ? 'front and back legs' : `${legs} leg`;
          const fitted = fit === 'between' ? ', panel between the legs' : fit === 'behind' ? ', filler behind the front leg' : '';
          return <p key={side} className="text-xs text-gray-300">
            {`${side === 'left' ? 'Left' : 'Right'} end: ${description}${fitted} (edit under Ends).`}
          </p>;
        })}
        {(run.legs ?? []).map((leg, index) => <LegRow key={leg.id} room={room} wall={wall} run={run}
          leg={leg} index={index} settings={settings} numbers={numbers} warnings={placed.warnings}
          placement={placed.find((entry) => entry.leg.id === leg.id)} />)}
        <AddLegsRow room={room} wall={wall} run={run} settings={settings} />
      </div>
    </PanelSection>
  );
}
