import { formatInch } from './format.js';

export const TYPE_LABELS = { 1: 'Base', 2: 'Upper', 3: 'Tall' };
export const EPSILON = 1e-6;

/** Thick door panels are ordered at their style thickness, with a separate nosing note. */
export function orderedThickness(drawn, style) {
  return style && style.id !== 'sheet' && drawn > style.thickness + EPSILON ? style.thickness : drawn;
}

export function nosingNote(drawn, style) {
  return style && style.id !== 'sheet' && drawn > style.thickness + EPSILON
    ? `add ${formatInch(drawn - style.thickness)} square nosing, mitered (${formatInch(drawn)} thick)` : null;
}
