import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { MissingDoorDesignRow } from '../elevation/components/MissingDoorDesignsNotice.jsx';
import { missingDoorDesigns } from '../elevation/model/doorDesigns.js';
import { MissingPullRow } from '../elevation/components/MissingPullsNotice.jsx';
import { missingPulls } from '../elevation/model/pulls.js';

// RoomPage keys this by cloud room id and readOnly, so Edit anyway asks again.
export default function MissingDesignsDialog() {
  const { rooms, settings, layers, cloud } = useSelector((state) => state.elevation);
  const room = rooms.find((candidate) => candidate.id === cloud.room?.id);
  const missing = room ? missingDoorDesigns(room, settings.doorDesigns) : [];
  const pulls = room ? missingPulls(room, settings, layers) : [];
  const count = missing.length + pulls.length;
  const [dismissed, setDismissed] = useState(() => count === 0);

  useEffect(() => {
    if (count === 0) setDismissed(true);
  }, [count]);

  if (!room || cloud.room.readOnly || dismissed || count === 0) return null;
  const kinds = missing.length ? (pulls.length ? 'door designs and pulls' : 'door designs') : 'pulls';

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    onKeyDown={(event) => event.stopPropagation()}>
    <section role="dialog" aria-modal="true" aria-labelledby="missing-door-designs-title" className="max-h-full w-full max-w-2xl space-y-4 overflow-y-auto rounded border border-gray-700 bg-gray-800 p-6 text-gray-100">
      <h2 id="missing-door-designs-title" className="text-lg font-semibold">This room uses {kinds} that aren&apos;t in the Library</h2>
      {missing.map(({ designId, styles }) => (
        <MissingDoorDesignRow key={designId} room={room} designId={designId} styles={styles} readOnly={false} />
      ))}
      {pulls.map((row) => <MissingPullRow key={row.pullId} room={room} {...row} readOnly={false} />)}
      <button autoFocus type="button" className="rounded border border-gray-600 px-3 py-2" onClick={() => setDismissed(true)}>Not now</button>
    </section>
  </div>;
}
