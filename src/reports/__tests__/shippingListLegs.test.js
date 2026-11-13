import { describe, expect, it } from 'vitest';
import { auto, room, run, wall } from '../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../elevation/model/constants.js';
import { legPreset } from '../../elevation/model/legs.js';
import { partNumbers } from '../../elevation/model/partNumbers.js';
import { roomParts } from '../../elevation/model/parts.js';
import { buildShape } from '../../elevation/model/shapeBuilders.js';
import { legShape } from '../../elevation/model/__tests__/fixtures/legs.js';
import { shippingDescription, shippingList } from '../shippingList.js';

const settings = { ...DEFAULT_SETTINGS, shapes: [legShape(), buildShape({
  id: 'foot', name: 'Foot', kind: 'leg', version: 1, archived: false, views: {},
  builder: { type: 'stack', sections: [{ type: 'square', width: 2.5, height: 4 }] },
})] };
const cornerIds = ['LF', 'LB', 'RF', 'RB'];
let nextId = 0;
const legs = legPreset('four', { shapeId: 'leg', height: 'full' }, () => cornerIds[nextId++]);
const R = run({ id: 'R', x: 10, width: 36, autoCount: false, items: [auto('cabinet')], legs,
  ends: { left: { type: 'none' }, right: { type: 'none' } } });
const W = wall({ runs: [R] });
const input = room({ walls: [W] });

describe('leg parts and shipping list (SH7)', () => {
  it('numbers four corners LF, LB, RF, RB after the cabinet, using their placed size', () => {
    // Reverse storage order so both position and front-depth sorting are exercised.
    const r = room({ walls: [wall({ runs: [{ ...R, legs: [...legs].reverse() }] })] });
    const parts = partNumbers(r, settings).parts;
    expect(parts.slice(0, 5).map(({ key, number }) => [key, number]))
      .toEqual([['cabinet', 1], ['LF', 2], ['LB', 3], ['RF', 4], ['RB', 5]]);
    expect(roomParts(r, settings).filter(({ kind }) => kind === 'leg')).toEqual(
      cornerIds.map((key, i) => ({ key, kind: 'leg', source: 'leg', wallId: W.id, side: 'front',
        runId: 'R', pieceId: null, molding: null, x: i < 2 ? 10 : 42.5, z: 0, width: 3.5, height: 34.5 })),
    );
    expect(shippingList(r, settings).rows.filter(({ kind }) => kind === 'leg')).toEqual(
      cornerIds.map((key, i) => ({ key, number: i + 2, kind: 'leg', description: 'Leg', notes: [],
        size: '3 1/2 x 34 1/2 x 3 1/2' })),
    );
  });

  it('lists FOOT at Feet as Foot, with its resolved 2 1/2 x 4 x 2 1/2 size', () => {
    const r = room({ walls: [wall({ runs: [{ ...R,
      legs: [{ ...legs[0], shapeId: 'foot', height: 'feet' }] }] })] });
    expect(shippingList(r, settings).rows.find(({ key }) => key === 'LF'))
      .toEqual({ key: 'LF', number: 2, kind: 'leg', description: 'Foot', notes: [], size: '2 1/2 x 4 x 2 1/2' });
    expect(shippingDescription(r, settings, roomParts(r, settings)[1])).toBe('Foot');
  });

  it('lists the stretched LEG at height 30 using its placed height', () => {
    const r = room({ walls: [wall({ runs: [{ ...R, legs: [{ ...legs[0], height: 30 }] }] })] });
    expect(shippingList(r, settings).rows.find(({ key }) => key === 'LF'))
      .toMatchObject({ number: 2, description: 'Leg', size: '3 1/2 x 30 x 3 1/2' });
    // Too-small and fixed-height picks must also report the actual shape height.
    const ownHeight = room({ walls: [wall({ runs: [{ ...R, legs: [
      { ...legs[0], height: 'feet' }, { ...legs[1], shapeId: 'foot' },
    ] }] })] });
    expect(shippingList(ownHeight, settings).rows.filter(({ kind }) => kind === 'leg')
      .map(({ description, size }) => [description, size]))
      .toEqual([['Foot', '3 1/2 x 34 1/2 x 3 1/2'], ['Leg', '2 1/2 x 4 x 2 1/2']]);
  });

  it('applies report overrides, omits missing/no-height legs and renumbers the others', () => {
    const r = room({ walls: [wall({ runs: [{ ...R, legs: legs.map((leg) =>
      leg.id === 'LB' ? { ...leg, shapeId: 'missing' } : leg) }] })],
    reportParts: { LF: { name: 'Turned leg', note: 'protect finish' } } });
    expect(shippingList(r, settings).rows.filter(({ kind }) => kind === 'leg')).toEqual([
      { key: 'LF', number: 2, kind: 'leg', description: 'Turned leg', notes: ['protect finish'],
        size: '3 1/2 x 34 1/2 x 3 1/2' },
      { key: 'RF', number: 3, kind: 'leg', description: 'Leg', notes: [], size: '3 1/2 x 34 1/2 x 3 1/2' },
      { key: 'RB', number: 4, kind: 'leg', description: 'Leg', notes: [], size: '3 1/2 x 34 1/2 x 3 1/2' },
    ]);
    const overridden = { ...r, partNumberOverrides: { LF: 12, LB: 3 } };
    expect(shippingList(overridden, settings).rows.filter(({ kind }) => kind === 'leg')
      .map(({ key, number }) => [key, number])).toEqual([['RF', 2], ['RB', 3], ['LF', 12]]);
    const noHeight = room({ walls: [wall({ runs: [{ ...R, z: 0,
      legs: [{ ...legs[0], height: 'feet' }, legs[2]] }] })] });
    expect(shippingList(noHeight, settings).rows.filter(({ kind }) => kind === 'leg')
      .map(({ key, number }) => [key, number])).toEqual([['RF', 2]]);
  });

  it('keeps legs after the run frames and before the next run, with the cabinet inside the legs', () => {
    const nextRun = run({ id: 'next', x: 60, width: 36, autoCount: false, items: [auto('next-cabinet')],
      ends: R.ends });
    const r = room({ style: { cabinetStyleId: 14 }, walls: [wall({ runs: [R, nextRun] })] });
    const parts = roomParts(r, settings);
    expect(parts.slice(0, 7).map(({ key }) => key))
      .toEqual(['cabinet', 'frame:cabinet', ...cornerIds, 'next-cabinet']);
    const without = room({ ...r, walls: [wall({ runs: [{ ...R, legs: undefined }, nextRun] })] });
    expect(parts.filter(({ kind }) => kind !== 'leg')).toEqual(roomParts(without, settings)
      .map((part) => part.key === 'cabinet' ? { ...part, x: 13.5, width: 29 } : part));
    expect(partNumbers(input, settings).warnings).toEqual([]);
  });
});
