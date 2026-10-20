import { formatInches } from './units.js';

export const ACCESSORY_EFFECT_KINDS = [
  'clear_behind', 'max_depth', 'max_height', 'fixed_height', 'slide', 'probox_note',
];

function hasKeys(value, keys) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Reflect.ownKeys(value).every((key) => keys.includes(key))
    && keys.every((key) => Object.hasOwn(value, key));
}

const isText = (value) => typeof value === 'string' && value === value.trim()
  && value.length > 0 && value.length <= 120;

export function isAccessoryEffect(effect) {
  if (!effect || !ACCESSORY_EFFECT_KINDS.includes(effect.kind)) return false;
  const key = effect.kind === 'slide' ? 'slideId' : effect.kind === 'probox_note' ? 'text' : 'inches';
  return hasKeys(effect, ['kind', key])
    && (key === 'slideId' ? typeof effect.slideId === 'string' && effect.slideId.length > 0
      : key === 'text' ? isText(effect.text)
        : Number.isFinite(effect.inches) && effect.inches > 0);
}

/** Effects belong only to drawer-box accessories, with one entry per compatible kind. */
export function isEffectList(effects, attachesTo) {
  if (!['section', 'drawer_box'].includes(attachesTo) || !Array.isArray(effects)
    || effects.length > 5 || (attachesTo === 'section' && effects.length)) return false;
  if (!Array.from(effects).every(isAccessoryEffect)) return false;
  const kinds = new Set(effects.map((effect) => effect.kind));
  return kinds.size === effects.length && !(kinds.has('max_height') && kinds.has('fixed_height'));
}

export function effectText(effect, slides = []) {
  if (!isAccessoryEffect(effect)) return '';
  switch (effect.kind) {
    case 'clear_behind': return `${formatInches(effect.inches)} clear behind`;
    case 'max_depth': return `max ${formatInches(effect.inches)} deep`;
    case 'max_height': return `max ${formatInches(effect.inches)} tall`;
    case 'fixed_height': return `${formatInches(effect.inches)} tall box`;
    case 'slide': return slides.find((slide) => slide.id === effect.slideId)?.name ?? 'Missing slide';
    case 'probox_note': return `ProBox: ${effect.text}`;
    default: return '';
  }
}

export function findEffect(accessory, kind) {
  return accessory?.effects?.find((effect) => effect.kind === kind) ?? null;
}

/** Resolve box items in stored order; quantities never multiply sizing effects. */
export function boxAccessoryEffects(items = [], accessoryList = []) {
  const result = { items: [], slide: null, fixedHeight: null, maxHeight: null, depthLimits: [], notes: [] };
  result.items = items.map(({ accessoryId, qty = 1 }, index) => {
    const accessory = accessoryList.find((entry) => entry.id === accessoryId) ?? null;
    const warnings = [];
    if (!accessory) warnings.push({ code: 'accessory-missing' });
    else if (accessory.attachesTo !== 'drawer_box') {
      warnings.push({ code: 'accessory-wrong-place', name: accessory.name });
    } else {
      const effect = (kind) => {
        const value = findEffect(accessory, kind);
        return value ? { ...value, index, accessoryId } : null;
      };
      result.slide ??= effect('slide');
      result.fixedHeight ??= effect('fixed_height');
      const max = effect('max_height');
      if (max && (!result.maxHeight || max.inches < result.maxHeight.inches)) result.maxHeight = max;
      for (const kind of ['clear_behind', 'max_depth']) {
        const limit = effect(kind);
        if (limit) result.depthLimits.push(limit);
      }
      const note = effect('probox_note');
      if (note && !result.notes.includes(note.text)) result.notes.push(note.text);
    }
    return { index, accessoryId, accessory, qty, warnings };
  });
  return result;
}
