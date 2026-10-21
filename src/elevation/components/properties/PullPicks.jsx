import { pullPickOptions } from '../../model/pulls.js';
import { formatInches } from '../../model/units.js';
import InchInput from '../InchInput.jsx';
import PanelSection from '../panel/PanelSection.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const PICKS = [
  { text: 'Door pull', partType: 'door', key: 'doorPullId' },
  { text: 'Drawer pull', partType: 'drawer', key: 'drawerPullId' },
];

export default function PullPicks({ settings, levelsAbove, node, label, onChange, pullHeight, onPullHeightChange, sectionId }) {
  const content = (
    <div className="space-y-2">
      {PICKS.map(({ text, partType, key }) => {
        const { inherit, options } = pullPickOptions(settings, partType, levelsAbove, node, key);
        return (
          <label key={key} className="block text-xs text-gray-400">
            {text}
            <select
              value={node?.[key] ?? ''}
              onChange={(event) => onChange(key, event.target.value || null)}
              aria-label={`${label} ${text.toLowerCase()}`}
              className={`mt-1 ${SELECT_CLASS}`}
            >
              <option value="">{inherit.text}</option>
              {options.map((option) => <option key={option.id} value={option.id}>{option.text}</option>)}
            </select>
          </label>
        );
      })}
      {pullHeight !== undefined && (
        <label className="block text-xs text-gray-400">
          Tall pull height
          <InchInput
            value={pullHeight}
            allowBlank
            placeholder={`Inherit (${formatInches(settings?.pullHeight ?? 45)})`}
            aria-label="Tall pull height"
            className="mt-1"
            onCommit={(value) => {
              if (value !== null && (!Number.isFinite(value) || value <= 0)) return false;
              onPullHeightChange(value);
              return true;
            }}
          />
        </label>
      )}
    </div>
  );
  return sectionId ? (
    <PanelSection id={sectionId} title="Pulls">{content}</PanelSection>
  ) : (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Pulls</h3>
      {content}
    </section>
  );
}
