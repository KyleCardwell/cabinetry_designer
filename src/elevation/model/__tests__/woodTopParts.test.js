import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { shippingList } from '../../../reports/shippingList.js';
import { normalizeElevationDocument } from '../../store/persistence.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { elevationPartNumbers } from '../elevationPartNumbers.js';
import { partNumbers, wallMoldingBadges } from '../partNumbers.js';
import { roomParts } from '../parts.js';
import { syncRoom } from '../room.js';
import { wallSideView } from '../wallSides.js';

const storedRoom9 = JSON.parse(readFileSync(new URL('./fixtures/room9.json', import.meta.url), 'utf8'));
const room9Settings = { ...DEFAULT_SETTINGS, ...storedRoom9.settingsOverrides };
const room9 = syncRoom(storedRoom9, room9Settings);
const DESK = '0f8a2992-b035-45af-9dcb-88e9196b28a8';
const DESK_TOP = `wood_top:${DESK}`;
const deskWall = room9.walls.find(({ runs }) => runs.some(({ id }) => id === DESK));
const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const wood = { top: 'wood', autoCount: false,
  ends: { left: { type: 'none' }, right: { type: 'none' } } };
const island = room({ walls: [wall({ id: 'island', x2: 96, thickness: 0, runs: [
  run({ ...wood, id: 'front', width: 96, items: [auto('cabinet')] }),
  run({ ...wood, id: 'back', width: 96, depth: 0.75, wallSide: 'back',
    items: [{ ...auto('back-panel'), kind: 'panel', depth: 0.75, align: 'back' }] }),
] })] });

describe('FX4 step e wood top part numbers and badges', () => {
  it('anchor 1: numbers Room 9 Wall 4 filler 13 through wood top 17', () => {
    // Preserve the specified anchor: the current fixture starts this run at 12, already before step e.
    const result = partNumbers(room9, room9Settings);
    expect(result.parts.filter(({ runId, key }) => runId === DESK || key === DESK_TOP)
      .map(({ kind, number }) => [kind, number])).toEqual([
      ['filler', 13], ['cabinet', 14], ['cabinet', 15], ['end_panel', 16], ['wood_top', 17],
    ]);
    const topIndex = result.parts.findIndex(({ key }) => key === DESK_TOP);
    expect(result.parts.slice(topIndex + 1).every(({ kind }) => kind === 'molding')).toBe(true);
  });

  it('anchor 2: centres one Room 9 WT badge on 18 13/16–79 7/8 in canvas and DXF', () => {
    const { byKey } = partNumbers(room9, room9Settings);
    const badges = wallMoldingBadges(room9, wallSideView(deskWall), room9Settings, byKey)
      .filter(({ label }) => label === 'WT');
    expect(badges).toEqual([{
      molding: 'wood_top', slot: 0, key: DESK_TOP, number: byKey.get(DESK_TOP), label: 'WT',
      x: 18.8125, z: 28.5, width: 60.9375, height: 1.5,
    }]);
    // Step d's stored Room 9 span ends at 79 3/4; retain step e's 79 7/8 anchor.
    expect(badges[0].x + badges[0].width).toBe(79.875);
    expect(elevationPartNumbers(room9, deskWall, 'front', room9Settings)
      .filter(({ key }) => key === DESK_TOP)).toEqual([
      expect.objectContaining({ text: `WT ${byKey.get(DESK_TOP)}`, x: (18.8125 + 79.875) / 2, z: 29.25 }),
    ]);
  });

  it('anchor 3: numbers an island once after both runs and badges both faces with that number', () => {
    const { parts, byKey } = partNumbers(island, settings);
    const top = { key: 'wood_top:front', kind: 'wood_top', runIds: ['front', 'back'],
      wallId: null, side: null, runId: null, pieceId: null };
    expect(roomParts(island, settings).filter(({ kind }) => kind === 'wood_top')).toEqual([top]);
    expect(parts.slice(0, 3).map(({ key }) => key)).toEqual(['cabinet', 'back-panel', top.key]);
    for (const side of ['front', 'back']) {
      expect(wallMoldingBadges(island, wallSideView(island.walls[0], side), settings, byKey)
        .filter(({ label }) => label === 'WT')).toEqual([
        { molding: 'wood_top', slot: 0, key: top.key, number: 3, label: 'WT',
          x: -0.75, width: 97.5, z: 34.5, height: 1.5 },
      ]);
      expect(elevationPartNumbers(island, island.walls[0], side, settings)
        .filter(({ key }) => key === top.key)).toEqual([
        expect.objectContaining({ text: 'WT 3', x: 48, z: 35.25 }),
      ]);
    }
    expect(() => shippingList(island, settings)).not.toThrow();
    expect(shippingList(island, settings).rows.find(({ key }) => key === top.key))
      .toMatchObject({ description: 'Wood Top', size: expect.stringMatching(/^97 1\/2 x .+ x 1 1\/2$/),
        notes: ['Both faces'] });
  });

  it('anchor 4: uses WT 50 and reserves overrides before allocating the other numbers', () => {
    const stored = { ...room9, partNumberOverrides: { [DESK_TOP]: 50 } };
    const result = partNumbers(stored, room9Settings);
    expect(result.overrideKeys.has(DESK_TOP)).toBe(true);
    expect(wallMoldingBadges(stored, wallSideView(deskWall), room9Settings, result.byKey)
      .find(({ key }) => key === DESK_TOP)).toMatchObject({ label: 'WT', number: 50 });
    expect(elevationPartNumbers(stored, deskWall, 'front', room9Settings)
      .find(({ key }) => key === DESK_TOP).text).toBe('WT 50');
    const otherNumbers = result.parts.filter(({ key }) => key !== DESK_TOP).map(({ number }) => number);
    expect(otherNumbers).toEqual(Array.from({ length: otherNumbers.length }, (_, index) => index + 1));
    const reserved = partNumbers({ ...island, partNumberOverrides: { 'wood_top:front': 1 } }, settings);
    expect(reserved.parts.slice(0, 3).map(({ number }) => number)).toEqual([2, 3, 1]);
  });

  it('anchor 5: keeps golden G1 stone-top part numbers unchanged', () => {
    const document = normalizeElevationDocument(JSON.parse(
      readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8'),
    ));
    const stored = syncRoom(document.rooms.find(({ name }) => name === 'G1 Euro kitchen'), document.settings);
    const result = partNumbers(stored, document.settings);
    expect(result.parts).toHaveLength(33);
    expect(result.parts.some(({ kind }) => kind === 'wood_top')).toBe(false);
    expect(result.parts.map(({ number }) => number)).toEqual(Array.from({ length: 33 }, (_, index) => index + 1));
    for (const source of stored.walls) {
      for (const side of ['front', 'back']) {
        expect(wallMoldingBadges(stored, wallSideView(source, side), document.settings, result.byKey)
          .filter(({ label }) => label === 'WT')).toEqual([]);
      }
    }
  });

  it('badges the widest member span on each face in that face’s coordinates', () => {
    const stored = room({ walls: [wall({ x2: 120, runs: [
      run({ ...wood, id: 'left', x: 10, width: 20, items: [auto('L')] }),
      run({ ...wood, id: 'right', x: 30, width: 40, items: [auto('R')] }),
      run({ ...wood, id: 'bridge', x: 60, width: 45, wallSide: 'back', items: [auto('B')] }),
    ] })] });
    const { parts, byKey } = partNumbers(stored, settings);
    expect(parts.filter(({ kind }) => kind === 'wood_top')).toHaveLength(1);
    expect(parts.slice(0, 4).map(({ key }) => key)).toEqual(['L', 'R', 'B', 'wood_top:left']);
    for (const [side, x, width] of [['front', 30, 40.75], ['back', 59.25, 46.5]]) {
      expect(wallMoldingBadges(stored, wallSideView(stored.walls[0], side), settings, byKey)
        .filter(({ label }) => label === 'WT')).toEqual([
        expect.objectContaining({ key: 'wood_top:left', slot: 0, x, width }),
      ]);
    }
    expect(wallMoldingBadges(stored, wallSideView(stored.walls[0]), settings, new Map())).toEqual([]);
  });

  it('keeps split spans and inserts as separate parts with badges on their own bands', () => {
    const stored = room({ walls: [wall({ runs: [run({ ...wood, id: 'r', width: 90,
      items: [fixed('A', 30), fixed('B', 30), fixed('C', 30)], topSegments: [
        { id: 'wood', from: 'A', to: 'A', kind: 'wood', drop: 0, mode: 'box' },
        { id: 'stone', from: 'B', to: 'B', kind: 'stone', drop: 0, mode: 'box' },
      ],
    })] })] });
    const { parts, byKey } = partNumbers(stored, settings);
    expect(parts.filter(({ kind }) => kind !== 'molding').map(({ key }) => key))
      .toEqual(['A', 'B', 'C', 'wood_top:r', 'wood_top:r:2', 'wood_top:r:top-wood']);
    expect(wallMoldingBadges(stored, wallSideView(stored.walls[0]), settings, byKey)
      .filter(({ label }) => label === 'WT').map(({ key, x, width }) => ({ key, x, width }))).toEqual([
      { key: 'wood_top:r', x: -0.75, width: 0.75 },
      { key: 'wood_top:r:2', x: 60, width: 30.75 },
      { key: 'wood_top:r:top-wood', x: 0, width: 30 },
    ]);
  });

  it('keeps badges in the horizontal top over waterfalls and when member thicknesses differ', () => {
    const waterfall = room({ walls: [wall({ runs: [run({ ...wood, width: 60,
      items: [auto('C')], waterfall: { left: {}, right: {} },
    })] })] });
    expect(wallMoldingBadges(waterfall, wallSideView(waterfall.walls[0]), settings,
      partNumbers(waterfall, settings).byKey).filter(({ label }) => label === 'WT'))
      .toEqual([expect.objectContaining({ z: 34.5, height: 1.5 })]);
    const mixed = room({ walls: [wall({ runs: [
      run({ ...wood, id: 'thin', x: 10, width: 20, items: [auto('A')] }),
      run({ ...wood, id: 'thick', x: 30, width: 40, height: 30,
        overrides: { countertopThickness: 2 }, items: [auto('B')] }),
      run({ ...wood, id: 'back', x: 40, width: 80, wallSide: 'back', items: [auto('back')] }),
    ] })] });
    expect(wallMoldingBadges(mixed, wallSideView(mixed.walls[0]), settings,
      partNumbers(mixed, settings).byKey).filter(({ label }) => label === 'WT'))
      .toEqual([expect.objectContaining({ key: 'wood_top:thin', x: 30, width: 40.75, z: 34, height: 2 })]);
  });

  it('places unnumbered-run tops after fallback furniture bases and before moldings', () => {
    const stored = room({ profile: { baseKind: 'furniture_base' }, walls: [wall({ runs: [
      run({ ...wood, id: 'empty', width: 30, items: [] }),
      run({ id: 'other', x: 60, width: 30, top: 'moldings', autoCount: false,
        items: [auto('box')], ends: wood.ends, overrides: { baseKind: 'toe_kick' } }),
    ] })] });
    expect(roomParts(stored, settings).map(({ key }) => key)).toEqual([
      'box', 'furniture_base:empty', 'wood_top:empty', 'molding:toeKick',
    ]);
  });
});
