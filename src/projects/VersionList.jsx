import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import { loadRoomVersions } from '../elevation/store/cloudThunks.js';

export default function VersionList({ projectId, roomId, currentVersionId }) {
  const dispatch = useDispatch();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const reply = await dispatch(loadRoomVersions(roomId));
      if (active) setResult({ roomId, attempt, reply });
    }
    load();
    return () => { active = false; };
  }, [dispatch, roomId, attempt]);

  const reply = result?.roomId === roomId && result?.attempt === attempt ? result.reply : null;
  if (!reply) return <p role="status">Loading versions…</p>;
  if (!reply.ok) return <div role="alert" className="text-red-300">
    {reply.message}
    <button type="button" className="ml-3 underline" onClick={() => setAttempt((value) => value + 1)}>Retry</button>
  </div>;
  if (!reply.versions.length) return <p>No versions issued yet.</p>;

  return <ul className="space-y-3">
    {reply.versions.map((version) => <li key={version.versionId} className={version.versionId === currentVersionId ? 'font-semibold' : undefined}>
      {version.versionId === currentVersionId
        ? <strong>v{version.seq} · {version.label}</strong>
        : <Link to={`/projects/${projectId}/rooms/${roomId}/versions/${version.versionId}`} className="text-blue-400 hover:underline">v{version.seq} · {version.label}</Link>}
      <p className="text-xs text-gray-400">{version.issuedByName || 'Someone'} · {new Date(version.issuedAt).toLocaleDateString()}</p>
      {version.note && <p className="text-sm text-gray-400">{version.note}</p>}
    </li>)}
  </ul>;
}
