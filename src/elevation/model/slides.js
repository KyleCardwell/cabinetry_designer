import { gridLeaves } from './grid.js';
import { isLabor, isMoney } from './libraryPricing.js';

export const SLIDE_MOUNTS = ['undermount', 'side'];
export const BUILT_IN_SLIDE_IDS = ['blum-562h', 'accuride-3832', 'accuride-4034'];

export const BUILT_IN_SLIDES = [
  {
    id: 'blum-562h',
    name: 'Blum Tandem 562H',
    brand: 'Blum',
    model: '562H',
    description: 'Blum Tandem 562H soft-close',
    mount: 'undermount',
    lengths: Array.from({ length: 10 }, (_, index) => {
      const nominal = 9 + 3 * index;
      return nominal === 15 ? { nominal, length: 15.515625, extension: 14.953125 } : { nominal };
    }),
    sideClearance: 0.25,
    minBelow: 0.5625,
    minAbove: 0.25,
    height: 1,
    clips: true,
    softClose: true,
    heavyDuty: false,
    hardwareSlideId: null,
    price: null,
    actualCost: null,
    labor: {},
  },
  ...['3832', '4034'].map((model) => ({
    id: `accuride-${model}`,
    name: `Accuride ${model}`,
    brand: 'Accuride',
    model,
    description: `Accuride ${model} ${model === '3832' ? 'full extension' : 'heavy duty'}`,
    mount: 'side',
    lengths: Array.from({ length: 15 }, (_, index) => {
      const nominal = 8 + 2 * index;
      return model === '3832' && nominal === 8 ? { nominal, length: 8, extension: 8 } : { nominal };
    }),
    // The 4034 dimensions copy the 3832 until the shop confirms them.
    sideClearance: 0.5,
    minBelow: 0.5625,
    minAbove: 0.25,
    height: 1.796875,
    clips: false,
    softClose: false,
    heavyDuty: true,
    hardwareSlideId: null,
    price: null,
    actualCost: null,
    labor: {},
  })),
];

function hasKeys(value, allowed, required = allowed) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Reflect.ownKeys(value).every((key) => allowed.includes(key))
    && required.every((key) => Object.hasOwn(value, key));
}

const SLIDE_KEYS = [
  'id', 'name', 'brand', 'model', 'description', 'mount', 'lengths',
  'sideClearance', 'minBelow', 'minAbove', 'height', 'clips', 'softClose', 'heavyDuty', 'hardwareSlideId',
  'price', 'actualCost', 'labor',
];
const isPositiveSize = (value) => Number.isFinite(value) && value > 0;
const isText = (value) => typeof value === 'string' && value === value.trim() && value.length <= 120;

/** Drop keys older slides carried that the designer no longer uses (Cabinet Vision's guide name). */
export function withoutRetiredSlideKeys(slide) {
  if (!slide || typeof slide !== 'object' || !Object.hasOwn(slide, 'cvName')) return slide;
  const { cvName, ...rest } = slide;
  void cvName;
  return rest;
}

export function isSlide(slide) {
  if (!hasKeys(slide, SLIDE_KEYS)
    || typeof slide.id !== 'string' || slide.id.length === 0
    || typeof slide.name !== 'string' || slide.name.length === 0 || slide.name !== slide.name.trim()
    || !['brand', 'model', 'description'].every((key) => isText(slide[key]))
    || !SLIDE_MOUNTS.includes(slide.mount)
    || !['sideClearance', 'minBelow', 'minAbove'].every((key) => Number.isFinite(slide[key]) && slide[key] >= 0)
    || !isPositiveSize(slide.height)
    || !['clips', 'softClose', 'heavyDuty'].every((key) => typeof slide[key] === 'boolean')
    || !(slide.hardwareSlideId === null || (Number.isInteger(slide.hardwareSlideId) && slide.hardwareSlideId > 0))
    || !isMoney(slide.price) || !isMoney(slide.actualCost) || !isLabor(slide.labor)
    || !Array.isArray(slide.lengths) || slide.lengths.length < 1 || slide.lengths.length > 40) return false;

  let previous = 0;
  for (const entry of slide.lengths) {
    if (!hasKeys(entry, ['nominal', 'length', 'extension'], ['nominal'])
      || !isPositiveSize(entry.nominal) || entry.nominal <= previous
      || !['length', 'extension'].every((key) => !Object.hasOwn(entry, key) || isPositiveSize(entry[key]))) return false;
    previous = entry.nominal;
  }
  return true;
}

export function isSlideList(list) {
  if (!Array.isArray(list)) return false;
  const ids = new Set();
  const names = new Set();
  for (const slide of list) {
    if (!isSlide(slide) || ids.has(slide.id) || names.has(slide.name.toLowerCase())) return false;
    ids.add(slide.id);
    names.add(slide.name.toLowerCase());
  }
  return BUILT_IN_SLIDES.every((seed) => findSlide(seed.id, list)?.mount === seed.mount);
}

/** An independent copy with the first unused name and no estimator link. */
export function newSlide(list, base, id) {
  const names = new Set(list.map((slide) => slide.name.toLowerCase()));
  let name = `${base.name} copy`;
  let number = 2;
  while (names.has(name.toLowerCase())) {
    name = `${base.name} copy ${number}`;
    number += 1;
  }
  return { ...structuredClone(base), id, name, hardwareSlideId: null };
}

export function findSlide(id, list) {
  return list.find((slide) => slide.id === id) ?? null;
}

/** Use the selected slide, then the shop's Blum, then the code built-in. */
export function resolveSlide(settings = {}) {
  const list = settings.slides ?? [];
  return findSlide(settings.drawerSlideId, list) ?? findSlide('blum-562h', list) ?? BUILT_IN_SLIDES[0];
}

/** Nearest valid slide wins; missing picks warn and fall through to the next level. */
export function resolveBoxSlide(settings = {}, { box = null, accessory = null, rule = null, cabinet = null } = {}) {
  const warnings = [];
  for (const [level, slideId] of [['box', box], ['accessory', accessory], ['rule', rule], ['cabinet', cabinet]]) {
    if (slideId === null) continue;
    const slide = findSlide(slideId, settings.slides ?? []);
    if (slide) return { slideId, slide, source: level, warnings };
    warnings.push({ code: 'slide-missing', level, slideId });
  }
  const slide = resolveSlide(settings);
  return { slideId: slide.id, slide, source: 'room', warnings };
}

export function fittingLength(slide, interiorDepth) {
  return slide.lengths.findLast(({ nominal }) => nominal <= interiorDepth + 1e-9)?.nominal ?? null;
}

export function slideBoxWidth(slide, opening) {
  return opening - 2 * slide.sideClearance;
}

/** Stored room slide picks, including nested cabinet grids, face boxes and section roll-outs. */
export function* roomSlideUses(room) {
  if (room?.settingsOverrides?.drawerSlideId != null) {
    yield { node: room.settingsOverrides, key: 'drawerSlideId' };
  }
  function* faces(face) {
    if (!face) return;
    if (face.children) {
      for (const child of face.children) yield* faces(child);
    } else if ((face.type === 'drawer_front' || (face.type === 'door' && face.action === 'pullout'))
      && face.drawerBox?.slideId != null) {
      yield { node: face.drawerBox, key: 'slideId', face };
    }
  }
  function* interiors(node) {
    if (!node) return;
    if (node.children) {
      for (const child of node.children) yield* interiors(child);
    } else {
      for (const item of node.rollouts?.items ?? []) {
        if (item.slideId != null) yield { node: item, key: 'slideId' };
      }
    }
  }
  for (const wall of room?.walls ?? []) {
    for (const run of wall.runs ?? []) {
      for (const item of run.grid ? gridLeaves(run.grid) : []) {
        if (item.kind !== 'cabinet') continue;
        if (item.drawerSlideId != null) yield { node: item, key: 'drawerSlideId' };
        yield* faces(item.face);
        yield* interiors(item.interior);
      }
    }
  }
}

/** Missing ids and every place that stores them, even when overridden below. */
export function missingSlides(room, settings, layers) {
  const known = new Set((settings?.slides ?? BUILT_IN_SLIDES).map(({ id }) => id));
  const missing = new Map();
  const entry = (slideId) => {
    if (typeof slideId !== 'string' || !slideId || known.has(slideId)) return null;
    if (!missing.has(slideId)) missing.set(slideId, { slideId, roomUses: 0, setIn: [] });
    return missing.get(slideId);
  };
  for (const { node, key } of roomSlideUses(room)) {
    const row = entry(node[key]);
    if (row) row.roomUses += 1;
  }
  for (const [level, values] of [
    ['team', settings], ['project', layers?.project?.values], ['phase', layers?.phase?.values],
  ]) {
    const row = entry(values?.drawerSlideId);
    if (row) row.setIn.push(level);
  }
  return [...missing.values()].sort((a, b) => a.slideId.localeCompare(b.slideId));
}

export function missingSlideName(slideId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slideId)
    ? 'An archived slide' : `Slide \`${slideId}\``;
}
