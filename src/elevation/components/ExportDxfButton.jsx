import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { drawingErrorMessage, requestRoomDrawings, saveBlob } from '../../api/drawings.js';
import { toDrawingPayload, drawingZipName } from '../model/drawingPayload.js';
import { setMessage } from '../store/elevationSlice.js';

export default function ExportDxfButton() {
  const dispatch = useDispatch();
  const { rooms, activeRoomId, settings } = useSelector((state) => state.elevation);
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  const [busy, setBusy] = useState(false);
  const messageTimeout = useRef(null);

  useEffect(() => () => clearTimeout(messageTimeout.current), []);

  const showMessage = (text) => {
    clearTimeout(messageTimeout.current);
    dispatch(setMessage(text));
    messageTimeout.current = setTimeout(() => dispatch(setMessage(null)), 4000);
  };

  const exportDxf = async () => {
    if (busy || !room) return;
    setBusy(true);
    try {
      const payload = toDrawingPayload(room, settings);
      if (payload.elevations.length === 0) {
        showMessage('Nothing to export: no wall has cabinets');
        return;
      }
      const blob = await requestRoomDrawings(payload);
      saveBlob(blob, drawingZipName(room.name));
      showMessage(`Exported ${payload.elevations.length} elevations`);
    } catch (error) {
      showMessage(`DXF export failed: ${await drawingErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy || !room}
      onClick={exportDxf}
      className="rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {busy ? 'Exporting…' : 'Export DXF'}
    </button>
  );
}
