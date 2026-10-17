import { CABINET_TYPE_IDS } from './constants.js';

const STANDARD = {
  back: 'dado',
  top: 'between',
  bottom: 'between',
  left: true,
  right: true,
  finTop: false,
  finBottom: false,
};

/** Resolve a cabinet leaf's box parts and the source of each value. */
export function boxConstruction(leaf, run, wall) {
  const box = leaf.box ?? {};
  const values = { ...STANDARD };
  const sources = Object.fromEntries(Object.keys(STANDARD).map((key) => [key, 'standard']));

  for (const key of Object.keys(STANDARD)) {
    if (box[key] != null) {
      values[key] = box[key];
      sources[key] = 'manual';
    }
  }

  if (sources.top !== 'manual' && (leaf.purpose === 'sink' || leaf.purpose === 'cooktop')) {
    values.top = 'spreaders';
    sources.top = `rule:${leaf.purpose}`;
  }

  if (sources.back !== 'manual') {
    if (values.bottom === 'none') {
      values.back = 'inset';
      sources.back = 'rule:no-bottom';
    } else if (leaf.purpose === 'medicine') {
      values.back = 'applied';
      sources.back = 'rule:medicine';
    } else if (run?.cabinetTypeId === CABINET_TYPE_IDS.BASE && run.hanging === true) {
      values.back = 'inset';
      sources.back = 'rule:hanging';
    } else if (wall?.thickness === 0) {
      values.back = 'inset';
      sources.back = 'rule:island';
    }
  }

  for (const [part, finish] of [['top', 'finTop'], ['bottom', 'finBottom']]) {
    if (values[part] === 'spreaders' || values[part] === 'none') {
      values[finish] = false;
      sources[finish] = 'rule:not-full';
    }
  }

  return { ...values, sources };
}
