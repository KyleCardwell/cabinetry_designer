import { useDispatch } from 'react-redux';
import { combinableFaces, storedGroupOf } from '../model/combinedElevations.js';
import { elevationKey, faceKeyParts, wallLabel } from '../model/topology.js';
import { setCombinedElevation, setCombinedFace } from '../store/elevationSlice.js';

/**
 * The combined-elevation switch and its faces (Kyle 2026-10-16): on, the faces checked here are seen, lettered
 * and sent to the PDF/DXF as one elevation. Both are saved with the room. Hidden when nothing could combine.
 */
export default function CombinedElevationControl({ room, wallId, side, readOnly = false }) {
  const dispatch = useDispatch();
  if (!room || !wallId) return null;
  const key = elevationKey(wallId, side);
  const group = storedGroupOf(room, key);
  const on = Boolean(group?.on);
  const candidates = combinableFaces(room, key);
  if (candidates.length < 2 && !on) return null;
  const faceName = (faceKey) => {
    const face = faceKeyParts(faceKey);
    const wall = room.walls.find((candidate) => candidate.id === face.wallId);
    return wall ? `${wallLabel(room, wall)}${face.side === 'back' ? ' · Back' : ''}` : faceKey;
  };
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-pressed={on}
        disabled={readOnly}
        title="Show the walls facing this way together, as one elevation"
        onClick={() => dispatch(setCombinedElevation({ roomId: room.id, wallId, side, on: !on }))}
        className={`rounded px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          on ? 'bg-cyan-700 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`}
      >
        Combine
      </button>
      {on && (
        <details className="relative">
          <summary className="cursor-pointer list-none rounded bg-gray-700 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-gray-600">
            {`Faces (${group.faces.length}) ▾`}
          </summary>
          <div className="absolute left-0 z-20 mt-1 min-w-44 rounded border border-gray-600 bg-gray-900 p-2 shadow-lg">
            {candidates.map((faceKey) => (
              <label key={faceKey} className="flex items-center gap-2 py-0.5 text-xs text-gray-200">
                <input
                  type="checkbox"
                  checked={group.faces.includes(faceKey)}
                  disabled={readOnly || faceKey === key}
                  onChange={(event) => dispatch(setCombinedFace({
                    roomId: room.id, wallId, side, face: faceKey, included: event.target.checked,
                  }))}
                />
                {faceName(faceKey)}
              </label>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
