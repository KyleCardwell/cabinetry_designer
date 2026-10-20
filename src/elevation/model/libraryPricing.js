export const PRICING_UNITS = ['unit', 'area', 'length', 'perimeter', 'volume'];
export const PRICING_UNIT_LABELS = {
  unit: 'each', area: 'sq ft', length: 'ft', perimeter: 'ft of perimeter', volume: 'cu ft',
};

export function isMoney(value) {
  return value === null || (Number.isFinite(value) && value >= 0);
}

export function isLabor(labor) {
  if (labor === null || typeof labor !== 'object') return false;
  const prototype = Object.getPrototypeOf(labor);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(labor);
  return keys.length <= 20 && keys.every((key) => typeof key === 'string'
    && /^[1-9]\d*$/.test(key) && Number.isFinite(labor[key]) && labor[key] >= 0);
}

export function formatPrice(price, unitLabel) {
  if (price === null) return '—';
  const amount = `$${price.toFixed(2)}`;
  if (unitLabel === 'each') return `${amount} each`;
  if (unitLabel === 'pair') return `${amount} a pair`;
  return `${amount} / ${unitLabel}`;
}
