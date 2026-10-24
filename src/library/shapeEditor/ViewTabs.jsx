export const SHAPE_VIEWS = {
  front: { label: 'Front', axes: 'x → , z ↑', boxKeys: ['x', 'z', 'w', 'h'] },
  plan: { label: 'Plan', axes: 'x → , y ↑ (back)', boxKeys: ['x', 'y', 'w', 'd'] },
  side: { label: 'Side', axes: 'y → (back), z ↑', boxKeys: ['y', 'z', 'd', 'h'] },
};

export default function ViewTabs({ view, onChange }) {
  return (
    <div role="tablist" aria-label="Shape views" className="flex border-b border-gray-700 bg-gray-800">
      {Object.entries(SHAPE_VIEWS).map(([key, { label, axes }]) => (
        <button key={key} id={`shape-tab-${key}`} type="button" role="tab" aria-selected={view === key}
          aria-controls="shape-view-panel" onClick={() => onChange(key)}
          className={`px-4 py-2 text-sm ${view === key ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>
          {label} <span className="ml-2 text-xs">{axes}</span>
        </button>
      ))}
    </div>
  );
}
