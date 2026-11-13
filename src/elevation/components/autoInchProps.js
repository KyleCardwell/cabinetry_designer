import { formatInches, formatInchesInput } from '../model/units.js';

/** Shared props for an inch field whose blank value uses an automatic dimension. */
export function autoInchProps({ auto, text, quoted = false, labelled = false, note = '', step, min, onCommit }) {
  const core = text ?? (Number.isFinite(auto)
    ? (quoted ? formatInches : formatInchesInput)(auto, step) : undefined);
  return {
    allowBlank: true,
    allowAuto: true,
    placeholder: core === undefined ? undefined : labelled ? `Auto (${core}${note})` : core,
    ...(step === undefined ? {} : { displayStep: step }),
    onCommit: min ? (value) => {
      if (typeof value === 'number'
        && (min === 'positive' ? !(value > 0) : !(value >= 0))) return false;
      return onCommit(value);
    } : onCommit,
  };
}
