import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { measureBetween } from '../model/measure.js';
import MeasureSvg from './MeasureSvg.jsx';

it('MS5 anchor 5: renders diagonal labels and dashed legs, plus screen-sized markers and translucent previews', () => {
  const result = measureBetween({ kind: 'corner', point: { x: 0, y: 0 } },
    { kind: 'corner', point: { x: 48, y: 34.5 } });
  const svg = (extra = {}) => renderToStaticMarkup(<svg><MeasureSvg measures={[{ result }]}
    toScreen={({ x, y }) => ({ x: x * 2, y: y * 2 })} {...extra} /></svg>).replaceAll('&quot;', '"');
  const html = svg();
  expect(html).toContain('<g pointer-events="none">');
  expect(html).toContain('points="0 0 96 69"');
  expect(html).toContain('points="0 0 96 0 96 69"');
  expect(html).toContain('stroke-dasharray="4 3"');
  expect(html).toContain('>~59 1/8"</text>');
  expect(html).toContain('>48"</text>');
  expect(html).toContain('>34 1/2"</text>');
  expect(html).toContain('font-family="monospace" font-size="11" dominant-baseline="central" text-anchor="middle"');
  expect(html).toContain('transform="translate(48 0) rotate(0)"');
  expect(html).toContain('height="13" rx="2" fill="#831843"');
  const markers = svg({ preview: result, hover: { kind: 'corner', point: { x: 2, y: 3 } },
    first: { kind: 'mid', point: { x: 4, y: 5 } } });
  expect(markers).toContain('opacity="0.7"');
  expect(markers).toContain('<rect x="-0.5" y="1.5" width="9" height="9"');
  expect(markers).toContain('<polygon points="8 5 13 15 3 15" stroke="#f472b6" stroke-width="1" fill="#f472b6"');
  expect(svg({ hover: { kind: 'center', point: { x: 0, y: 0 } } }))
    .toContain('<circle cx="0" cy="0" r="4" stroke="#f472b6" stroke-width="2" fill="none"');
});
