import { useDispatch, useSelector } from 'react-redux';
import { updateObject, updateObjectParams, removeObject } from '../../store/slices/objectSlice';
import { updateWall, setWallLock, removeWall } from '../../store/slices/wallSlice';
import { removeObjectsByWall } from '../../store/slices/objectSlice';
import { clearSelection } from '../../store/slices/canvasSlice';

const DIMENSION_FIELDS = ['width', 'height', 'depth'];
const PARAM_FIELDS = [
  { key: 'door_count', label: 'Doors', type: 'number' },
  { key: 'drawer_count', label: 'Drawers', type: 'number' },
  { key: 'shelf_count', label: 'Shelves', type: 'number' },
  { key: 'door_overlay', label: 'Door Overlay', type: 'number', step: 0.0625 },
  { key: 'reveal_gap', label: 'Reveal Gap', type: 'number', step: 0.0625 },
  { key: 'hinge_side', label: 'Hinge Side', type: 'select', options: ['left', 'right'] },
  { key: 'material_thickness', label: 'Material', type: 'number', step: 0.25 },
  { key: 'toe_kick_height', label: 'Toe Kick H', type: 'number' },
];

export default function PropertyPanel() {
  const dispatch = useDispatch();
  const { selectedIds, selectionType } = useSelector((state) => state.canvas);
  const objects = useSelector((state) => state.objects.byId);
  const walls = useSelector((state) => state.walls.byId);

  if (selectedIds.length === 0) {
    return (
      <div className="w-64 bg-gray-800 border-l border-gray-700 p-4 shrink-0">
        <p className="text-sm text-gray-500">Select a wall or object to edit properties.</p>
      </div>
    );
  }

  // Wall properties
  if (selectionType === 'wall') {
    const wall = walls[selectedIds[0]];
    if (!wall) return null;

    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const wallLength = Math.round(Math.hypot(dx, dy) * 1000) / 1000;
    const wallAngle = Math.round(Math.atan2(dy, dx) * (180 / Math.PI) * 100) / 100;
    const locks = wall.locks ?? { length: false, angle: false, soffitHeight: false };

    const handleDeleteWall = () => {
      dispatch(removeObjectsByWall(wall.wall_id));
      dispatch(removeWall(wall.wall_id));
      dispatch(clearSelection());
    };

    const handleLengthChange = (newLength) => {
      if (newLength == null || newLength <= 0) return;
      const currentLen = Math.hypot(dx, dy);
      if (currentLen === 0) return;
      const ratio = newLength / currentLen;
      dispatch(updateWall({
        wall_id: wall.wall_id,
        x2: wall.x1 + dx * ratio,
        y2: wall.y1 + dy * ratio,
      }));
    };

    const handleAngleChange = (newAngleDeg) => {
      if (newAngleDeg == null) return;
      const len = Math.hypot(dx, dy);
      if (len === 0) return;
      const rad = (newAngleDeg * Math.PI) / 180;
      dispatch(updateWall({
        wall_id: wall.wall_id,
        x2: wall.x1 + len * Math.cos(rad),
        y2: wall.y1 + len * Math.sin(rad),
      }));
    };

    return (
      <div className="w-64 bg-gray-800 border-l border-gray-700 p-4 shrink-0 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Wall</h3>
          <button
            onClick={handleDeleteWall}
            className="px-2 py-0.5 rounded text-xs font-medium bg-red-800 hover:bg-red-700 text-red-200 transition-colors"
          >
            Delete
          </button>
        </div>
        <div className="space-y-2">
          <LockableField
            label="Length"
            value={wallLength}
            locked={locks.length}
            onToggleLock={() => dispatch(setWallLock({ wall_id: wall.wall_id, lockKey: 'length', value: !locks.length }))}
            onChange={handleLengthChange}
            step={0.25}
          />
          <LockableField
            label="Angle"
            value={wallAngle}
            locked={locks.angle}
            onToggleLock={() => dispatch(setWallLock({ wall_id: wall.wall_id, lockKey: 'angle', value: !locks.angle }))}
            onChange={handleAngleChange}
            step={1}
          />
          <Field
            label="Thickness"
            value={wall.thickness}
            onChange={(v) => dispatch(updateWall({ wall_id: wall.wall_id, thickness: v }))}
          />
          <Field
            label="Height"
            value={wall.height ?? ''}
            placeholder="Room default"
            onChange={(v) => dispatch(updateWall({ wall_id: wall.wall_id, height: v || null }))}
          />
          <LockableField
            label="Soffit H"
            value={wall.soffit_height ?? ''}
            placeholder="None"
            locked={locks.soffitHeight}
            onToggleLock={() => dispatch(setWallLock({ wall_id: wall.wall_id, lockKey: 'soffitHeight', value: !locks.soffitHeight }))}
            onChange={(v) => dispatch(updateWall({ wall_id: wall.wall_id, soffit_height: v || null }))}
          />
        </div>
      </div>
    );
  }

  // Object properties
  const obj = objects[selectedIds[0]];
  if (!obj) return null;

  const handleDeleteObject = () => {
    dispatch(removeObject(obj.object_id));
    dispatch(clearSelection());
  };

  return (
    <div className="w-64 bg-gray-800 border-l border-gray-700 p-4 shrink-0 overflow-y-auto">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {obj.object_type?.replace(/_/g, ' ')}
        </h3>
        <button
          onClick={handleDeleteObject}
          className="px-2 py-0.5 rounded text-xs font-medium bg-red-800 hover:bg-red-700 text-red-200 transition-colors"
        >
          Delete
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-3">{obj.object_id.slice(0, 8)}</p>

      {/* Dimensions */}
      <div className="space-y-2 mb-4">
        {DIMENSION_FIELDS.map((key) => (
          <Field
            key={key}
            label={key.charAt(0).toUpperCase() + key.slice(1)}
            value={obj[key] ?? ''}
            placeholder="Inherited"
            onChange={(v) => dispatch(updateObject({ object_id: obj.object_id, [key]: v || null }))}
          />
        ))}
      </div>

      {/* Position */}
      <div className="space-y-2 mb-4">
        <Field label="X" value={obj.x} onChange={(v) => dispatch(updateObject({ object_id: obj.object_id, x: v }))} />
        <Field label="Y" value={obj.y} onChange={(v) => dispatch(updateObject({ object_id: obj.object_id, y: v }))} />
        <Field label="Rotation" value={obj.rotation} onChange={(v) => dispatch(updateObject({ object_id: obj.object_id, rotation: v }))} />
      </div>

      {/* Params */}
      <div className="space-y-2">
        {PARAM_FIELDS.map((field) => {
          const value = obj.params?.[field.key];
          if (field.type === 'select') {
            return (
              <div key={field.key} className="flex items-center gap-2">
                <label className="text-xs text-gray-400 w-20 shrink-0">{field.label}</label>
                <select
                  value={value ?? ''}
                  onChange={(e) => dispatch(updateObjectParams({ object_id: obj.object_id, key: field.key, value: e.target.value || null }))}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200"
                >
                  <option value="">—</option>
                  {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            );
          }
          return (
            <Field
              key={field.key}
              label={field.label}
              value={value ?? ''}
              placeholder="Inherited"
              step={field.step}
              onChange={(v) => dispatch(updateObjectParams({ object_id: obj.object_id, key: field.key, value: v }))}
            />
          );
        })}
      </div>
    </div>
  );
}

function Field({ label, value, placeholder, step, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-400 w-20 shrink-0">{label}</label>
      <input
        type="number"
        value={value}
        placeholder={placeholder}
        step={step ?? 1}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 w-0"
      />
    </div>
  );
}

function LockableField({ label, value, placeholder, step, locked, onToggleLock, onChange }) {
  return (
    <div className="flex items-center gap-1">
      <label className="text-xs text-gray-400 w-20 shrink-0">{label}</label>
      <input
        type="number"
        value={value}
        placeholder={placeholder}
        step={step ?? 1}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 w-0"
      />
      <button
        onClick={onToggleLock}
        title={locked ? 'Unlock (allow drag to change)' : 'Lock (prevent drag from changing)'}
        className={`px-1.5 py-1 rounded text-xs font-bold transition-colors shrink-0 ${
          locked
            ? 'bg-yellow-700 text-yellow-200'
            : 'bg-gray-700 text-gray-500 hover:text-gray-300'
        }`}
      >
        {locked ? '🔒' : '🔓'}
      </button>
    </div>
  );
}
