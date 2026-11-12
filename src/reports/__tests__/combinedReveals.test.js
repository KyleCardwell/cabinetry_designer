import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { fixed, room, run, wall } from '../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../elevation/model/constants.js';
import { syncRoom } from '../../elevation/model/room.js';
import { shippingList } from '../shippingList.js';

it('combines only equal printed sides in every RV note (FX14)', () => {
  const stored = JSON.parse(readFileSync(new URL('./fixtures/room10ff.json', import.meta.url), 'utf8'));
  const settings = { ...DEFAULT_SETTINGS, ...stored.settingsOverrides };
  const { rows } = shippingList(syncRoom(stored, settings), settings);
  for (const [number, expected] of [
    [2, 'RV\'s (13/16" T, 27/32" L & R)'],
    [6, 'RV\'s (13/16" T, 27/32" L, 3/32" R)'],
    [35, 'RV\'s (13/16" L & R)'],
  ]) {
    expect(rows.find((row) => row.number === number).notes.filter((note) => note.startsWith("RV's")))
      .toEqual([expected]);
  }

  for (const cabinetStyleId of [13, 14, 15]) {
    for (const [reveals, expected] of [
      [{ top: 0.5, bottom: 0.5, left: 0.375, right: 0.375 }, 'RV\'s (1/2" T & B, 3/8" L & R)'],
      [{ top: -1.625, bottom: -1.625, left: -0.5, right: -0.5 }, 'RV\'s (1 5/8" OH T & B, 1/2" OH L & R)'],
      [{ top: 0.5, bottom: 0.75, left: -0.5, right: 0.5 }, 'RV\'s (1/2" T, 3/4" B, 1/2" OH L, 1/2" R)'],
      [{ top: 0.5, bottom: null, left: null, right: 0.5 }, 'RV\'s (1/2" T, 1/2" R)'],
      // Euro's standard top is omitted even when the bottom has the same final value.
      [{ top: 0.25, bottom: 0.25 }, cabinetStyleId === 13 ? 'RV\'s (1/4" B)' : 'RV\'s (1/4" T & B)'],
    ]) {
      const built = syncRoom(room({ style: { cabinetStyleId }, walls: [wall({ runs: [run({
        width: 30, autoCount: false,
        ends: { left: { type: 'none' }, right: { type: 'none' } },
        items: [{ ...fixed('cab', 30), face: { type: 'door', size: null }, reveals }],
      })] })] }), DEFAULT_SETTINGS);
      const before = structuredClone(built);
      const entry = shippingList(built, DEFAULT_SETTINGS).rows.find(({ key }) => key === 'cab');
      expect(entry.notes.filter((note) => note.startsWith("RV's"))).toEqual([expected]);
      expect(built).toEqual(before);
    }
  }
});
