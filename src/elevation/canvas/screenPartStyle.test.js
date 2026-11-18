import { expect, it } from 'vitest';
import { ELEVATION_BG, ELEVATION_LINE } from '../model/constants.js';
import { screenPartStyle } from './screenPartStyle.js';

const anchors = [
  [{ kind: 'countertop', itemKey: 'wood_top:1' }, { fill: ELEVATION_BG, stroke: '#64748b', strokeWidth: 1 }],
  [{ kind: 'countertop', itemKey: null }, { fill: '#cbd5e1', stroke: '#64748b', strokeWidth: 1 }],
  [{ kind: 'casing', opaque: false }, { fill: null, stroke: ELEVATION_LINE, strokeWidth: 1 }],
  [{ kind: 'section' }, { fill: '#475569', stroke: '#94a3b8', strokeWidth: 1, hatch: true }],
  [{ kind: 'recess', opaque: false }, { fill: null, stroke: ELEVATION_LINE, strokeWidth: 1, dash: [6, 4] }],
];

it.each([[anchors]])('styles wood and stone tops, transparent parts, sections and recesses (GC6)', (cases) => {
  for (const [part, expected] of cases) expect(screenPartStyle(part)).toEqual(expected);
});
