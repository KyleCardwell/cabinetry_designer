import { useState } from 'react';
import { useSelector } from 'react-redux';
import ReportsDialog from './ReportsDialog.jsx';

export default function ReportsButton() {
  const hasRoom = useSelector(({ elevation }) => elevation.rooms.some((room) => room.id === elevation.activeRoomId));
  const [open, setOpen] = useState(false);

  return <>
    <button type="button" disabled={!hasRoom} onClick={() => setOpen(true)}
      className="rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40">
      Reports…
    </button>
    {open && hasRoom && <ReportsDialog onClose={() => setOpen(false)} />}
  </>;
}
