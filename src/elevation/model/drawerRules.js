import { fittingLength } from './slides.js';

export const DRAWER_RULES = Object.freeze({
  fileFrontMinHeight: 13,
  shallowFrontMinHeight: 5.875,
  shallowDepth: 15,
  wideFileFront: 24,
  sinkReduction: 3,
  chargingClearance: 2,
  fileHeight: 10.25,
  stabilizerFrontWidth: 36,
  fileSlideId: 'accuride-3832',
  wideFileSlideId: 'accuride-4034',
});

const isFileDrawer = ({ kind, purpose, front }) => kind === 'drawer' && purpose === 'file'
  && front.height >= DRAWER_RULES.fileFrontMinHeight;

/** Evaluate against the inherited slide and depth, before any rule changes the slide. */
export function ruleSlide({ kind, purpose, front, inheritedSlide, depth }) {
  if (isFileDrawer({ kind, purpose, front })) {
    return { slideId: front.width > DRAWER_RULES.wideFileFront
      ? DRAWER_RULES.wideFileSlideId : DRAWER_RULES.fileSlideId, rule: 'DRW-003' };
  }
  if (kind === 'drawer' && front.height > DRAWER_RULES.shallowFrontMinHeight
    && inheritedSlide.mount !== 'side' && depth !== null && depth < DRAWER_RULES.shallowDepth) {
    return { slideId: DRAWER_RULES.fileSlideId, rule: 'DRW-002' };
  }
  return null;
}

export function ruleHeight(input) {
  return isFileDrawer(input) ? { height: DRAWER_RULES.fileHeight, rule: 'DRW-003' } : null;
}

export function sinkDepth(slide, standard) {
  return standard === null ? null : fittingLength(slide, standard - DRAWER_RULES.sinkReduction);
}

export function chargingDepth(slide, interiorDepth) {
  return fittingLength(slide, interiorDepth - DRAWER_RULES.chargingClearance);
}

/** DRW-009 uses the cabinet box dimensions, before interior clearances. */
export function rotDepth(boxWidth, boxDepth) {
  if (boxDepth >= 26) return { depth: 24, note: null };
  if (boxDepth < 24) return null;
  if (boxWidth >= 18 && boxWidth < 24) return { depth: 22, note: 'bottom up 1 3/4"' };
  return { depth: 21, note: null };
}

/** Sink and charging constraints combine; a constraint with no fitting length stays unsized. */
export function ruleDepth({ kind, purpose, charging, slide, interiorDepth }) {
  if (kind !== 'drawer') return null;
  const sink = purpose === 'sink'
    ? { depth: sinkDepth(slide, fittingLength(slide, interiorDepth)), rule: 'DRW-006' } : null;
  const charge = charging ? { depth: chargingDepth(slide, interiorDepth), rule: 'DRW-008' } : null;
  if (!sink) return charge;
  if (!charge) return sink;
  return sink.depth === null || (charge.depth !== null && sink.depth <= charge.depth) ? sink : charge;
}
