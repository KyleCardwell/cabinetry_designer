import { fittingLength } from './slides.js';
import { roundTo } from './units.js';

export const DRAWER_RULES = Object.freeze({
  fileFrontMinHeight: 13,
  shallowFrontMinHeight: 5.875,
  shallowDepth: 15,
  wideFileFront: 24,
  sinkReduction: 3,
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

/** DRW-009 uses the cabinet box dimensions, before interior clearances. */
export function rotDepth(boxWidth, boxDepth) {
  if (boxDepth >= 26) return { depth: 24, note: null };
  if (boxDepth < 24) return null;
  if (boxWidth >= 18 && boxWidth < 24) return { depth: 22, note: 'bottom up 1 3/4"' };
  return { depth: 21, note: null };
}

/** Sink constraints are evaluated against the standard fitting length. */
export function ruleDepth({ kind, purpose, slide, usableDepth }) {
  return kind === 'drawer' && purpose === 'sink'
    ? { depth: sinkDepth(slide, fittingLength(slide, usableDepth)), rule: 'DRW-006' } : null;
}

/** Extra cabinet back relief needed for the actual nominal slide length. */
export function slideNotch(slide, slideLength, interiorDepth) {
  if (slideLength === null) return null;
  const notch = slideLength + slide.backClearance - interiorDepth;
  return notch > 1 / 64 + 1e-9 ? roundTo(notch, 1 / 16) : null;
}
