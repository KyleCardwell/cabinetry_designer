import { CABINET_STYLE_IDS, CABINET_STYLE_LABELS, formatInches } from '../../model/index.js';
import InchInput from '../InchInput.jsx';
import OverrideField from '../OverrideField.jsx';

const SELECT_CLASS = 'w-full rounded border bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

/**
 * Style / bead / edge controls for one level (room, run or cabinet).
 * `value` is that level's stored partial style (or undefined); `inherited` is the resolved
 * style of the level above. onChange receives the next partial; blank / "Inherit" removes a key.
 */
export default function StyleFields({
  label, value, inherited, onChange, inheritedFrom = 'Shop standard', level = 'Room',
}) {
  const own = value ?? {};
  const effectiveId = own.cabinetStyleId ?? inherited.cabinetStyleId;
  const change = (key, next) => onChange({ ...own, [key]: next });
  const edgeValue = own.profiledEdge === undefined || own.profiledEdge === null
    ? ''
    : String(own.profiledEdge);

  return (
    <div className="space-y-2">
      <OverrideField
        label={label}
        overridden={own.cabinetStyleId != null}
        level={level}
        inheritedSource={inheritedFrom}
        inheritedText={CABINET_STYLE_LABELS[inherited.cabinetStyleId]}
        onReset={() => change('cabinetStyleId', null)}
      >
        {(borderClass) => <select
          value={own.cabinetStyleId ?? ''}
          onChange={(event) => change(
            'cabinetStyleId',
            event.target.value === '' ? null : Number(event.target.value),
          )}
          aria-label={`${label} style`}
          className={`${SELECT_CLASS} ${borderClass}`}
        >
          <option value="">Inherit ({CABINET_STYLE_LABELS[inherited.cabinetStyleId]})</option>
          {Object.values(CABINET_STYLE_IDS).map((id) => (
            <option key={id} value={id}>{CABINET_STYLE_LABELS[id]}</option>
          ))}
        </select>}
      </OverrideField>

      {effectiveId === CABINET_STYLE_IDS.BEADED_INSET && (
        <OverrideField
          label="Bead width"
          overridden={own.beadWidth != null}
          level={level}
          inheritedSource={inheritedFrom}
          inheritedText={formatInches(inherited.beadWidth, 1 / 32)}
          onReset={() => change('beadWidth', null)}
        >
          {(borderClass) => <InchInput
            value={own.beadWidth ?? null}
            allowBlank
            displayStep={1 / 32}
            placeholder={formatInches(inherited.beadWidth, 1 / 32)}
            onCommit={(next) => {
              if (next !== null && next < 0) return false;
              change('beadWidth', next);
              return true;
            }}
            aria-label={`${label} bead width`}
            borderClass={borderClass}
          />}
        </OverrideField>
      )}

      <OverrideField
        label="Outside edge"
        overridden={own.profiledEdge != null}
        level={level}
        inheritedSource={inheritedFrom}
        inheritedText={inherited.profiledEdge ? 'Profiled' : 'Square'}
        onReset={() => change('profiledEdge', null)}
      >
        {(borderClass) => <select
          value={edgeValue}
          onChange={(event) => change(
            'profiledEdge',
            event.target.value === '' ? null : event.target.value === 'true',
          )}
          aria-label={`${label} outside edge`}
          className={`${SELECT_CLASS} ${borderClass}`}
        >
          <option value="">Inherit ({inherited.profiledEdge ? 'Profiled' : 'Square'})</option>
          <option value="false">Square</option>
          <option value="true">Profiled / molded</option>
        </select>}
      </OverrideField>
    </div>
  );
}
