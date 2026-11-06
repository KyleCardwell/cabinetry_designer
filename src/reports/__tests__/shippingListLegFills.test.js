import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { room, run, wall } from '../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../elevation/model/constants.js';
import { legPreset } from '../../elevation/model/legs.js';
import { roomParts } from '../../elevation/model/parts.js';
import { E, Sf, fourEndLegs, legShape, noEnds } from '../../elevation/model/__tests__/fixtures/legs.js';
import { formatSize } from '../format.js';
import { shippingDescription, shippingList } from '../shippingList.js';

const settings = { ...DEFAULT_SETTINGS, shapes: [legShape()] };
let nextId = 0;
const four = legPreset('four', { shapeId: 'leg', proud: 0.5 }, () => ['LF', 'LB', 'RF', 'RB'][nextId++]);
const R = run({ x: 10, width: 36 });

describe('SH7.2 step b leg fill shipping list', () => {
  it('anchor 2: lists the panel at its placed depth, height and thickness with report overrides', () => {
    const endLegs = { ...fourEndLegs, left: { ...E, fit: 'between' } };
    const input = room({ walls: [wall({ runs: [{ ...R, legs: undefined, ends: noEnds, endLegs }] })] });
    const part = roomParts(input, settings).find(({ key }) => key === 'run-1:endleg:left-front:fill');
    const row = shippingList(input, settings).rows.find(({ key }) => key === 'run-1:endleg:left-front:fill');
    expect(row).toMatchObject({ key: 'run-1:endleg:left-front:fill', kind: 'leg_panel',
      description: 'Base End Panel', size: formatSize(18.375, 34.5, 0.8125), notes: [] });
    expect(shippingDescription(input, settings, part)).toBe('Base End Panel');
    const shopBuilt = { ...input, reportParts: { 'run-1:endleg:left-front:fill': { shopBuilt: true, note: 'protect finish' } } };
    expect(shippingList(shopBuilt, settings).rows.find(({ key }) => key === 'run-1:endleg:left-front:fill'))
      .toMatchObject({ description: 'Shop-built Base End Panel', notes: ['protect finish'] });
    expect(shippingDescription({ ...input, reportParts: { 'run-1:endleg:left-front:fill': { name: 'Custom panel' } } }, settings, part))
      .toBe('Custom panel');
  });

  it('step f anchor 1: orders a front-two filler by face width, box height and ordered depth', () => {
    const endLegs = { left: { legs: 'front', front: Sf, fit: 'behind' },
      right: { legs: 'front', front: Sf } };
    const input = room({ walls: [wall({ runs: [{ ...R, legs: undefined, ends: noEnds, endLegs }] })] });
    expect(roomParts(input, settings).find(({ key }) => key === 'run-1:endleg:left-front:fill')).toMatchObject({ kind: 'leg_filler' });
    expect(shippingList(input, settings).rows.find(({ key }) => key === 'run-1:endleg:left-front:fill'))
      .toMatchObject({ kind: 'leg_filler', description: 'Base Filler', size: formatSize(3.5, 30.5, 3.1875), notes: ['L-shape'] });
  });
});

describe('SH7.3 step b leg fill shipping list', () => {
  it('anchors 1–2: keeps one panel part, ordering C/L returns by overall depth and plain panels by thickness', () => {
    for (const [returns, returnDepth, depth, notes] of [
      ['both', undefined, 4.5, ['C-shape']], ['front', undefined, 4.5, ['L-shape']],
      ['back', undefined, 4.5, ['L-shape']], [undefined, undefined, 0.8125, []],
      ['both', 0.8125 + 1e-6, 0.8125, []],
    ]) {
      const panel = { ...(returns ? { returns } : {}),
        ...(returnDepth === undefined ? {} : { returnDepth }) };
      const input = room({ walls: [wall({ runs: [run({ ...R,
        legs: undefined, ends: noEnds, endLegs: { ...fourEndLegs, left: { ...E, fit: 'between', panel } },
      })] })] });
      expect(roomParts(input, settings).filter(({ key }) => key.startsWith('run-1:endleg:left-front:fill')))
        .toMatchObject([{ key: 'run-1:endleg:left-front:fill', kind: 'leg_panel' }]);
      expect(shippingList(input, settings).rows.filter(({ key }) => key.startsWith('run-1:endleg:left-front:fill')))
        .toMatchObject([{ key: 'run-1:endleg:left-front:fill', kind: 'leg_panel', description: 'Base End Panel',
          size: formatSize(18.375, 34.5, depth), notes }]);
    }
  });

  it('uses resolved setting/override depths and places the shape note before free text', () => {
    for (const [returnDepth, depth] of [[undefined, 6], [3, 3]]) {
      const panel = { returns: 'both', ...(returnDepth === undefined ? {} : { returnDepth }) };
      const input = room({ walls: [wall({ runs: [run({ ...R,
        legs: undefined, ends: noEnds, endLegs: { ...fourEndLegs, left: { ...E, fit: 'between', panel } },
      })] })], reportParts: { 'run-1:endleg:left-front:fill': { shopBuilt: true, note: 'protect finish' } } });
      expect(shippingList(input, { ...settings, legPanelReturnDepth: 6 }).rows.find(({ key }) => key === 'run-1:endleg:left-front:fill'))
        .toMatchObject({ description: 'Shop-built Base End Panel', size: formatSize(18.375, 34.5, depth),
          notes: ['C-shape', 'protect finish'] });
    }
  });

  it('anchor 6: preserves parts and reports without fills, with and without hand legs', () => {
    // Captured before step b; the existing drawing regression also preserves the payloads.
    for (const [legs, hash] of [
      [four, '08b6dffeef899a6223a4c6426cb5148374ad081c0b212f7be3213c0ba42ac337'],
      [[], 'b70abf264768c8378c93ca729b997b5a9e654c644926e68e9270d3be891e65c9'],
    ]) {
      const input = room({ walls: [wall({ runs: [run({ ...R, legs })] })] });
      const output = { parts: roomParts(input, settings), report: shippingList(input, settings) };
      expect(createHash('sha256').update(JSON.stringify(output)).digest('hex')).toBe(hash);
    }
  });
});
