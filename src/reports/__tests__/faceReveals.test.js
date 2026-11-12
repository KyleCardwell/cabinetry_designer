import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixed, room, run, wall } from '../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../elevation/model/constants.js';
import { DEFAULT_DOOR_STYLE } from '../../elevation/model/doorStyles.js';
import { syncRoom } from '../../elevation/model/room.js';
import { formatRevealParts, profiledFaceReveals } from '../faceReveals.js';
import { shippingList } from '../shippingList.js';

const stored = JSON.parse(readFileSync(new URL('./fixtures/room10ff.json', import.meta.url), 'utf8'));
const settings = { ...DEFAULT_SETTINGS, teamDoorStyle: stored.doorStyles[0] };
const single = { type: 'door', size: null };
const drawers = { direction: 'vertical', size: null, children: Array.from({ length: 3 },
  () => ({ type: 'drawer_front', size: null })) };
const revealNotes = (r, s = settings) => shippingList(r, s).rows
  .find(({ key }) => key === 'cab').notes.filter((note) => note.startsWith("RV's"));

describe('profiled face frame reveals (FX14)', () => {
  it('measures Room 10 FF #32 from its real 43 1/2 by 99 1/2 box', () => {
    const s = { ...DEFAULT_SETTINGS, ...stored.settingsOverrides };
    const r = syncRoom(structuredClone(stored), s);
    const before = structuredClone(r);
    const entry = shippingList(r, s).rows.find(({ number }) => number === 32);
    expect(entry.size).toBe('43 1/2 x 99 1/2 x 24');
    expect(entry.notes.filter((note) => note.startsWith("RV's"))).toEqual([
      'RV\'s (1 19/32" T & B, 13/16" L & R, 1/8" pair door gap, 1 11/16" horizontal)',
    ]);
    expect(r).toEqual(before);
  });

  it('measures a profiled single door and replaces typed reveals', () => {
    const r = syncRoom(room({ style: { cabinetStyleId: 14 }, walls: [wall({ runs: [run({
      width: 30, ends: { left: { type: 'none' }, right: { type: 'none' } },
      items: [{ ...fixed('cab', 30), face: single, reveals: { horizontal: 9 } }],
    })] })] }), settings);
    expect(revealNotes(r)).toEqual(['RV\'s (1 19/32" T & B, 27/32" L & R)']);
  });

  it('measures only neighboring gaps in a three-front drawer stack', () => {
    const r = syncRoom(room({ style: { cabinetStyleId: 14 }, walls: [wall({ runs: [run({
      width: 30, ends: { left: { type: 'none' }, right: { type: 'none' } },
      items: [{ ...fixed('cab', 30), face: drawers }],
    })] })] }), settings);
    expect(revealNotes(r)).toEqual([
      'RV\'s (1 19/32" T & B, 27/32" L & R, 1 11/16" horizontal)',
    ]);
  });

  it('leaves square single, drawer and Room 10 pair cabinets without measured notes', () => {
    const s = { ...settings, teamDoorStyle: DEFAULT_DOOR_STYLE };
    for (const face of [single, drawers, { type: 'open', size: null }]) {
      const r = syncRoom(room({ style: { cabinetStyleId: 14 }, walls: [wall({ runs: [run({
        width: 30, ends: { left: { type: 'none' }, right: { type: 'none' } },
        items: [{ ...fixed('cab', 30), face }],
      })] })] }), s);
      expect(revealNotes(r, s)).toEqual([]);
    }
    const r = structuredClone(stored);
    r.doorStyles = r.doorStyles.map((style) => ({ ...style, profiles: { ...style.profiles, outside: null } }));
    const entry = shippingList(syncRoom(r, s), s).rows.find(({ number }) => number === 32);
    expect(entry.notes.filter((note) => note.startsWith("RV's"))).toEqual([]);
  });

  it('keeps distinct side distances, pair gaps, and other vertical gaps in their own order', () => {
    const box = { x: 10, z: 20, width: 30, height: 30 };
    const faces = [
      { type: 'pair_door', path: 'r.0', half: 'left', x: 10.75, z: 21.5, width: 6, height: 12 },
      { type: 'pair_door', path: 'r.0', half: 'right', x: 16.875, z: 21.5, width: 6, height: 12 },
      { type: 'door', path: 'r.1', x: 24.375, z: 21.5, width: 14.875, height: 12 },
      { type: 'drawer_front', path: 'r.2', x: 10.84375, z: 35.1875, width: 28.3125, height: 13.3125 },
      { type: 'open', path: 'r.3', x: 10, z: 20, width: 30, height: 30 },
    ];
    expect(profiledFaceReveals(box, faces)).toEqual([
      '1 1/2" T & B', '3/4"/27/32" L & R', '1/8" pair door gap', '1 11/16" horizontal', '1 1/2" vertical',
    ]);
    expect(profiledFaceReveals(box, [...faces].reverse())).toEqual(profiledFaceReveals(box, faces));
  });

  it('combines equal signed values before formatting, and retains overhang and zero labels', () => {
    expect(formatRevealParts({ top: [-1.625], bottom: [-1.625 + 0.5e-6], left: [0], right: [0] }))
      .toEqual(['1 5/8" OH T & B', '0" L & R']);
    expect(formatRevealParts({ top: [0.25], bottom: [0.25 + 2e-6], left: [-0.75], right: [0.75] }))
      .toEqual(['1/4" T', '1/4" B', '3/4" OH L', '3/4" R']);
    expect(formatRevealParts({ bottom: [0.75], left: [0.75, 0.75 + 0.5e-6] }))
      .toEqual(['3/4" B', '3/4" L']);
  });
});
