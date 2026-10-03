import { formatInchesInput } from '../../model/index.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';

/** A gap after a track or at a run's seams (SPEC-36). Blank clears it back to `fallback`. */
export default function GapField({ label, value, fallback = 0, onCommit, ariaLabel }) {
  return (
    <Field label={label}>
      <InchInput
        value={value ?? null}
        allowBlank
        placeholder={formatInchesInput(fallback)}
        onCommit={(gap) => {
          if (gap !== null && !(gap >= 0)) return false;
          onCommit(gap);
          return true;
        }}
        aria-label={ariaLabel}
      />
    </Field>
  );
}
