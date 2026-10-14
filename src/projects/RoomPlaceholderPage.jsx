import { Link, useParams } from 'react-router-dom';

export default function RoomPlaceholderPage() {
  const { projectId } = useParams();
  return <div className="p-6 space-y-4">
    <Link to={`/projects/${projectId}`} className="text-blue-400 hover:underline">← Project</Link>
    <p>Opening rooms from the shop data comes in the next rounds. Until then, draw in the Elevation Lab.</p>
    <Link to="/elevation-lab" className="text-blue-400 hover:underline">Elevation Lab</Link>
  </div>;
}
