import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchProjects, createProject } from '../../store/slices/projectSlice';

export default function ProjectList() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { list, loading } = useSelector((state) => state.projects);
  const { teamId } = useSelector((state) => state.auth);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    if (teamId) dispatch(fetchProjects());
  }, [dispatch, teamId]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    await dispatch(createProject({ team_id: teamId, name: name.trim() }));
    setName('');
    setShowNew(false);
  };

  if (loading) {
    return <div className="p-8 text-gray-400">Loading projects...</div>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Projects</h2>
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors"
        >
          New Project
        </button>
      </div>

      {showNew && (
        <div className="flex gap-2 mb-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button onClick={handleCreate} className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-sm">
            Create
          </button>
          <button onClick={() => setShowNew(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">
            Cancel
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <p className="text-gray-500">No projects yet. Create one to get started.</p>
      ) : (
        <div className="space-y-2">
          {list.map((project) => (
            <div
              key={project.project_id}
              className="flex items-center justify-between p-4 bg-gray-800 rounded-lg hover:bg-gray-750 cursor-pointer transition-colors"
              onClick={() => navigate(`/projects/${project.project_id}/rooms/${project.rooms?.[0]?.room_id || 'new'}`)}
            >
              <div>
                <div className="font-medium">{project.name}</div>
                {project.client_name && (
                  <div className="text-sm text-gray-400">{project.client_name}</div>
                )}
              </div>
              <div className="text-sm text-gray-500">
                {project.rooms?.length ?? 0} room{project.rooms?.length !== 1 ? 's' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
