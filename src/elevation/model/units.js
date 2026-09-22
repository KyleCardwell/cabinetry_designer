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

  const mixedPattern = /(\d+)\s+(\d+)\s*\/\s*(\d+)/y;
  const decimalPattern = /\d+(?:\.\d*)?|\.\d+/y;
  let position = 0;
  let invalid = false;

  const skipWhitespace = () => {
    while (/\s/.test(str[position] ?? '')) position += 1;
  };

  const parseNumber = () => {
    skipWhitespace();
    mixedPattern.lastIndex = position;
    const mixed = mixedPattern.exec(str);
    if (mixed) {
      position = mixedPattern.lastIndex;
      const numerator = Number(mixed[2]);
      const denominator = Number(mixed[3]);
      if (denominator === 0 || numerator >= denominator) {
        invalid = true;
        return null;
      }
      return Number(mixed[1]) + numerator / denominator;
    }

    decimalPattern.lastIndex = position;
    const decimal = decimalPattern.exec(str);
    if (!decimal) return null;
    position = decimalPattern.lastIndex;
    return Number(decimal[0]);
  };

  const parseMeasure = () => {
    const value = parseNumber();
    if (value === null) return null;

    skipWhitespace();
    if (str[position] === '"') {
      position += 1;
      return value;
    }
    if (str[position] !== "'") return value;

    position += 1;
    const compoundStart = position;
    const inches = parseNumber();
    if (inches === null) {
      if (invalid) return null;
      position = compoundStart;
      return value * 12;
    }

    skipWhitespace();
    if (str[position] === "'") {
      position = compoundStart;
      return value * 12;
    }
    if (str[position] === '"') position += 1;
    return value * 12 + inches;
  };

  const parseFactor = () => {
    skipWhitespace();
    if (str[position] === '+' || str[position] === '-') {
      const sign = str[position] === '-' ? -1 : 1;
      position += 1;
      const value = parseFactor();
      return value === null ? null : sign * value;
    }
    if (str[position] === '(') {
      position += 1;
      const value = parseExpr();
      skipWhitespace();
      if (value === null || str[position] !== ')') return null;
      position += 1;
      return value;
    }
    return parseMeasure();
  };

  const parseTerm = () => {
    let value = parseFactor();
    if (value === null) return null;
    while (true) {
      skipWhitespace();
      const operator = str[position];
      if (operator !== '*' && operator !== '/') return value;
      position += 1;
      const right = parseFactor();
      if (right === null) return null;
      value = operator === '*' ? value * right : value / right;
    }
  };

  function parseExpr() {
    let value = parseTerm();
    if (value === null) return null;
    while (true) {
      skipWhitespace();
      const operator = str[position];
      if (operator !== '+' && operator !== '-') return value;
      position += 1;
      const right = parseTerm();
      if (right === null) return null;
      value = operator === '+' ? value + right : value - right;
    }
  }

  const value = parseExpr();
  skipWhitespace();
  if (invalid || value === null || position !== str.length || !Number.isFinite(value)) return null;
  return normalizeResult(value);
}

/**
 * Format an inch value to the nearest sixteenth with a trailing inch mark.
 *
 * @param {number} n
 * @returns {string}
 */
export function formatInches(n, step = DISPLAY_STEP) {
  if (!Number.isFinite(n)) return '';

  const perInch = Math.round(1 / step);
  const units = Math.round((n * perInch) + MATH_EPSILON);
  if (units === 0) return '0"';

  const sign = units < 0 ? '-' : '';
  const absolute = Math.abs(units);
  const whole = Math.floor(absolute / perInch);
  let numerator = absolute % perInch;

  if (numerator === 0) return `${sign}${whole}"`;

  let denominator = perInch;
  while (numerator % 2 === 0) {
    numerator /= 2;
    denominator /= 2;
  }

  const fraction = `${numerator}/${denominator}`;
  return whole > 0 ? `${sign}${whole} ${fraction}"` : `${sign}${fraction}"`;
}

/**
 * Format an inch value for an input, retaining fractions without the inch mark.
 *
 * @param {number} n
 * @returns {string}
 */
export function formatInchesInput(n, step) {
  return formatInches(n, step).replace(/"$/, '');
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
