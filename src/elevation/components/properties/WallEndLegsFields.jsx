import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { runLegs } from '../../model/legs.js';
import { partNumbers } from '../../model/partNumbers.js';
import { wallEndLegList, wallLegRun } from '../../model/wallEndLegs.js';
import { wallSideView } from '../../model/wallSides.js';
import { setWallEndLegs } from '../../store/elevationSlice.js';
import Field from './Field.jsx';
import LegFields, { LEG_SELECT_CLASS, liveLegShapes } from './LegFields.jsx';

export default function WallEndLegsFields({ room, wall, endpoint, label, settings }) {
  const dispatch = useDispatch();
  const source = wall.sideSource ?? wall;
  const numbers = useMemo(() => partNumbers(room, settings), [room, settings]);
  const legs = useMemo(() => wallEndLegList(room, source, settings), [room, source, settings]);
  if (source.connections?.[endpoint] || source.landings?.[endpoint]) return null;

  const end = source.endLegs?.[endpoint];
  const update = (faces) => dispatch(setWallEndLegs({
    roomId: room.id, wallId: source.id, endpoint, endLegs: { ...end, faces },
  }));
  const changeLegs = (face, count) => {
    const faces = { ...end?.faces };
    if (!count) delete faces[face];
    else {
      const next = { ...faces[face], legs: count };
      for (const edge of ['front', 'back']) {
        if (count !== 'both' && count !== edge) delete next[edge];
        else if (!next[edge]) {
          const shape = liveLegShapes(settings)[0];
          next[edge] = { ...(shape ? { shapeId: shape.id } : { square: {} }), height: 'full', x: 0, y: 0 };
        }
      }
      faces[face] = next;
    }
    update(faces);
  };
  const updateSpec = (face, leg, changes) => {
    const edge = leg.wall.edge;
    const specs = end.faces[face];
    const spec = { ...specs[edge], ...changes };
    for (const [key, defaultMirror] of [['mirror', leg.from === 'left'], ['mirrorDepth', edge === 'back']]) {
      if (Object.hasOwn(changes, key)) spec[key] = defaultMirror !== (changes[key] === true) ? true : undefined;
    }
    update({ ...end.faces, [face]: { ...specs,
      [edge]: Object.fromEntries(Object.entries(spec).filter(([, value]) => value !== undefined)),
    } });
  };
  const other = endpoint === 'start' ? 'end' : 'start';
  const otherFree = !source.connections?.[other] && !source.landings?.[other];

  return (
    <div className="mt-3 space-y-3">
      {['front', 'back'].map((face) => {
        const run = wallLegRun(room, source, endpoint, face, settings);
        const view = wallSideView(source, face);
        const placed = run ? runLegs(room, view, run, settings) : [];
        return (
          <div key={face} className="space-y-2">
            <div className="text-xs font-medium text-gray-300">{face === 'front' ? 'Front face' : 'Back face'}</div>
            <Field label="Legs">
              <select aria-label={`${label} ${face}-face Legs`} value={end?.faces[face]?.legs ?? ''}
                disabled={!run} className={LEG_SELECT_CLASS}
                onChange={(event) => changeLegs(face, event.target.value)}>
                <option value="">None</option>
                <option value="front">Front</option>
                <option value="back">Back</option>
                <option value="both">Both</option>
              </select>
            </Field>
            {!run && <p className="text-xs text-gray-500">No run on this face stops at this end.</p>}
            {legs.filter(({ leg }) => leg.wall.endpoint === endpoint && leg.wall.face === face).map(({ leg }) => {
              const edge = leg.wall.edge;
              const number = numbers.byKey.get(leg.id);
              const legLabel = `${label} ${face}-face ${edge} leg`;
              return (
                <div key={leg.id} aria-label={legLabel} className="rounded border border-gray-700 bg-gray-900/45 p-3">
                  <div className="mb-2 text-xs text-gray-300">
                    {edge === 'front' ? 'Front' : 'Back'} leg{number != null && ` #${number}`}
                  </div>
                  <LegFields room={room} wall={view} run={run} leg={leg} settings={settings} label={legLabel}
                    onChange={(changes) => updateSpec(face, leg, changes)} fixedRefs
                    placement={placed.find((entry) => entry.leg.id === leg.id)} warnings={placed.warnings} />
                </div>
              );
            })}
          </div>
        );
      })}
      <p className="text-xs text-gray-500">Along: to the leg&apos;s outside face from the wall end. In/out: the front leg&apos;s front face from the doors, the back leg&apos;s back face from the run back. + = proud, − = into the run.</p>
      {end && otherFree && <button type="button" className="text-xs text-blue-400"
        onClick={() => dispatch(setWallEndLegs({ roomId: room.id, wallId: source.id, endpoint: other,
          endLegs: { faces: structuredClone(end.faces) },
        }))}>Copy to the other end</button>}
    </div>
  );
}
