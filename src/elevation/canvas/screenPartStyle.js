import { ELEVATION_BG, ELEVATION_LINE } from '../model/constants.js';

/** Screen colours for the same parts the drawing payload paints. */
export function screenPartStyle(part) {
  const style = { fill: ELEVATION_BG, stroke: ELEVATION_LINE, strokeWidth: 1 };
  if (part.kind === 'face') style.stroke = '#e2e8f0';
  if (part.kind === 'countertop') {
    style.fill = part.itemKey ? ELEVATION_BG : '#cbd5e1';
    style.stroke = '#64748b';
  }
  if (part.kind === 'section') {
    style.fill = '#475569';
    style.stroke = '#94a3b8';
    style.hatch = true;
  }
  if (part.kind === 'profile') style.stroke = '#64748b';
  if (part.kind === 'recess') {
    style.fill = null;
    style.dash = [6, 4];
  }
  if (part.opaque === false) {
    style.fill = null;
    style.stroke = ELEVATION_LINE;
  }
  return style;
}
