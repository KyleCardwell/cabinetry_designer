const MATH_EPSILON = 1e-9;
const DISPLAY_STEP = 1 / 16;

function normalizeResult(value) {
  return Math.round(value * 1e12) / 1e12;
}

/**
 * Parse an inch value expressed as a decimal, fraction, or mixed fraction.
 *
 * @param {string} str
 * @returns {number|null}
 */
export function parseInches(str) {
  if (typeof str !== 'string') return null;

  const input = str.trim().replace(/"$/, '').trim();
  if (!input) return null;

  const mixed = input.match(/^([+-]?\d+)(?:\s+|-)(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const wholeToken = mixed[1];
    const whole = Number(wholeToken);
    const numerator = Number(mixed[2]);
    const denominator = Number(mixed[3]);
    if (denominator === 0 || numerator >= denominator) return null;

    const sign = wholeToken.startsWith('-') ? -1 : 1;
    return sign * (Math.abs(whole) + numerator / denominator);
  }

  const fraction = input.match(/^([+-]?\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    return numerator / denominator;
  }

  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(input)) return null;
  const value = Number(input);
  return Number.isFinite(value) ? value : null;
}

/**
 * Format an inch value to the nearest sixteenth with a trailing inch mark.
 *
 * @param {number} n
 * @returns {string}
 */
export function formatInches(n) {
  if (!Number.isFinite(n)) return '';

  const sixteenths = Math.round((n / DISPLAY_STEP) + MATH_EPSILON);
  if (sixteenths === 0) return '0"';

  const sign = sixteenths < 0 ? '-' : '';
  const absolute = Math.abs(sixteenths);
  const whole = Math.floor(absolute / 16);
  let numerator = absolute % 16;

  if (numerator === 0) return `${sign}${whole}"`;

  let denominator = 16;
  while (numerator % 2 === 0) {
    numerator /= 2;
    denominator /= 2;
  }

  const fraction = `${numerator}/${denominator}`;
  return whole > 0 ? `${sign}${whole} ${fraction}"` : `${sign}${fraction}"`;
}

/**
 * Round a number down to a positive step while tolerating floating-point noise.
 *
 * @param {number} n
 * @param {number} step
 * @returns {number}
 */
export function floorTo(n, step) {
  if (!Number.isFinite(n) || !Number.isFinite(step) || step <= 0) return NaN;
  const quotient = n / step;
  const result = Math.floor(quotient + MATH_EPSILON) * step;
  return normalizeResult(result);
}

/**
 * Round a number to the nearest positive step while tolerating floating-point noise.
 *
 * @param {number} n
 * @param {number} step
 * @returns {number}
 */
export function roundTo(n, step) {
  if (!Number.isFinite(n) || !Number.isFinite(step) || step <= 0) return NaN;
  const quotient = n / step;
  const adjusted = quotient + MATH_EPSILON;
  return normalizeResult(Math.round(adjusted) * step);
}
