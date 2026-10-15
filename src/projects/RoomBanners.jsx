import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { ROOM_STATUS_LABELS } from '../elevation/model/designProjects.js';
import { allowRoomDemote, editRoomAnyway, openCloudWorkspace, overwriteRoomConflict, reloadRoomAfterConflict, setRoomStatus } from '../elevation/store/cloudThunks.js';
import { cloudSync } from '../elevation/store/cloudSync.js';
import { selectRoomEditors } from '../elevation/store/presenceSlice.js';
import { editorsText, readOnlyText, statusBlockText } from './roomText.js';
import StaleDraftDialog from './StaleDraftDialog.jsx';
import useOnline from './useOnline.js';

const time = (at) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dateTime = (at) => `${new Date(at).toLocaleDateString()} ${time(at)}`;
const amber = 'rounded border border-amber-700 bg-amber-950 p-3 text-amber-200';
const action = 'rounded border border-current px-2 py-1 text-sm disabled:opacity-50';

function useApprovedEditCheck() {
  const { source, cloud } = useSelector((state) => state.elevation);
  const { room, statusBlock, pending = 0, permissions } = cloud;
  const previous = useRef({ roomId: room?.id, pending });
  useEffect(() => {
    const firstEdit = previous.current.roomId === room?.id && previous.current.pending === 0 && pending > 0;
    previous.current = { roomId: room?.id, pending };
    if (firstEdit && source === 'cloud' && permissions?.edit && room && !room.readOnly
      && ['approved', 'released'].includes(room.status) && !room.demote && !statusBlock) {
      cloudSync.flush();
    }
  }, [source, permissions?.edit, room?.id, room?.readOnly, room?.status, room?.demote, statusBlock, pending]);
}

export default function RoomBanners({ projectId, roomId, openBy = [] }) {
  useApprovedEditCheck();
  const dispatch = useDispatch();
  const cloud = useSelector((state) => state.elevation.cloud);
  const editors = useSelector((state) => selectRoomEditors(state, roomId));
  const online = useOnline();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [editError, setEditError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [movingToDrafting, setMovingToDrafting] = useState(false);
  const [statusError, setStatusError] = useState(null);
  const [dismissedRecovery, setDismissedRecovery] = useState(null);
  const { room, conflict, error, statusBlock } = cloud;
  const reason = room?.readOnlyReason;
  const roomBlock = statusBlock?.target === 'room';
  const roomConflict = conflict?.target === 'room';

  useEffect(() => { setConfirmDiscard(false); }, [roomBlock]);
  useEffect(() => { setConfirmOverwrite(false); }, [roomConflict]);
  useEffect(() => { setEditError(null); }, [reason]);

  if (!room) return null;
  const readOnlyMessage = readOnlyText(reason, openBy);
  const openedAt = openBy.map((entry) => entry.openedAt).filter(Boolean)
    .sort((a, b) => new Date(a) - new Date(b))[0];
  const names = editorsText(editors);
  const plural = new Set(editors.map((entry) => entry.userName || 'Someone')).size > 1;
  const recovered = room.recovered && dismissedRecovery !== room.recoveredAt;
  const statusNotice = !room.readOnly && ['approved', 'released'].includes(room.status) && !statusBlock;

  async function editAnyway() {
    setEditing(true);
    setEditError(null);
    try {
      const reply = await dispatch(editRoomAnyway());
      if (!reply.ok) setEditError(reply.message);
    } finally { setEditing(false); }
  }

  async function moveToDrafting() {
    setMovingToDrafting(true);
    setStatusError(null);
    try {
      const reply = await dispatch(setRoomStatus('drafting'));
      if (!reply.ok) setStatusError(reply.message);
    } finally { setMovingToDrafting(false); }
  }

  const banners = <>
    {readOnlyMessage && <div role="status" className="rounded border border-gray-600 bg-gray-800 p-3 text-gray-200">
      <p>{readOnlyMessage}{reason === 'others' && openedAt ? ` (since ${time(openedAt)})` : ''}</p>
      {reason === 'others' && <button type="button" className={action} disabled={editing} onClick={editAnyway}>Edit anyway</button>}
      {reason === 'archived' && <Link className="underline" to={`/projects/${projectId}`}>Open the project</Link>}
      {editError && <p role="alert" className="mt-2 text-red-300">{editError}</p>}
    </div>}
    {!room.readOnly && editors.length > 0 && <div role="status" className={amber}>{names} also {plural ? 'have' : 'has'} this room open.</div>}
    {statusNotice && <div role="status" className="rounded border border-teal-700 bg-teal-950 p-3 text-teal-200">
      This room is {ROOM_STATUS_LABELS[room.status]}{room.statusByName ? ` (by ${room.statusByName})` : ''}. Your next change will ask before moving it back to Drafting.
      <div className="mt-2"><button type="button" className={action} disabled={movingToDrafting} onClick={moveToDrafting}>Move to Drafting</button></div>
      {statusError && <p role="alert" className="mt-2 text-red-300">{statusError}</p>}
    </div>}
    {roomBlock && <div role="alert" className={amber}>
      <p>{statusBlockText(statusBlock)}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={action} onClick={() => dispatch(allowRoomDemote())}>Save and move to Drafting</button>
        <button type="button" className={action} onClick={() => confirmDiscard ? dispatch(reloadRoomAfterConflict()) : setConfirmDiscard(true)}>{confirmDiscard ? 'Confirm discard' : 'Discard my changes'}</button>
      </div>
    </div>}
    {roomConflict && <div role="alert" className={amber}>
      <p>{conflict.updatedByName || 'Someone'} saved this room{conflict.updatedAt ? ` at ${time(conflict.updatedAt)}` : ''}. Your changes weren&apos;t saved.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={action} onClick={() => confirmOverwrite ? dispatch(overwriteRoomConflict()) : setConfirmOverwrite(true)}>{confirmOverwrite ? 'Overwrite their save?' : 'Keep mine'}</button>
        <button type="button" className={action} onClick={() => dispatch(reloadRoomAfterConflict())}>Use theirs</button>
      </div>
    </div>}
    {!online && <div role="status" className={amber}>You&apos;re offline. Changes are kept in this browser and save when the connection is back.</div>}
    {online && error && <div role="alert" className="rounded border border-red-700 bg-red-950 p-3 text-red-200">
      <p>Couldn&apos;t save {error.what}: {error.message}</p>
      <button type="button" className={action} onClick={() => cloudSync.retry()}>Retry</button>
    </div>}
    {conflict && !roomConflict && <div role="alert" className={amber}>
      <p>{conflict.what} {conflict.updatedByName ? `were changed by ${conflict.updatedByName}` : 'were changed somewhere else'}. Your change wasn&apos;t saved.</p>
      <button type="button" className={action} onClick={() => dispatch(openCloudWorkspace())}>Reload shop data</button>
    </div>}
    {recovered && <div role="status" className="rounded border border-blue-700 bg-blue-950 p-3 text-blue-200">
      <p>Recovered unsaved changes from this browser ({dateTime(room.recoveredAt)}).</p>
      <button type="button" className={action} onClick={() => setDismissedRecovery(room.recoveredAt)}>OK</button>
    </div>}
  </>;
  const visible = readOnlyMessage || (!room.readOnly && editors.length) || statusNotice || roomBlock || conflict || !online || error || recovered;
  return <>
    {visible ? <div className="space-y-2 p-3">{banners}</div> : null}
    {room.staleDraft && <StaleDraftDialog key={`${room.id}:${room.staleDraft.savedAt}:${room.staleDraft.baseVersion}`} staleDraft={room.staleDraft} />}
  </>;
}
