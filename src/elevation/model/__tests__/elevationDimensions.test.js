import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { elevationDimensions, placeLabels } from '../elevationDimensions.js';
import { flipRunsForWall, syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';
import { updateRootItem } from '../grid.js';
import { runStepSides } from '../columnSteps.js';
import { runScene } from '../runScene.js';
import { topSegmentRoom, topSegmentSettings } from './fixtures/topSegments.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
// Keep these layout anchors independent of run flex (RF3).
const settings = { ...document.settings, runFlex: 0 };
const room = (name) => syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);
const row = ({
  row: name, kind, start, end, base, at, text, textX, textZ,
}) => [name, kind, start, end, base, at, text, ...(textX === undefined ? [] : [textX, textZ])];

/** The rows below and above the wall only (SPEC-43.2 adds vertical columns, SPEC-43.3 cell chains and callouts). */
const ROWS = ['lower.inner', 'lower.outer', 'openings', 'wall', 'upper.inner', 'upper.outer'];
const horizontal = (dimensions) => dimensions.filter(({ row: name }) => ROWS.includes(name));

describe('ST6 step b internal step dimensions', () => {
  const manual = (value) => ({ value, source: 'manual' });
  function fixture(offsets = {}, overrides = {}) {
    const room = topSegmentRoom({ topSegments: [], ...overrides });
    const run = room.walls[0].runs[0];
    for (const [id, fields] of Object.entries(offsets)) {
      run.grid = updateRootItem(run.grid, id, fields);
    }
    return room;
  }
  function dimensions(room, settings = topSegmentSettings, side = 'front') {
    return elevationDimensions(room, room.walls[0], side, settings).filter(({ row }) => row === 'steps');
  }

  it.each([
    ['1: B top 2', { B: { top: manual(2) } }, [[30, 32.5, 34.5, 1], [60, 32.5, 34.5, -1]]],
    ['2: B bottom 3', { B: { bottom: manual(3) } }, [[30, 4, 7, 1], [60, 4, 7, -1]]],
    ['3: A top 2', { A: { top: manual(2) } }, [[30, 32.5, 34.5, -1]]],
    ['4: A top 2, B top 3', { A: { top: manual(2) }, B: { top: manual(3) } },
      [[30, 31.5, 32.5, 1], [60, 31.5, 34.5, -1]]],
  ])('anchor %s: measures once per internal boundary, inset into the shorter side', (_, offsets, expected) => {
    const room = fixture(offsets);
    const wall = room.walls[0];
    const run = wall.runs[0];
    const before = structuredClone(room);
    expect(runStepSides(run, runScene(room, wall, run, topSegmentSettings).result)
      .map(({ x, start, end, direction }) => [x, start, end, direction])).toEqual(expected);
    for (const scale of [24, 48]) {
      expect(dimensions(room, { ...topSegmentSettings, plotScale: scale })).toEqual(
        expected.map(([x, start, end, direction]) => {
          const at = x + direction * 0.25 * scale;
          return { row: 'steps', kind: 'step', orientation: 'vertical', start, end, base: at, at,
            text: String(end - start), textX: at + direction * 0.15625 * scale, textZ: (start + end) / 2 };
        }),
      );
    }
    expect(room).toEqual(before);
  });

  it('anchor 5: has no step row without steps and preserves all golden dimensions', () => {
    expect(dimensions(fixture())).toEqual([]);
    for (const original of document.rooms) {
      const synced = syncRoom(original, settings);
      for (const wall of synced.walls) {
        for (const side of ['front', 'back']) expect(dimensions({ ...synced, walls: [wall] }, settings, side)).toEqual([]);
      }
    }
  });

  it('uses accepted root box bounds for both edges, nested grids, equal drops and rejected offsets', () => {
    const room = fixture({ B: { top: manual(2), bottom: manual(3) } });
    room.walls[0].runs[0].grid.cells[1].node = {
      id: 'B', cols: [{ id: 'B:c', size: null, sizeMode: 'auto' }],
      rows: [{ id: 'B:t', size: 6, sizeMode: 'manual' }, { id: 'B:b', size: null, sizeMode: 'auto' }],
      cells: ['B-top', 'B-bottom'].map((id, row) => ({ col: 0, row, colSpan: 1, rowSpan: 1,
        node: { id, kind: 'cabinet', face: { type: 'door' } } })),
    };
    expect(dimensions(room).map(({ start, end }) => [start, end])).toEqual([[32.5, 34.5], [4, 7], [32.5, 34.5], [4, 7]]);
    expect(dimensions(fixture({ B: { top: manual(29.75) } }))).toEqual([]);
    expect(dimensions(fixture(Object.fromEntries(['A', 'B', 'C'].map((id) => [id, { top: manual(2) }]))))).toEqual([]);
    const separated = fixture({ B: { top: manual(2) } });
    separated.walls[0].runs[0].grid.cells[0].node.kind = 'void';
    expect(dimensions(separated)).toHaveLength(1);
  });

  it('measures segment drops on Euro and face frame runs and mirrors the lower side when flipped', () => {
    for (const cabinetStyleId of [13, 14]) {
      const room = topSegmentRoom({ style: { cabinetStyleId }, seamGap: 0 });
      const steps = dimensions(room);
      expect(steps.map(({ start, end }) => [start, end])).toEqual([[32.5, 34.5], [32.5, 34.5]]);
    }
    const room = fixture({ A: { top: manual(2) } });
    room.walls[0] = flipRunsForWall(room.walls[0]);
    expect(dimensions(room)).toEqual([
      { row: 'steps', kind: 'step', orientation: 'vertical', start: 32.5, end: 34.5,
        base: 96, at: 96, text: '2', textX: 99.75, textZ: 33.5 },
    ]);
  });
});

describe('DM7 centred dimension text', () => {
  it.each([
    [30, 3.15, true],
    [8, 1.575, true],
    [7, 1.575, false],
  ])('anchor: segment %s has width %s and fits = %s at 1:24', (length, width, fits) => {
    const { placed: [label], levels } = placeLabels([{ start: 0, end: length }], -9, -1, 24);
    expect(label.width).toBeCloseTo(width, 10);
    expect(label.fits).toBe(fits);
    expect(levels).toBe(fits ? 0 : 1);
    if (fits) {
      expect(label.along).toBeUndefined();
      expect(label.across).toBeUndefined();
    } else {
      expect([label.along, label.across]).toEqual([3.5, -12.75]);
    }
  });

  it('anchor 4: levels start and advance by height + gap on either side, scaled to the drawing', () => {
    for (const scale of [24, 48]) {
      for (const outward of [-1, 1]) {
        const { placed, levels, step } = placeLabels([
          { start: 0, end: 1, text: '7' },
          { start: 1, end: 2, text: '7' },
        ], -9, outward, scale);
        expect(levels).toBe(2);
        expect(step).toBe(3.75 * scale / 24);
        expect(placed.map(({ across }) => across)).toEqual([
          -9 + outward * 3.75 * scale / 24,
          -9 + outward * 7.5 * scale / 24,
        ]);
      }
    }
    // The rule includes equality and scales both remaining line lengths with the plot scale.
    for (const scale of [24, 48]) {
      const required = 7.575 * scale / 24;
      const { placed } = placeLabels([
        { start: 0, end: required, text: '8' },
        { start: 0, end: required - 0.001, text: '8' },
      ], 0, 1, scale);
      expect(placed.map(({ fits }) => fits)).toEqual([true, false]);
    }
  });
});

describe('SPEC-43 elevation dimensions', () => {
  it('SPEC-50.15 step 522 anchors: estimates Arial widths, fits a 10-inch segment and keeps a 3-inch filler moved out', () => {
    const { placed, levels, step } = placeLabels([
      { kind: 'piece', start: 0, end: 24.875, text: '24 7/8' },
      { kind: 'piece', start: 24.875, end: 34.875, text: '10' },
      { kind: 'filler', start: 34.875, end: 37.875, text: '3' },
    ], -9, -1, 24);
    expect(placed[0].width).toBeCloseTo(9.45, 10);
    expect(placed[0].fits).toBe(true);
    expect(placed[1].width).toBeCloseTo(3.15, 10);
    expect(placed[1].fits).toBe(true);
    expect(placed[1].along).toBeUndefined();
    expect(placed[1].across).toBeUndefined();
    expect(placed[2].fits).toBe(false);
    expect([placed[2].along, placed[2].across]).toEqual([36.375, -12.75]);
    expect(levels).toBe(1);
    expect(step).toBe(3.75);
  });

  it('dimensions every segment of the canvas\'s chains; text that doesn\'t fit moves off the line (G1 elevation A)', () => {
    const g1 = room('G1 Euro kitchen');
    expect(horizontal(elevationDimensions(g1, g1.walls[0], 'front', settings)).map(row)).toEqual([
      ['lower.inner', 'piece', 0, 0.8125, 0, -9, '13/16', 0.40625, -12.75],
      ['lower.inner', 'piece', 0.8125, 29.25, 0, -9, '28 7/16'],
      ['lower.inner', 'piece', 29.25, 30, 0, -9, '3/4', 29.625, -12.75],
      ['lower.inner', 'piece', 30, 54, 0, -9, '24'],
      ['lower.inner', 'piece', 54, 90, 0, -9, '36'],
      ['lower.inner', 'piece', 90, 115.5, 0, -9, '25 1/2'],
      ['lower.inner', 'piece', 115.5, 141, 0, -9, '25 1/2'],
      ['lower.inner', 'piece', 141, 143.125, 0, -9, '2 1/8', 142.0625, -12.75],
      ['lower.inner', 'corner-gap', 143.125, 168, 0, -9, '24 7/8'],
      // DM3: the tall and base runs touch, one segment corner to corner, so no wall row; no openings row.
      ['lower.outer', 'run', 0, 168, 0, -21.75, '168'],
      ['upper.inner', 'tall-span', 0, 30, 96, 105, '30'],
      ['upper.inner', 'piece', 108.5, 109.3125, 96, 105, '13/16', 108.90625, 108.75],
      ['upper.inner', 'piece', 109.3125, 131.3125, 96, 105, '22'],
      ['upper.inner', 'piece', 131.3125, 153.3125, 96, 105, '22'],
      ['upper.inner', 'piece', 153.3125, 155.125, 96, 105, '1 13/16', 154.21875, 108.75],
      ['upper.inner', 'corner-gap', 155.125, 168, 96, 105, '12 7/8', 161.5625, 112.5],
      ['upper.outer', 'tall-span', 0, 30, 96, 121.5, '30'],
      ['upper.outer', 'open', 30, 108.5, 96, 121.5, '78 1/2'],
      ['upper.outer', 'run', 108.5, 168, 96, 121.5, '59 1/2'],
    ]);
  });

  it('stacks moved text in levels so neighbours clear, and spaces by the plot scale (G1 elevation B at 1/4" = 1\'-0")', () => {
    const g1 = room('G1 Euro kitchen');
    const dimensions = horizontal(elevationDimensions(g1, g1.walls[1], 'front', { ...settings, plotScale: 48 }));
    // No openings: the wall row takes no space. At 1:48 rows are 18" apart, plus 7 1/2" per level of moved text.
    expect([...new Set(dimensions.map(({ row: name, at }) => `${name} ${at}`))]).toEqual([
      'lower.inner -18', 'lower.outer -51', 'upper.inner 114', 'upper.outer 147',
    ]);
    // Arial's 24 7/8" label needs 30.9" including gaps and minimum line lengths.
    // It moves out and the adjacent filler stacks.
    expect(dimensions.filter(({ row: name, textX }) => name === 'lower.inner' && textX !== undefined).map(row)).toEqual([
      ['lower.inner', 'corner-gap', 0, 24.875, 0, -18, '24 7/8', 12.4375, -25.5],
      ['lower.inner', 'piece', 24.875, 26.6875, 0, -18, '1 13/16', 25.78125, -33],
      ['lower.inner', 'piece', 26.6875, 57.1875, 0, -18, '30 1/2', 41.9375, -25.5],
      ['lower.inner', 'piece', 57.1875, 87.6875, 0, -18, '30 1/2', 72.4375, -25.5],
      ['lower.inner', 'piece', 87.6875, 118.1875, 0, -18, '30 1/2', 102.9375, -25.5],
      ['lower.inner', 'piece', 118.1875, 120, 0, -18, '1 13/16', 119.09375, -33],
    ]);
    // Above the wall the 12 7/8" and the 1 13/16" beside it would overlap: the second goes a level further out.
    expect(dimensions.filter(({ row: name, textX }) => name === 'upper.inner' && textX !== undefined).map(row)).toEqual([
      ['upper.inner', 'corner-gap', 0, 12.875, 96, 114, '12 7/8', 6.4375, 121.5],
      ['upper.inner', 'piece', 12.875, 14.6875, 96, 114, '1 13/16', 13.78125, 129],
      ['upper.inner', 'piece', 118.1875, 120, 96, 114, '1 13/16', 119.09375, 121.5],
    ]);
    expect(dimensions).toHaveLength(14);
  });

  it('DM3: dimensions the wall below when there are no uppers; recesses only on faces without runs (G1 island, G5)', () => {
    const g1 = room('G1 Euro kitchen');
    expect(horizontal(elevationDimensions(g1, g1.walls[3], 'back', settings)).map(row).slice(3)).toEqual([
      ['lower.outer', 'open', 0, 0.8125, 0, -18, '13/16', 0.40625, -21.75],
      ['lower.outer', 'run', 0.8125, 90.6875, 0, -18, '89 7/8'],
      ['lower.outer', 'open', 90.6875, 91.5, 0, -18, '13/16', 91.09375, -21.75],
      ['wall', 'wall', 0, 91.5, 0, -30.75, '91 1/2'],
    ]);
    const g5 = room('G5 Recess room');
    expect(elevationDimensions(g5, g5.walls[1], 'front', settings)
      .filter(({ row: name }) => name === 'openings' || name === 'wall').map(row)).toEqual([
      ['wall', 'wall', 0, 200, 0, -30.75, '200'],
    ]);
    const bare = structuredClone(document.rooms.find(({ name }) => name === 'G5 Recess room'));
    bare.walls[1].runs = [];
    const g5Bare = syncRoom(bare, settings);
    expect(elevationDimensions(g5Bare, g5Bare.walls[1], 'front', settings)
      .filter(({ row: name }) => name === 'openings').map(row)).toEqual([
      ['openings', 'gap', 0, 32, 0, -18, '32'],
      ['openings', 'recess', 32, 80, 0, -18, '48'],
      ['openings', 'gap', 80, 140, 0, -18, '60'],
      ['openings', 'recess', 140, 188, 0, -18, '48'],
      ['openings', 'gap', 188, 200, 0, -18, '12'],
    ]);
  });
});
