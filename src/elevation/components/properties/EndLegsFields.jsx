import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { CABINET_TYPE_IDS } from '../../model/constants.js';
import { endFit, endLegList, endPieceType } from '../../model/endLegs.js';
import { runLegFills } from '../../model/legFills.js';
import { runLegs } from '../../model/legs.js';
import { partNumbers } from '../../model/partNumbers.js';
import { setRunEndLegs } from '../../store/elevationSlice.js';
import Field from './Field.jsx';
import LegFields, { LEG_SELECT_CLASS, LegPanelFields, liveLegShapes } from './LegFields.jsx';

export default function EndLegsFields({ room, wall, run, side, settings, actionBase }) {
  const dispatch = useDispatch();
  const numbers = useMemo(() => partNumbers(room, settings), [room, settings]);
  const placed = useMemo(() => runLegs(room, wall, run, settings), [room, wall, run, settings]);
  const fills = useMemo(() => runLegFills(room, wall, run, settings), [room, wall, run, settings]);
  const end = run.endLegs?.[side];
  const piece = endPieceType(run, side);
  const fit = endFit(run, side);
  if (run._wallEnds?.[side]) return <p className="mt-3 text-xs text-gray-500">Legs for this end are set on the wall (End panels).</p>;
  if (piece === 'blind' || (!end && !run.legs?.length
    && ![CABINET_TYPE_IDS.BASE, CABINET_TYPE_IDS.TALL, CABINET_TYPE_IDS.UPPER].includes(run.cabinetTypeId))) return null;

  const label = `${side === 'left' ? 'Left' : 'Right'} end`;
  const update = (value) => dispatch(setRunEndLegs({ ...actionBase, side, endLegs: value }));
  // A rewritten end suppresses its saved fit. Editing its legs must not reactivate it.
  const current = { ...end };
  if (!fit) {
    delete current.fit;
    delete current.panel;
  }
  const changeLegs = (legs) => {
    if (!legs) return update(undefined);
    const next = { ...current, legs };
    for (const edge of ['front', 'back']) {
      if (legs !== 'both' && legs !== edge) delete next[edge];
      else if (!next[edge]) {
        const shape = liveLegShapes(settings)[0];
        next[edge] = { ...(shape ? { shapeId: shape.id } : { square: {} }), height: 'full', x: 0, y: 0 };
      }
    }
    update(next);
  };
  const updateSpec = (edge, changes) => {
    const spec = { ...end[edge], ...changes };
    for (const [key, defaultMirror] of [['mirror', side === 'left'], ['mirrorDepth', edge === 'back']]) {
      if (Object.hasOwn(changes, key)) spec[key] = defaultMirror !== (changes[key] === true) ? true : undefined;
    }
    update({ ...current, [edge]: Object.fromEntries(Object.entries(spec).filter(([, value]) => value !== undefined)) });
  };
  const updatePanel = (key, value) => {
    const panel = { ...end.panel };
    if (value === undefined) delete panel[key];
    else panel[key] = value;
    if (key === 'returns' && value === undefined) delete panel.returnDepth;
    const next = { ...current };
    if (Object.keys(panel).length) next.panel = panel;
    else delete next.panel;
    update(next);
  };
  const fitting = piece === 'end_panel' && end?.legs === 'both' ? 'between'
    : piece === 'filler' && ['front', 'both'].includes(end?.legs) ? 'behind' : null;

  return (
    <div className="mt-3 space-y-2">
      <Field label="Legs">
        <select aria-label={`${label} Legs`} value={end?.legs ?? ''}
          className={LEG_SELECT_CLASS} onChange={(event) => changeLegs(event.target.value)}>
          <option value="">None</option>
          <option value="front">Front</option>
          <option value="back">Back</option>
          <option value="both">Both</option>
        </select>
      </Field>
      {fitting && <Field label="Fit">
        <select aria-label={`${label} Fit`} value={fit ?? ''} className={LEG_SELECT_CLASS}
          onChange={(event) => {
            const next = { ...current };
            if (event.target.value) next.fit = event.target.value;
            else delete next.fit;
            if (next.fit !== 'between') delete next.panel;
            update(next);
          }}>
          <option value="">Inside the legs</option>
          <option value={fitting}>{fitting === 'between' ? 'Between the legs' : 'Behind the front leg'}</option>
        </select>
      </Field>}
      {fit === 'between' && <LegPanelFields panel={end.panel ?? {}} settings={settings} label={label} onChange={updatePanel} />}
      {endLegList(run).filter((leg) => leg.end.side === side).map((leg) => {
        const edge = leg.end.edge;
        const legLabel = `${side === 'left' ? 'Left' : 'Right'} ${edge} leg`;
        const number = numbers.byKey.get(leg.id);
        return (
          <div key={leg.id} aria-label={legLabel} className="rounded border border-gray-700 bg-gray-900/45 p-3">
            <div className="mb-2 text-xs text-gray-300">
              {edge === 'front' ? 'Front' : 'Back'} leg{number != null && ` #${number}`}
            </div>
            <LegFields room={room} wall={wall} run={run} leg={leg} settings={settings} label={legLabel}
              onChange={(changes) => updateSpec(edge, changes)} fixedRefs
              placement={placed.find((entry) => entry.leg.id === leg.id)}
              warnings={[...placed.warnings, ...(edge === 'front' ? fills.warnings : [])]} />
          </div>
        );
      })}
      {end && <p className="mt-1 text-xs text-gray-500">Along: to the leg&apos;s outside face from the run end. In/out: the front leg&apos;s front face from the doors, the back leg&apos;s back face from the run back. + = proud of the run, − = into it.</p>}
    </div>
  );
}
