import { useDispatch } from 'react-redux';
import { attachmentsTo } from '../../model/layoutLines.js';
import { roomLineOnFace } from '../../model/roomLines.js';
import { wallLabel } from '../../model/topology.js';
import { formatDimension } from '../../model/units.js';
import { WALL_SIDES, wallSideOf } from '../../model/wallSides.js';
import {
  deleteRoomLine,
  setActiveWall,
  setActiveWallSide,
  setSelection,
  updateRoomLine,
} from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import TextInput from '../TextInput.jsx';
import Field from './Field.jsx';
import { roomLineSquareMessage } from './LineAttachSection.jsx';

const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const faceKey = (wallId, side) => JSON.stringify([wallId, side]);

/** Shared by elevation and plan: the stored reference distance, with attachments across the room. */
export default function RoomLineProperties({ room, wall, line }) {
  const dispatch = useDispatch();
  const base = { roomId: room.id, roomLineId: line.id };
  const update = (changes) => dispatch(updateRoomLine({ ...base, ...changes }));
  const choices = room.walls.flatMap((candidate) => WALL_SIDES.flatMap((side) => (
    roomLineOnFace(room, candidate, side, line.id)?.square
      ? [{ wallId: candidate.id, side, label: `${wallLabel(room, candidate)}${side === 'back' ? ' (back)' : ''}` }]
      : []
  )));
  const rows = room.walls.flatMap((candidate) => attachmentsTo(candidate, line.id).map((target) => {
    const runIndex = candidate.runs.findIndex((run) => run.id === target.runId);
    const run = candidate.runs[runIndex];
    const opening = candidate.openings.find((opening) => opening.id === target.openingId);
    return {
      key: `${candidate.id}:${target.kind}:${target.openingId ?? target.runId}:${target.itemId ?? ''}`,
      wallId: candidate.id,
      side: opening ? 'front' : wallSideOf(run),
      text: `${wallLabel(room, candidate)} · ${opening ? opening.label : `Run ${runIndex + 1}${target.kind === 'column' ? ' · cabinet' : ''}`}`,
      selection: opening ? { openingId: opening.id }
        : { runId: target.runId, ...(target.itemId ? { pieceId: target.itemId } : {}) },
    };
  }));
  const projected = wall && roomLineOnFace(room, wall, wall.side ?? 'front', line.id);
  const otherFace = wall && (wall.id !== line.wallId || (wall.side ?? 'front') !== wallSideOf(line));
  const attachedHere = wall && attachmentsTo(wall, line.id).length > 0;
  const warnings = [
    roomLineSquareMessage(room, projected),
    attachedHere && projected && (projected.value < 0 || projected.value > wall.length)
      ? `${line.label} is ${formatDimension(projected.value < 0 ? -projected.value : projected.value - wall.length)} past the ${projected.value < 0 ? 'left' : 'right'} end of this wall.`
      : null,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Room line</h3>
          <button type="button" onClick={() => dispatch(deleteRoomLine(base))}
            className="rounded bg-red-900/70 px-2.5 py-1.5 text-xs text-red-100 hover:bg-red-800">
            Delete
          </button>
        </div>
        <Field label="Label">
          <TextInput value={line.label} aria-label="Room line label" className={INPUT_CLASS}
            onCommit={(text) => {
              const label = text.trim();
              if (!label || label.length > 24) return false;
              update({ label });
              return true;
            }} />
        </Field>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Measured from</h3>
        <select value={faceKey(line.wallId, wallSideOf(line))} aria-label="Room line measured from"
          className={INPUT_CLASS} onChange={(event) => {
            const choice = choices.find((candidate) => faceKey(candidate.wallId, candidate.side) === event.target.value);
            if (choice) update({ wallId: choice.wallId, wallSide: choice.side });
          }}>
          {choices.map((choice) => (
            <option key={faceKey(choice.wallId, choice.side)} value={faceKey(choice.wallId, choice.side)}>
              {choice.label}
            </option>
          ))}
        </select>
        <div className="mt-2.5 grid grid-cols-2 overflow-hidden rounded border border-gray-700">
          {[['left', 'Left end'], ['right', 'Right end']].map(([from, label]) => (
            <button key={from} type="button" aria-pressed={line.from === from} onClick={() => update({ from })}
              className={`px-2 py-2 text-xs font-medium transition-colors ${line.from === from
                ? 'bg-blue-600 text-white' : 'bg-gray-900/45 text-gray-400 hover:bg-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="mt-2.5">
          <Field label="Distance">
            <InchInput value={line.value} aria-label="Room line distance" onCommit={(value) => {
              if (!Number.isFinite(value) || value < 0) return false;
              update({ value });
              return true;
            }} />
          </Field>
        </div>
        {otherFace && projected && (
          <p className="mt-2 text-xs text-gray-500">
            On this wall: {formatDimension(projected.value)} from the left end
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">On this line</h3>
        {rows.length === 0 ? <p className="text-xs text-gray-500">Nothing is attached.</p> : (
          <ul className="space-y-1">
            {rows.map((row) => (
              <li key={row.key}>
                <button type="button" onClick={() => {
                  dispatch(setActiveWall(row.wallId));
                  dispatch(setActiveWallSide(row.side));
                  dispatch(setSelection(row.selection));
                }} className="w-full rounded border border-gray-700 bg-gray-900/45 px-2.5 py-1.5 text-left text-xs text-gray-300 hover:bg-gray-700">
                  {row.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Warnings &amp; errors</h3>
        {warnings.length === 0 ? <p className="mt-2 text-xs text-gray-500">No warnings or errors.</p> : (
          <ul className="mt-2 space-y-2 text-xs">
            {warnings.map((warning) => (
              <li key={warning} className="rounded border border-amber-900/80 bg-amber-950/35 px-2.5 py-2 text-amber-300">
                {warning}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
