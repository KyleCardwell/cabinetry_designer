import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import MeasureReadout from './MeasureReadout.jsx';
import { measureBetween } from '../model/measure.js';

const point = (x, y) => ({ kind: 'corner', point: { x, y } });
const edge = (x1, y1, x2, y2, x, y) => ({ kind: 'edge', point: { x, y }, segment: { x1, y1, x2, y2 } });
const readout = (result, axisLabels = { x: 'Across', y: 'Up' }) => renderToStaticMarkup(
  <MeasureReadout result={result} axisLabels={axisLabels} />,
).replaceAll('&quot;', '"');
const hint = 'Click a corner, midpoint or edge · Shift: point on an edge · Esc: clear';

it('MS2b anchor 5: shows the diagonal distance, elevation axes and hint', () => {
  const html = readout(measureBetween(point(0, 0), point(48, 34.5)));
  expect(html).toContain('Distance ~59 1/8"');
  expect(html).toContain('Across 48" · Up 34 1/2"');
  expect(html).toContain(hint);
  expect(html).toContain('pointer-events-none absolute bottom-3 left-3');
});

it('MS2b anchor 6: distinguishes square-to-line and between-lines measurements', () => {
  expect(readout(measureBetween(edge(0, 0, 30, 0, 10, 0), point(20, 12))))
    .toContain('Square to line 12"');
  expect(readout(measureBetween(edge(0, 0, 0, 34.5, 0, 5), edge(30.5, 54, 30.5, 84, 30.5, 60))))
    .toContain('Between lines 30 1/2"');
});

it('shows the empty hint, optional plan axes, threshold and rounded nonparallel angle', () => {
  expect(readout(null)).toContain(hint);
  expect(readout(null)).not.toContain('Distance');
  expect(readout(measureBetween(point(0, 0), point(1, 0.001)))).not.toContain('Across');
  expect(readout(measureBetween(point(0, 0), point(48, 34.5)), { x: 'X', y: 'Y' }))
    .toContain('X 48" · Y 34 1/2"');
  const result = measureBetween(edge(0, 0, 30, 0, 10, 0), edge(40, 0, 50, 10, 45, 5));
  expect(readout({ ...result, angle: 45.04 }))
    .toContain('Lines not parallel (45°) — measured point to point');
});
