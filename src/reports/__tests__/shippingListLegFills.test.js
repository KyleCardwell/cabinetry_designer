import { describe, expect, it } from 'vitest';
import { room, run, wall } from '../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../elevation/model/constants.js';
import { legPreset } from '../../elevation/model/legs.js';
import { roomParts } from '../../elevation/model/parts.js';
import { legShape } from '../../elevation/model/__tests__/fixtures/legs.js';
import { formatSize } from '../format.js';
import { shippingDescription, shippingList } from '../shippingList.js';

const settings = { ...DEFAULT_SETTINGS, shapes: [legShape()] };
let nextId = 0;
const four = legPreset('four', { shapeId: 'leg', proud: 0.5 }, () => ['LF', 'LB', 'RF', 'RB'][nextId++]);
const R = run({ x: 10, width: 36 });

describe('SH7.2 step b leg fill shipping list', () => {
  it('anchor 2: lists the panel at its placed depth, height and thickness with report overrides', () => {
    const legs = four.map((leg, i) => i === 0 ? { ...leg, fill: { type: 'panel' } } : leg);
    const input = room({ walls: [wall({ runs: [{ ...R, legs }] })] });
    const part = roomParts(input, settings).find(({ key }) => key === 'LF:fill');
    const row = shippingList(input, settings).rows.find(({ key }) => key === 'LF:fill');
    expect(row).toMatchObject({ key: 'LF:fill', kind: 'leg_panel',
      description: 'Base End Panel', size: formatSize(18.375, 34.5, 0.8125), notes: [] });
    expect(shippingDescription(input, settings, part)).toBe('Base End Panel');
    const shopBuilt = { ...input, reportParts: { 'LF:fill': { shopBuilt: true, note: 'protect finish' } } };
    expect(shippingList(shopBuilt, settings).rows.find(({ key }) => key === 'LF:fill'))
      .toMatchObject({ description: 'Shop-built Base End Panel', notes: ['protect finish'] });
    expect(shippingDescription({ ...input, reportParts: { 'LF:fill': { name: 'Custom panel' } } }, settings, part))
      .toBe('Custom panel');
  });

  it('anchor 3: lists a front-only filler at its placed size, including explicit thickness and clearances', () => {
    const front = four.filter(({ yFrom }) => yFrom === 'front');
    for (const [fill, size] of [[{ type: 'filler' }, formatSize(21.875, 34.5, 0.8125)],
      [{ type: 'filler', thickness: 0.75, top: 0.5, bottom: 1 }, formatSize(21.875, 33, 0.75)]]) {
      const legs = front.map((leg, i) => i === 0 ? { ...leg, fill } : leg);
      const input = room({ walls: [wall({ runs: [{ ...R, legs }] })] });
      expect(roomParts(input, settings).find(({ key }) => key === 'LF:fill')).toMatchObject({ kind: 'leg_filler' });
      expect(shippingList(input, settings).rows.find(({ key }) => key === 'LF:fill'))
        .toMatchObject({ kind: 'leg_filler', description: 'Base Filler', size, notes: [] });
    }
  });
});
