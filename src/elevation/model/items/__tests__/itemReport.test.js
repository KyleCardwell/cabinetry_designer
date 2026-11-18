import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../constants.js';
import { itemReport } from '../itemReport.js';

it.each([
  [{}, '24 x 18'],
  [{ rectangle: () => ({ back: 0, front: 12.5 }) }, '24 x 18 x 12 1/2'],
])('reports an unknown kind with its available dimensions: %s (GC3.4)', (facts, size) => {
  const item = { key: 'x', kind: 'bench_seat', width: 24, height: 18 };
  const ctx = { room: {}, settings: DEFAULT_SETTINGS, doorNotes: () => undefined };
  expect(itemReport(item, facts, ctx)).toEqual({ description: 'Bench Seat', size, notes: [] });
});
