import { ACCESSORY_PLACES } from './constants.js';
import { PRICING_UNITS, isLabor, isMoney } from './libraryPricing.js';

const ACCESSORY_KEYS = [
  'id', 'name', 'brand', 'model', 'description', 'reportText', 'attachesTo', 'wholeSection',
  'minOpening', 'ownSlides', 'effects', 'pricing', 'price', 'actualCost', 'labor',
];
const OPENING_KEYS = ['width', 'depth', 'height'];

function hasKeys(value, keys) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Reflect.ownKeys(value).every((key) => keys.includes(key))
    && keys.every((key) => Object.hasOwn(value, key));
}

const isText = (value) => typeof value === 'string' && value === value.trim() && value.length <= 120;

export function isAccessory(accessory) {
  return hasKeys(accessory, ACCESSORY_KEYS)
    && typeof accessory.id === 'string' && accessory.id.length > 0
    && typeof accessory.name === 'string' && accessory.name.length > 0 && accessory.name === accessory.name.trim()
    && ['brand', 'model', 'description', 'reportText'].every((key) => isText(accessory[key]))
    && ACCESSORY_PLACES.includes(accessory.attachesTo)
    && typeof accessory.wholeSection === 'boolean'
    && (accessory.attachesTo === 'section' || !accessory.wholeSection)
    && hasKeys(accessory.minOpening, OPENING_KEYS)
    && OPENING_KEYS.every((key) => accessory.minOpening[key] === null
      || (Number.isFinite(accessory.minOpening[key]) && accessory.minOpening[key] > 0))
    && typeof accessory.ownSlides === 'boolean'
    && Array.isArray(accessory.effects) && accessory.effects.length === 0
    && PRICING_UNITS.includes(accessory.pricing)
    && isMoney(accessory.price) && isMoney(accessory.actualCost)
    && isLabor(accessory.labor);
}

export function isAccessoryList(list) {
  if (!Array.isArray(list)) return false;
  const ids = new Set();
  const names = new Set();
  for (const accessory of list) {
    if (!isAccessory(accessory) || ids.has(accessory.id) || names.has(accessory.name.toLowerCase())) return false;
    ids.add(accessory.id);
    names.add(accessory.name.toLowerCase());
  }
  return true;
}

function unusedName(list, base) {
  const names = new Set(list.map((accessory) => accessory.name.toLowerCase()));
  let name = base;
  let number = 2;
  while (names.has(name.toLowerCase())) {
    name = `${base} ${number}`;
    number += 1;
  }
  return name;
}

export function newAccessory(list, id) {
  return {
    id,
    name: unusedName(list, 'New accessory'),
    brand: '',
    model: '',
    description: '',
    reportText: '',
    attachesTo: 'section',
    wholeSection: false,
    minOpening: { width: null, depth: null, height: null },
    ownSlides: false,
    effects: [],
    pricing: 'unit',
    price: null,
    actualCost: null,
    labor: {},
  };
}

export function copyAccessory(list, base, id) {
  return { ...structuredClone(base), id, name: unusedName(list, `${base.name} copy`) };
}

export function findAccessory(id, list) {
  return list.find((accessory) => accessory.id === id) ?? null;
}

export function accessoryText(accessory) {
  return accessory.reportText || accessory.name;
}
