import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { wallLabel } from '../model/topology.js';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function JsonToggle() {
  const [showJson, setShowJson] = useState(false);
  const activeRoom = useSelector((state) => (
    state.elevation.rooms.find(
      (candidate) => candidate.id === state.elevation.activeRoomId,
    ) ?? null
  ));
  const roomBytes = useMemo(
    () => (activeRoom ? new TextEncoder().encode(JSON.stringify(activeRoom)).length : 0),
    [activeRoom],
  );
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
        {activeRoom && (
          <span className="ml-auto text-gray-500" title="Saved size of this room: compact JSON, UTF-8 bytes">
            {formatBytes(roomBytes)}
          </span>
        )}
      </label>
      {showJson && (
        <pre className="mt-3 max-h-72 overflow-auto rounded bg-gray-950 p-3 text-[10px] leading-relaxed text-gray-400">
          {JSON.stringify(displayRoom, null, 2)}
        </pre>
      )}
    </section>
  );
}
