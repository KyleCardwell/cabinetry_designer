import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { bandParts } from '../bandParts.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { syncRoom } from '../room.js';
import { woodTopGroups } from '../woodTopGroups.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const wood = { top: 'wood', autoCount: false,
  ends: { left: { type: 'none' }, right: { type: 'none' } } };
const island = room({ walls: [wall({ id: 'island', x2: 96, thickness: 0, runs: [
  run({ ...wood, id: 'front', width: 96, items: [auto('cabinet')] }),
  run({ ...wood, id: 'back', width: 96, depth: 0.75, wallSide: 'back',
    items: [{ ...auto('back-panel'), kind: 'panel', depth: 0.75, align: 'back' }] }),
] })] });
const touching = room({ walls: [wall({ id: 'w', runs: [
  run({ ...wood, id: 'left', x: 10, width: 30, items: [auto('L')] }),
  run({ ...wood, id: 'right', x: 40, width: 30, items: [auto('R')] }),
] })] });

describe('FX4 step d wood top groups', () => {
  it('anchor 1: sizes the Room 9 wood top with its settings overrides', () => {
    const stored = JSON.parse(readFileSync(new URL('./fixtures/room9.json', import.meta.url), 'utf8'));
    const using = { ...DEFAULT_SETTINGS, ...stored.settingsOverrides };
    const groups = woodTopGroups(syncRoom(stored, using), using);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: 'wood_top:0f8a2992-b035-45af-9dcb-88e9196b28a8',
      width: 60.9375, depth: 25.625, thickness: 1.5, segment: false });
    expect(groups[0].faces).toHaveLength(1);
  });

  it('anchor 2: joins a zero-thickness island front and back panel at the same top surface', () => {
    const [group] = woodTopGroups(island, settings);
    const fronts = ['front', 'back'].map((side) => bandParts(island, island.walls[0], side, settings)
      .find(({ kind }) => kind === 'countertop').front);
    expect(woodTopGroups(island, settings)).toHaveLength(1);
    expect(group).toEqual({ key: 'wood_top:front', runIds: ['front', 'back'],
      faces: [
        { wallId: 'island', side: 'front', runIds: ['front'], x1: -0.75, x2: 96.75 },
        { wallId: 'island', side: 'back', runIds: ['back'], x1: -0.75, x2: 96.75 },
      ], width: 97.5, depth: fronts[0] + fronts[1], thickness: 1.5,
      start: -0.75, end: 96.75, wallId: 'island', segment: false });
  });

  it('anchor 3: adds wall thickness to a two-face group depth', () => {
    const stored = structuredClone(island);
    stored.walls[0].thickness = 4.5;
    const groups = woodTopGroups(stored, settings);
    expect(groups).toHaveLength(1);
    expect(groups[0].depth).toBe(woodTopGroups(island, settings)[0].depth + 4.5);
  });

  it('anchor 4: separates opposite faces whose top surfaces differ by half an inch', () => {
    const stored = structuredClone(island);
    stored.walls[0].runs[1].height -= 0.5;
    expect(woodTopGroups(stored, settings).map(({ key }) => key))
      .toEqual(['wood_top:front', 'wood_top:back']);
  });

  it('anchor 5: joins touching wood spans on one face, including the drawn outside overhangs', () => {
    expect(woodTopGroups(touching, settings)).toEqual([{
      key: 'wood_top:left', runIds: ['left', 'right'],
      faces: [{ wallId: 'w', side: 'front', runIds: ['left', 'right'], x1: 9.25, x2: 70.75 }],
      width: 61.5, depth: 25.625, thickness: 1.5, start: 9.25, end: 70.75, wallId: 'w', segment: false,
    }]);
  });

  it('anchor 6: keeps runs with a one-inch gap separate even when their overhangs overlap', () => {
    const stored = structuredClone(touching);
    stored.walls[0].runs[1].x += 1;
    expect(woodTopGroups(stored, settings).map(({ runIds }) => runIds)).toEqual([['left'], ['right']]);
  });

  it('anchor 7: excludes stone tops and handles an empty room', () => {
    const stored = structuredClone(touching);
    stored.walls[0].runs.forEach((run) => { run.top = 'stone'; });
    expect(woodTopGroups(stored, settings)).toEqual([]);
    expect(woodTopGroups(room())).toEqual([]);
  });

  it('anchor 8: keeps a wood insert in a stone top as its own band-sized part', () => {
    const stored = room({ walls: [wall({ id: 'w', runs: [run({ ...wood, id: 'r', top: 'stone',
      width: 90, items: [fixed('A', 30), fixed('B', 30), fixed('C', 30)],
      topSegments: [{ id: 'insert', from: 'B', to: 'B', kind: 'wood', drop: 2, mode: 'box' }],
    })] })] });
    expect(woodTopGroups(stored, settings)).toEqual([{
      key: 'wood_top:r:top-insert', runIds: ['r'],
      faces: [{ wallId: 'w', side: 'front', runIds: ['r'], x1: 30, x2: 60 }],
      width: 30, depth: 25.625, thickness: 3.5, start: 30, end: 60, wallId: 'w', segment: true,
    }]);
  });

  it('keeps inserts separate, ignores stone inserts, and suffixes split groups of one run', () => {
    const stored = room({ walls: [wall({ runs: [run({ ...wood, id: 'r', width: 90,
      items: [fixed('A', 30), fixed('B', 30), fixed('C', 30)], topSegments: [
        { id: 'wood', from: 'A', to: 'A', kind: 'wood', drop: 0, mode: 'box' },
        { id: 'stone', from: 'B', to: 'B', kind: 'stone', drop: 0, mode: 'box' },
      ],
    })] })] });
    expect(woodTopGroups(stored, settings).map(({ key, width, segment }) => ({ key, width, segment })))
      .toEqual([
        { key: 'wood_top:r', width: 0.75, segment: false },
        { key: 'wood_top:r:2', width: 30.75, segment: false },
        { key: 'wood_top:r:top-wood', width: 30, segment: true },
      ]);
  });

  it('uses top surface rather than underside height, with the specified height and touch tolerances', () => {
    const stored = structuredClone(touching);
    const [left, right] = stored.walls[0].runs;
    left.topOverhang = { left: 0, right: 0 };
    right.topOverhang = { left: 0, right: 0 };
    right.height -= 0.5;
    right.overrides.countertopThickness = 2;
    right.x += 1 / 64;
    right.z += 0.0000005;
    expect(woodTopGroups(stored, settings)).toHaveLength(1);
    right.z += 0.000002;
    expect(woodTopGroups(stored, settings)).toHaveLength(2);
    right.z = 4;
    right.x += 0.000002;
    expect(woodTopGroups(stored, settings)).toHaveLength(2);
  });

  it('closes links transitively, mirrors back spans, and preserves wall/face/run walk order', () => {
    const stored = room({ wallOrder: ['first', 'w'], walls: [wall({ id: 'w', x2: 120, runs: [
      run({ ...wood, id: 'right', x: 60, width: 20, items: [auto('R')] }),
      run({ ...wood, id: 'left', x: 10, width: 20, items: [auto('L')] }),
      run({ ...wood, id: 'bridge', x: 40, width: 65, wallSide: 'back', items: [auto('B')] }),
    ] }), wall({ id: 'first', runs: [run({ ...wood, id: 'first-run', items: [auto('F')] })] })] });
    const groups = woodTopGroups(stored, settings);
    expect(groups.map(({ key, runIds }) => ({ key, runIds }))).toEqual([
      { key: 'wood_top:first-run', runIds: ['first-run'] },
      { key: 'wood_top:left', runIds: ['left', 'right', 'bridge'] },
    ]);
    expect(groups[1].faces[1]).toEqual({ wallId: 'w', side: 'back', runIds: ['bridge'], x1: 14.25, x2: 80.75 });
  });

  it('requires overlap across faces and never links different walls', () => {
    const stored = room({ walls: [wall({ id: 'w', x2: 120, runs: [
      run({ ...wood, id: 'front', width: 30, items: [auto('F')], topOverhang: { left: 0, right: 0 } }),
      run({ ...wood, id: 'back', x: 60, width: 30, wallSide: 'back', items: [auto('B')],
        topOverhang: { left: 0, right: 0 } }),
    ] }), wall({ id: 'other', runs: [run({ ...wood, id: 'other-run', items: [auto('O')] })] })] });
    expect(woodTopGroups(stored, settings)).toHaveLength(3);
    stored.walls[0].runs[1].x += 1;
    expect(woodTopGroups(stored, settings)).toHaveLength(2);
  });

  it('includes back overhangs in single-face depth and excludes waterfall leg height from thickness', () => {
    const stored = room({ walls: [wall({ runs: [run({ ...wood, width: 60, items: [auto('C')],
      topOverhang: { back: 3 }, waterfall: { left: {}, right: {} },
    })] })] });
    expect(woodTopGroups(stored, settings)[0]).toMatchObject({ width: 63, depth: 28.625, thickness: 1.5 });
  });
});
