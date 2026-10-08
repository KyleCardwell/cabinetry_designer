import { useState } from 'react';
import {
  addProfilePoint, deleteProfilePoint, moveProfileOrigin, moveProfilePoint,
  nextPointId, profilePointJoints, removeProfileVertex, renameProfilePoint,
} from '../../elevation/model/profileEditing.js';
import { parseInches } from '../../elevation/model/units.js';
import CoordInput from './CoordInput.jsx';

const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const COORD_CLASS = INPUT_CLASS.replace('py-1.5 text-sm', 'py-1 font-mono text-xs');
const NAME_FAILURE = 'Point names start with a letter, use letters, numbers or _, up to 24 characters, and must be unique.';
const MOVE_FAILURE = 'That move would make an arc impossible.';
const ADD_FAILURE = 'Enter x and y in inches, e.g. 1 1/2 or -13/16.';

export default function PointsPanel({ profile, selectedPointId, onSelectPoint, onApply }) {
  const [newX, setNewX] = useState('');
  const [newY, setNewY] = useState('');
  const usedPoints = new Set(profile.geometry.loops.flatMap((loop) => (
    loop.segs.flatMap((segment) => [segment.from, segment.to])
  )));

  const addPoint = () => {
    const x = parseInches(newX.trim());
    const y = parseInches(newY.trim());
    const id = nextPointId(profile);
    const next = x === null || y === null ? null : addProfilePoint(profile, [x, y], id);
    if (onApply(next, ADD_FAILURE)) {
      setNewX('');
      setNewY('');
      onSelectPoint(id);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-gray-200">Points</h2>
      <table className="w-full table-fixed text-left text-xs text-gray-400">
        <thead>
          <tr>
            <th className="w-[5.25rem] pb-2 font-normal">Name</th>
            <th className="pb-2 font-normal">x</th>
            <th className="pb-2 font-normal">y</th>
            <th className="w-[8rem]"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(profile.geometry.points).map(([id, [x, y]]) => {
            const joints = profilePointJoints(profile, id);
            return (
              <tr
                key={id}
                className={selectedPointId === id ? 'bg-blue-900/40' : ''}
                onClick={(event) => {
                  if (!event.target.closest('input')) onSelectPoint(id);
                }}
              >
                <td className="py-1 pr-1">
                  <input
                    type="text"
                    aria-label={`Name of ${id}`}
                    className={COORD_CLASS.replace('w-full', 'w-20')}
                    defaultValue={id}
                    onBlur={(event) => {
                      const newId = event.currentTarget.value;
                      if (newId === id) return;
                      if (onApply(renameProfilePoint(profile, id, newId), NAME_FAILURE)) {
                        if (selectedPointId === id) onSelectPoint(newId);
                      } else {
                        event.currentTarget.value = id;
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />
                </td>
                <td className="py-1 pr-1">
                  <CoordInput value={x} aria-label={`x of ${id}`} onCommit={(nextX) => onApply(moveProfilePoint(profile, id, [nextX, y]), MOVE_FAILURE)} />
                </td>
                <td className="py-1 pr-1">
                  <CoordInput value={y} aria-label={`y of ${id}`} onCommit={(nextY) => onApply(moveProfilePoint(profile, id, [x, nextY]), MOVE_FAILURE)} />
                </td>
                <td className="py-1">
                  <div className="flex gap-2">
                    <button type="button" className="text-xs text-gray-400 hover:text-white" onClick={() => onApply(moveProfileOrigin(profile, id))}>Origin</button>
                    <button
                      type="button"
                      className="text-xs text-gray-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={joints.length === 0}
                      title="Remove this corner: join its two segments into one line"
                      onClick={(event) => {
                        event.stopPropagation();
                        const next = removeProfileVertex(profile, joints[0], id);
                        if (onApply(next, 'Joining here would leave a loop with too few segments.') && !Object.hasOwn(next.geometry.points, id)) onSelectPoint(null);
                      }}
                    >
                      Join
                    </button>
                    <button
                      type="button"
                      className="text-xs text-gray-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={usedPoints.has(id)}
                      title={usedPoints.has(id) ? 'Used by a line or arc — join it out first' : undefined}
                      onClick={() => onApply(deleteProfilePoint(profile, id))}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="space-y-2">
        <h3 className="text-xs text-gray-400">Add point</h3>
        <div className="flex items-center gap-2">
          <input type="text" inputMode="decimal" aria-label="New point x" placeholder="x" className={COORD_CLASS} value={newX} onChange={(event) => setNewX(event.target.value)} />
          <input type="text" inputMode="decimal" aria-label="New point y" placeholder="y" className={COORD_CLASS} value={newY} onChange={(event) => setNewY(event.target.value)} />
          <button type="button" className={BUTTON_CLASS} onClick={addPoint}>Add</button>
        </div>
      </div>
    </section>
  );
}
