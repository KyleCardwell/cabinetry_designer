import { pickOptions } from '../../model/doorStyleEdits.js';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const PICKS = [
  { text: 'Doors', partType: 'door', key: 'doorStyleId' },
  { text: 'Drawer fronts', partType: 'drawer_front', key: 'drawerFrontStyleId' },
  { text: 'Panels', partType: 'panel', key: 'panelStyleId' },
];

export default function DoorStylePicks({ room, settings, levelsAbove, node, label, onChange, always = false }) {
  if (!always && !room.doorStyles?.length) return null;

  return (
    <div className="space-y-2">
      {PICKS.map(({ text, partType, key }) => {
        const { inherit, options } = pickOptions(room, settings, partType, levelsAbove, node ?? {});
        const value = node?.[key] ?? '';
        const missing = value !== '' && !options.some((option) => option.id === value);

        return (
          <label key={key} className="block text-xs text-gray-400">
            {text}
            <select
              value={value}
              onChange={(event) => onChange(key, event.target.value || null)}
              aria-label={`${label} ${text.toLowerCase()} style`}
              className={`mt-1 ${SELECT_CLASS}`}
            >
              <option value="">{inherit.text}</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>{option.text}</option>
              ))}
              {missing && <option value={value}>Missing ({value})</option>}
            </select>
          </label>
        );
      })}
    </div>
  );
}
