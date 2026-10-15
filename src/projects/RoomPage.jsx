import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
import DesignerEditor from '../elevation/DesignerEditor.jsx';
import { leaveCloudRoom, openCloudRoom } from '../elevation/store/cloudThunks.js';
import { selectDesignPermissions } from '../store/permissions.js';
import RoomHeader from './RoomHeader.jsx';

// A new route (including StrictMode's second mount) waits for the previous leave.
let leaving = Promise.resolve();

export default function RoomPage() {
  const { projectId, roomId } = useParams();
  const estProjectId = Number(projectId);
  const dispatch = useDispatch();
  const teamId = useSelector((state) => state.auth.teamId);
  const { view } = useSelector(selectDesignPermissions);
  const info = useSelector((state) => state.elevation.cloud?.room);
  const sessionRef = useRef(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!teamId || !view) return;
    const session = { active: true, opening: false, opened: false, estProjectId, roomId, teamId };
    sessionRef.current = session;
    session.open = async () => {
      if (!session.active || session.opening) return;
      session.opening = true;
      setResult({ session, status: 'opening' });
      await leaving;
      if (!session.active) return;
      const reply = await dispatch(openCloudRoom({ estProjectId, roomId }));
      if (!session.active) return;
      session.opening = false;
      session.opened = reply.ok;
      setResult({ session, status: reply.ok ? 'ready' : reply.reason === 'superseded' ? 'superseded' : 'failed', message: reply.message });
    };
    session.open();
    return () => {
      session.active = false;
      leaving = Promise.resolve(dispatch(leaveCloudRoom()));
    };
  }, [dispatch, teamId, view, estProjectId, roomId]);

  useEffect(() => {
    const session = sessionRef.current;
    if (session?.active && session.opened && !session.opening && info?.id !== roomId) session.open();
  }, [info?.id, roomId, result]);

  if (!teamId) return <p className="p-6">You are not on a team.</p>;
  if (!view) return <p className="p-6">You don&apos;t have permission to view designs.</p>;

  const current = result?.session === sessionRef.current && result?.session.estProjectId === estProjectId
    && result?.session.roomId === roomId && result?.session.teamId === teamId;
  if (current && result.status === 'failed') return <div className="p-6 space-y-4">
    <Link to={`/projects/${projectId}`} className="text-blue-400 hover:underline">← Project</Link>
    <div role="alert" className="rounded border border-red-700 bg-red-950 p-3 text-red-200">
      {result.message}
      <button type="button" className="ml-3 underline" onClick={() => sessionRef.current.open()}>Retry</button>
    </div>
  </div>;
  if (!current || result.status !== 'ready' || info?.id !== roomId) return <p role="status" className="p-6">Opening room…</p>;

  return <DesignerEditor mode="room" header={<RoomHeader projectId={projectId} roomId={roomId} />} banners={null} readOnly={Boolean(info.readOnly)} />;
}
