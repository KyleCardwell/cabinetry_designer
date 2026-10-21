import usePanelState from './usePanelState.js';

export default function PanelSection({ id, title, badge, defaultOpen = true, actions, level = 1, children, ...props }) {
  const [open, setOpen] = usePanelState(id, defaultOpen);
  const badgeText = typeof badge === 'number' ? badge > 0 ? `${badge} overridden` : null : badge;

  return (
    <section {...props} className={level === 2 ? undefined : 'border-t border-gray-700 pt-4'}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className={`flex min-w-0 flex-1 items-center gap-2 font-semibold text-gray-400 ${level === 2 ? 'text-[11px]' : 'text-xs'}`}
        >
          <span aria-hidden="true">{open ? '▾' : '▸'}</span>
          <span className="uppercase tracking-wide">{title}</span>
          {badgeText != null && <span className="text-teal-400">{badgeText}</span>}
        </button>
        {actions}
      </div>
      {open && <div className="mt-2">{children}</div>}
    </section>
  );
}
