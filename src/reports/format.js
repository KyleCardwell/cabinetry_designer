import { formatInches } from '../elevation/model/units.js';

/** Report dimensions retain every thirty-second of an inch. */
export function formatInch(n) {
  return formatInches(n, 1 / 32);
}

export function formatSize(...values) {
  return values.map((value) => formatInch(value).replace(/"$/, '')).join(' x ');
}
