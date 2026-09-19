import { useState } from 'react';
import { useSelector } from 'react-redux';
import { wallLabel } from '../model/topology.js';

export default function JsonToggle() {
  const [showJson, setShowJson] = useState(false);
  const activeRoom = useSelector((state) => (
    state.elevation.rooms.find(
      (candidate) => candidate.id === state.elevation.activeRoomId,
    ) ?? null
  ));
  const displayRoom = activeRoom ? {
    ...activeRoom,
    walls: activeRoom.walls.map((wall) => ({
      ...wall,
      name: wallLabel(activeRoom, wall),
    })),
  } : null;

  return (
    <section className="border-t border-gray-700 pt-4">
      <label className="flex items-center gap-2 text-xs text-gray-300">
        <input
          type="checkbox"
          checked={showJson}
          onChange={(event) => setShowJson(event.target.checked)}
          className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
        />
        Show JSON
      </label>
      {showJson && (
        <pre className="mt-3 max-h-72 overflow-auto rounded bg-gray-950 p-3 text-[10px] leading-relaxed text-gray-400">
          {JSON.stringify(displayRoom, null, 2)}
        </pre>
      )}
    </section>
  );
}
