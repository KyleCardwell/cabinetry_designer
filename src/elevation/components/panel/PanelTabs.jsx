import usePanelState from './usePanelState.js';

export default function PanelTabs({ id, tabs, children }) {
  const [remembered, setTab] = usePanelState(`tab.${id}`, tabs[0]?.id);
  const active = tabs.some((tab) => tab.id === remembered) ? remembered : tabs[0]?.id;

  return (
    <div>
      <div role="tablist" className="flex gap-1 rounded bg-gray-900 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => setTab(tab.id)}
            className={`min-w-0 flex-1 rounded px-2 py-1 text-xs font-medium ${active === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            {tab.label}
            {tab.badge > 0 && <span className="ml-1">{tab.badge}</span>}
          </button>
        ))}
      </div>
      {active !== undefined && children(active)}
    </div>
  );
}
