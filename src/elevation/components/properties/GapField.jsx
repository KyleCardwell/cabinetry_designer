import InchInput from '../InchInput.jsx';
import { autoInchProps } from '../autoInchProps.js';
import Field from './Field.jsx';

/** A gap after a track or at a run's seams (SPEC-36). Blank clears it back to `fallback`. */
export default function GapField({ label, value, fallback = 0, onCommit, ariaLabel }) {
  return (
    <Field label={label}>
      <InchInput
        value={value ?? null}
        {...autoInchProps({ auto: fallback, min: 'nonNegative', onCommit: (gap) => {
          onCommit(gap);
          return true;
        } })}
        aria-label={ariaLabel}
      />
    </Field>
  );
}
