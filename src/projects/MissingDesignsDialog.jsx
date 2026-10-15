import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { MissingDoorDesignRow } from '../elevation/components/MissingDoorDesignsNotice.jsx';
import { missingDoorDesigns } from '../elevation/model/doorDesigns.js';

// RoomPage keys this by cloud room id and readOnly, so Edit anyway asks again.
export default function MissingDesignsDialog() {
  const { rooms, settings, cloud } = useSelector((state) => state.elevation);
  const room = rooms.find((candidate) => candidate.id === cloud.room?.id);
  const missing = room ? missingDoorDesigns(room, settings.doorDesigns) : [];
  const [dismissed, setDismissed] = useState(() => missing.length === 0);

  useEffect(() => {
    if (missing.length === 0) setDismissed(true);
  }, [missing.length]);

  if (!room || cloud.room.readOnly || dismissed || missing.length === 0) return null;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    onKeyDown={(event) => event.stopPropagation()}>
    <section role="dialog" aria-modal="true" aria-labelledby="missing-door-designs-title" className="max-h-full w-full max-w-2xl space-y-4 overflow-y-auto rounded border border-gray-700 bg-gray-800 p-6 text-gray-100">
      <h2 id="missing-door-designs-title" className="text-lg font-semibold">This room uses door designs that aren&apos;t in the Library</h2>
      {missing.map(({ designId, styles }) => (
        <MissingDoorDesignRow key={designId} room={room} designId={designId} styles={styles} readOnly={false} />
      ))}
      <button autoFocus type="button" className="rounded border border-gray-600 px-3 py-2" onClick={() => setDismissed(true)}>Not now</button>
    </section>
  </div>;
}
