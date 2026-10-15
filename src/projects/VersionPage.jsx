import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
import DesignerEditor from '../elevation/DesignerEditor.jsx';
import { openRoomVersion } from '../elevation/store/cloudThunks.js';
import { selectDesignPermissions } from '../store/permissions.js';
import { afterLeave } from './roomLeave.js';
import { readOnlyText } from './roomText.js';

export function VersionHeader({ projectId, roomId }) {
  const { rooms, cloud } = useSelector((state) => state.elevation);
  const room = rooms.find((entry) => entry.id === roomId);
  const issued = cloud.room.issued;
  return <div className="space-y-2">
    <Link to={`/projects/${projectId}/rooms/${roomId}`} className="text-sm text-blue-400 hover:underline">← Room</Link>
    <h1 className="text-lg font-semibold">{room?.name}</h1>
    <p>Version {issued.seq} · {issued.label}</p>
    <p className="text-xs text-gray-400">Issued {new Date(issued.issuedAt).toLocaleString()}{issued.issuedByName ? ` by ${issued.issuedByName}` : ''}</p>
    {issued.note && <p className="text-sm text-gray-400">{issued.note}</p>}
  </div>;
}

export function VersionBanner({ projectId, roomId }) {
  return <div role="status" className="border-b border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-300">
    {readOnlyText('version')}{' '}
    <Link to={`/projects/${projectId}/rooms/${roomId}`} className="text-blue-400 hover:underline">Open the current drawing</Link>
  </div>;
}

export default function VersionPage() {
  const { projectId, roomId, versionId } = useParams();
  const estProjectId = Number(projectId);
  const dispatch = useDispatch();
  const teamId = useSelector((state) => state.auth.teamId);
  const { view } = useSelector(selectDesignPermissions);
  const source = useSelector((state) => state.elevation.source);
  const issuedVersionId = useSelector((state) => state.elevation.cloud?.room?.issued?.versionId);
  const sessionRef = useRef(null);
  const [result, setResult] = useState(null);
  const matchesVersion = source === 'version' && issuedVersionId === versionId;

  useEffect(() => {
    if (!teamId || !view) return;
    const session = { active: true, opening: false, opened: false, estProjectId, roomId, versionId, teamId };
    sessionRef.current = session;
    session.open = async () => {
      if (!session.active || session.opening) return;
      session.opening = true;
      setResult({ session, status: 'opening' });
      await afterLeave();
      if (!session.active) return;
      const reply = await dispatch(openRoomVersion({ estProjectId, roomId, versionId }));
      if (!session.active) return;
      session.opening = false;
      session.opened = reply.ok;
      setResult({ session, status: reply.ok ? 'ready' : reply.reason === 'superseded' ? 'superseded' : 'failed', message: reply.message });
    };
    session.open();
    return () => { session.active = false; };
  }, [dispatch, teamId, view, estProjectId, roomId, versionId]);

  useEffect(() => {
    const session = sessionRef.current;
    if (session?.active && session.opened && !session.opening && !matchesVersion) session.open();
  }, [matchesVersion, result]);

  if (!teamId) return <p className="p-6">You are not on a team.</p>;
  if (!view) return <p className="p-6">You don&apos;t have permission to view designs.</p>;

  const current = result?.session === sessionRef.current && result?.session.estProjectId === estProjectId
    && result?.session.roomId === roomId && result?.session.versionId === versionId && result?.session.teamId === teamId;
  if (current && result.status === 'failed') return <div className="p-6 space-y-4">
    <Link to={`/projects/${projectId}/rooms/${roomId}`} className="text-blue-400 hover:underline">← Room</Link>
    <div role="alert" className="rounded border border-red-700 bg-red-950 p-3 text-red-200">
      {result.message}
      <button type="button" className="ml-3 underline" onClick={() => sessionRef.current.open()}>Retry</button>
    </div>
  </div>;
  if (!current || result.status !== 'ready' || !matchesVersion) return <p role="status" className="p-6">Opening version…</p>;

  return <DesignerEditor mode="room" readOnly header={<VersionHeader projectId={projectId} roomId={roomId} />}
    banners={<VersionBanner projectId={projectId} roomId={roomId} />} />;
}
