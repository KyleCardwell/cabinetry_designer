import { useDispatch, useSelector } from 'react-redux';
import { updateObject, updateObjectParams } from '../../store/slices/objectSlice';
import { updateWall } from '../../store/slices/wallSlice';

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
    return (
      <div className="w-64 bg-gray-800 border-l border-gray-700 p-4 shrink-0 overflow-y-auto">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Wall</h3>
        <div className="space-y-2">
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
        </div>
      </div>
    );
  }

  // Object properties
  const obj = objects[selectedIds[0]];
  if (!obj) return null;

  return (
    <div className="w-64 bg-gray-800 border-l border-gray-700 p-4 shrink-0 overflow-y-auto">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
        {obj.object_type?.replace(/_/g, ' ')}
      </h3>
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
