import { FRAME_RETURN_WIDTH } from '../../model/index.js';
import PanelSection from '../panel/PanelSection.jsx';
import OverrideInput from '../OverrideInput.jsx';
import { controlBorder } from '../overrideHelpers.js';
import Field from './Field.jsx';

// Keep this renderer hook-free: the wrappers return its markup directly.
export default function SideEndsSection({
  id, title, ariaName, ends, sides, defaultEnd, returnOption, onCommit,
}) {
  if (!sides.length) return null;
  const panelDefault = defaultEnd === 'panel';
  return (
    <PanelSection id={id} title={title}>
      <div className="space-y-2">
        {sides.map((side) => {
          const stored = ends?.[side];
          const value = stored === 'none' ? 'none' : panelDefault
            ? (returnOption && stored?.type === 'return' ? 'return' : '')
            : (stored?.type === 'panel' ? 'panel' : '');
          const set = panelDefault ? value !== '' : stored !== undefined;
          const label = side === 'left' ? 'Left' : 'Right';
          return (
            <div key={side} className="grid grid-cols-2 gap-2">
              <Field label={label}>
                <select
                  aria-label={`${label} ${ariaName}`}
                  value={value}
                  onChange={(event) => onCommit(side, event.target.value === (panelDefault ? 'return' : 'panel')
                    ? { type: event.target.value } : event.target.value || null)}
                  className={`w-full rounded border ${controlBorder(set)} bg-gray-900 px-2.5 py-1.5 text-sm ${set ? 'text-gray-100' : 'text-gray-500'} focus:border-blue-500 focus:outline-none`}
                >
                  <option value="">{panelDefault ? 'End panel' : 'Return'}</option>
                  {panelDefault
                    ? returnOption && <option value="return">Frame return</option>
                    : <option value="panel">Panel</option>}
                  <option value="none">None</option>
                </select>
              </Field>
              {(panelDefault ? value === 'return' : value === '') && (
                <OverrideInput
                  kind="number"
                  label="Return width"
                  aria-label={`${label} ${ariaName} return width`}
                  value={stored?.width ?? null}
                  inherited={FRAME_RETURN_WIDTH}
                  source="default"
                  onChange={(width) => {
                    if (width !== null && !(Number.isFinite(width) && width > 0)) return false;
                    onCommit(side, panelDefault
                      ? { type: 'return', ...(width === null ? {} : { width }) }
                      : width === null ? null : { type: 'return', width });
                    return true;
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </PanelSection>
  );
}
