import { useEffect, useState } from 'react';
import {
  deleteProfileLoop, formatProfileCoord, nextPointId, profileArcInfo, setArcRadius,
  setSegmentArc, setSegmentLine, splitProfileSegment,
} from '../../elevation/model/profileEditing.js';
import CoordInput from './CoordInput.jsx';

const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const SWEEP_FAILURE = 'Sweep must be more than 0 and less than 360.';

export default function SegmentPanel({ profile, loopId, index, onApply, onSelect }) {
  const loop = profile.geometry.loops.find((entry) => entry.id === loopId);
  const segment = loop?.segs[index];
  const info = profileArcInfo(profile, loopId, index);
  const shownSweep = info ? info.sweep.toFixed(2) : '';
  const [sweepText, setSweepText] = useState(shownSweep);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setSweepText(shownSweep);
  }, [shownSweep, loopId, index]);

  useEffect(() => {
    setDeleting(false);
  }, [profile, loopId, index]);

  if (!segment) return null;

  const toggleClass = (active) => `${BUTTON_CLASS}${active ? ' bg-blue-600 text-white' : ''}`;
  const commitSweep = () => {
    if (sweepText === shownSweep) return;
    const next = setSegmentArc(profile, loopId, index, { sweep: Number(sweepText), ccw: info.ccw });
    if (onApply(next, SWEEP_FAILURE)) setSweepText(profileArcInfo(next, loopId, index).sweep.toFixed(2));
    else setSweepText(shownSweep);
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm text-gray-200">Segment {index + 1} of {loop.segs.length} · {loopId} · {segment.from} → {segment.to}</h2>
      <div className="flex gap-2">
        <button type="button" className={toggleClass(segment.type === 'line')} aria-pressed={segment.type === 'line'} onClick={() => onApply(setSegmentLine(profile, loopId, index))}>Line</button>
        <button type="button" className={toggleClass(segment.type === 'arc')} aria-pressed={segment.type === 'arc'} onClick={() => onApply(setSegmentArc(profile, loopId, index, { sweep: 90, ccw: false }))}>Arc</button>
      </div>
      {info && (
        <>
          <label className="block space-y-1 text-xs text-gray-400">
            <span>Radius</span>
            <CoordInput value={info.radius} onCommit={(radius) => onApply(setArcRadius(profile, loopId, index, radius), "The radius can't be less than half the distance between the ends.")} />
          </label>
          <label className="block space-y-1 text-xs text-gray-400">
            <span>Sweep°</span>
            <input
              type="text"
              inputMode="decimal"
              className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1 font-mono text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
              value={sweepText}
              onChange={(event) => setSweepText(event.target.value)}
              onBlur={commitSweep}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
          </label>
          <div className="space-y-1">
            <p className="text-xs text-gray-400">Direction</p>
            <div className="flex gap-2">
              <button type="button" className={toggleClass(!info.ccw)} aria-pressed={!info.ccw} onClick={() => onApply(setSegmentArc(profile, loopId, index, { sweep: info.sweep, ccw: false }))}>Clockwise</button>
              <button type="button" className={toggleClass(info.ccw)} aria-pressed={info.ccw} onClick={() => onApply(setSegmentArc(profile, loopId, index, { sweep: info.sweep, ccw: true }))}>Counter-clockwise</button>
            </div>
          </div>
          <p className="text-xs text-gray-400">Center {formatProfileCoord(info.center[0])}, {formatProfileCoord(info.center[1])}</p>
        </>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className={BUTTON_CLASS}
          onClick={() => {
            const id = nextPointId(profile);
            if (onApply(splitProfileSegment(profile, loopId, index))) onSelect({ kind: 'point', id });
          }}
        >
          Split
        </button>
        <button
          type="button"
          className={BUTTON_CLASS}
          onClick={() => {
            if (!deleting) {
              setDeleting(true);
              return;
            }
            if (onApply(deleteProfileLoop(profile, loopId), 'A profile needs at least one loop.')) onSelect(null);
            setDeleting(false);
          }}
        >
          {deleting ? 'Confirm delete loop' : 'Delete loop'}
        </button>
      </div>
    </section>
  );
}
