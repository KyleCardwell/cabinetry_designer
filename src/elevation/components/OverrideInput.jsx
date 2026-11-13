import { formatInches, formatInchesInput } from '../model/units.js';
import InchInput from './InchInput.jsx';
import TextInput from './TextInput.jsx';
import OverrideField from './OverrideField.jsx';

const BOOL_CHOICES = [{ value: true, label: 'On' }, { value: false, label: 'Off' }];

export default function OverrideInput({
  kind,
  label,
  value,
  inherited,
  source,
  level,
  onChange,
  choices = [],
  displayStep,
  readOnly,
  note,
  'aria-label': ariaLabel = label,
}) {
  const overridden = value !== null && value !== undefined && value !== '';
  const options = kind === 'bool' ? BOOL_CHOICES : choices;
  const inheritedText = kind === 'number'
    ? formatInches(inherited, displayStep)
    : options.find((choice) => choice.value === inherited)?.label ?? String(inherited);

  return (
    <OverrideField
      label={label}
      overridden={overridden}
      level={level}
      inheritedSource={source}
      inheritedText={inheritedText}
      onReset={readOnly ? undefined : () => onChange(null)}
      note={note}
    >
      {(borderClass) => kind === 'number' ? (
        <InchInput
          aria-label={ariaLabel}
          allowBlank
          value={overridden ? value : null}
          placeholder={formatInchesInput(inherited, displayStep)}
          displayStep={displayStep}
          onCommit={onChange}
          borderClass={borderClass}
          readOnly={readOnly}
        />
      ) : kind === 'text' ? (
        <TextInput
          aria-label={ariaLabel}
          value={overridden ? value : null}
          placeholder={inherited ?? ''}
          onCommit={(text) => onChange(text || null)}
          borderClass={borderClass}
          readOnly={readOnly}
        />
      ) : (
        <select
          aria-label={ariaLabel}
          value={overridden ? String(value) : ''}
          disabled={readOnly}
          onChange={(event) => onChange(event.target.value === ''
            ? null : options.find((choice) => String(choice.value) === event.target.value).value)}
          className={`w-full px-2.5 py-1.5 bg-gray-900 border ${borderClass} rounded text-sm text-gray-100 focus:outline-none focus:border-blue-500`}
        >
          <option value="">{`Inherit (${inheritedText})`}</option>
          {options.map((choice) => <option key={String(choice.value)} value={String(choice.value)}>{choice.label}</option>)}
        </select>
      )}
    </OverrideField>
  );
}
