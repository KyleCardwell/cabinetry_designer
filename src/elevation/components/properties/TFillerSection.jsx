import { useDispatch } from 'react-redux';
import { teeSides } from '../../model/index.js';
import { setItemTFiller } from '../../store/elevationSlice.js';
import Field from './Field.jsx';

const SIDES = ['left', 'right', 'top', 'bottom'];
const OPPOSITE = {
  left: 'right', right: 'left', top: 'bottom', bottom: 'top',
};
const TO_VALUE = { follow: null, yes: true, no: false };

const toChoice = (value) => (value === true ? 'yes' : value === false ? 'no' : 'follow');

// One select per edge that touches another Euro box. Writing it sets the
// same choice on both boxes so the seam answers the same from either side.
export default function TFillerSection({
  room, wall, run, cells, settings, piece,
}) {
  const dispatch = useDispatch();
  const sides = teeSides(room, run, cells, settings, piece.id);
  if (!sides) return null;
  const touching = SIDES.filter((side) => sides[side].neighbor);
  if (touching.length === 0) return null;

  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
        T-filler
      </h3>
      <div className="space-y-2">
        {touching.map((side) => (
          <Field key={side} label={`${side[0].toUpperCase()}${side.slice(1)} edge`}>
            <select
              value={toChoice(sides[side].own)}
              onChange={(event) => {
                const value = TO_VALUE[event.target.value];
                dispatch(setItemTFiller({
                  wallId: wall.id,
                  runId: run.id,
                  edits: [
                    { itemId: piece.id, side, value },
                    { itemId: sides[side].neighbor, side: OPPOSITE[side], value },
                  ],
                }));
              }}
              aria-label={`${side} edge T-filler`}
              className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="follow">{`Follow run (${sides[side].on ? 'on' : 'off'})`}</option>
              <option value="yes">T-filler</option>
              <option value="no">No T-filler</option>
            </select>
          </Field>
        ))}
      </div>
    </section>
  );
}
