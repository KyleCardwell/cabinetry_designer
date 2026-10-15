import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
import DesignerEditor from '../elevation/DesignerEditor.jsx';
import { leaveCloudRoom, openCloudRoom } from '../elevation/store/cloudThunks.js';
import { selectDesignPermissions } from '../store/permissions.js';
import RoomHeader from './RoomHeader.jsx';
import RoomBanners from './RoomBanners.jsx';
import MissingDesignsDialog from './MissingDesignsDialog.jsx';
import { afterLeave, trackLeave } from './roomLeave.js';

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
      await afterLeave();
      if (!session.active) return;
      const reply = await dispatch(openCloudRoom({ estProjectId, roomId }));
      if (!session.active) return;
      session.opening = false;
      session.opened = reply.ok;
      setResult({ session, status: reply.ok ? 'ready' : reply.reason === 'superseded' ? 'superseded' : 'failed', message: reply.message, openBy: reply.openBy });
    };
    session.open();
    return () => {
      session.active = false;
      trackLeave(dispatch(leaveCloudRoom()));
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

  return <DesignerEditor mode="room" header={<RoomHeader projectId={projectId} roomId={roomId} />}
    banners={<>
      <RoomBanners key={roomId} projectId={projectId} roomId={roomId} openBy={result.openBy} />
      <MissingDesignsDialog key={`${info.id}:${Boolean(info.readOnly)}`} />
    </>}
    readOnly={Boolean(info.readOnly)} />;
}
