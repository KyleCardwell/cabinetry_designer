import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import MeasureReadout from './MeasureReadout.jsx';
import { measureBetween, profileMeasureGeometry, snapMeasure } from '../model/measure.js';

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

it('MS5 anchor 6: shows a hovered quarter-inch arc radius above the hint without a measurement', () => {
  const geometry = profileMeasureGeometry([{
    points: { b: [0.25, 0], c: [0, 0.25] },
    loops: [{ closed: false, segs: [{ type: 'arc', from: 'b', to: 'c', center: [0, 0], ccw: true }] }],
  }]);
  const hover = snapMeasure({ x: 0.225, y: 0.125 }, geometry, 0.025);
  expect(hover.kind).toBe('arc');
  const html = renderToStaticMarkup(<MeasureReadout hover={hover} />).replaceAll('&quot;', '"');
  expect(html).toContain('<div>Arc R 1/4"</div>');
  expect(html.indexOf('Arc R')).toBeLessThan(html.indexOf(hint));
  expect(html).not.toContain('Distance');
  expect(renderToStaticMarkup(<MeasureReadout hover={{ kind: 'center', point: { x: 0, y: 0 } }} />))
    .not.toContain('Arc R');
});

it('MS5 anchor 7: replaces default position classes and supports the profile hint', () => {
  const profileHint = 'Click a corner, midpoint, centre or edge · Shift: point on an edge · Esc: clear';
  const html = renderToStaticMarkup(<MeasureReadout className="bottom-10 left-2" hint={profileHint} />);
  expect(html).toContain('pointer-events-none absolute bottom-10 left-2');
  expect(html).not.toContain('bottom-3');
  expect(html).not.toContain('left-3');
  expect(html).toContain(profileHint);
  expect(html).not.toContain(hint);
});
