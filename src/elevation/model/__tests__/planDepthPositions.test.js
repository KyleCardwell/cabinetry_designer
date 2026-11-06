import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auto, room as buildRoom, run as buildRun, wall as buildWall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { plotScale } from '../drawingScale.js';
import { elevationToPlan, planPointToWallX } from '../geometry.js';
import { planDepthPositions } from '../index.js';
import { planDimensions } from '../planDimensions.js';
import { syncRoom } from '../room.js';
import { wallSideFrame } from '../wallSides.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const settings = { ...document.settings, runFlex: 0 };
const scale = plotScale(settings);
const options = { laneShift: 0.375 * scale, gap: 0.375 * scale, margin: 0.25 * scale };
const golden = (prefix) => syncRoom(document.rooms.find(({ name }) => name.startsWith(prefix)), settings);
const depths = (room, config = settings) => planDimensions(room, config).filter(({ row }) => row === 'depth');

// Oriented text rectangles in y-up DXF coordinates; SAT handles every line angle.
function textBox(record) {
  const { start, end, text, textAt } = record;
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const along = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
  const across = [-along[1], along[0]];
  const center = textAt ?? start.map((value, i) => (value + end[i]) / 2);
  const halfWidth = text.length * 0.5 * 3 / 32 * scale / 2;
  const halfHeight = 3 / 32 * scale / 2;
  return { axes: [along, across], points: [-1, 1].flatMap((a) => [-1, 1].map((b) => center.map((v, i) => (
    v + a * halfWidth * along[i] + b * halfHeight * across[i]
  )))) };
}
function overlaps(a, b) {
  return [...a.axes, ...b.axes].every((axis) => {
    const project = (box) => box.points.map((p) => p[0] * axis[0] + p[1] * axis[1]);
    const one = project(a);
    const two = project(b);
    return Math.min(...one) < Math.max(...two) - 1e-6 && Math.min(...two) < Math.max(...one) - 1e-6;
  });
}

describe('PD2 step a shared depth positions', () => {
  it('anchor 1: separates the G6 stacked uppers and base by at least one lane', () => {
    const room = golden('G6');
    const positions = planDepthPositions(room, settings, options);
    const xs = ['ea4373', 'b1ec1b', '677ec7'].map((prefix) => (
      positions.get(room.walls.flatMap(({ runs }) => runs).find(({ id }) => id.startsWith(prefix)).id).x
    ));
    expect(xs).toEqual([41.5, 32.5, 50.5]);
    for (let i = 0; i < xs.length; i += 1) {
      for (const x of xs.slice(i + 1)) expect(Math.abs(xs[i] - x)).toBeGreaterThanOrEqual(options.gap);
    }
  });

  it('anchor 2: keeps every G6 DXF depth text box clear of every other', () => {
    const boxes = depths(golden('G6')).map(textBox);
    for (let i = 0; i < boxes.length; i += 1) {
      for (const box of boxes.slice(i + 1)) expect(overlaps(boxes[i], box)).toBe(false);
    }
  });

  it.each([['G2', '4b49c0', '2c8ab1'], ['G1', '19d681', 'ea6e45']])(
    'anchors 3–4: %s pairs its island bases at the overlap middle into one two-segment chain',
    (name, frontPrefix, backPrefix) => {
      const room = golden(name);
      const wall = room.walls.find(({ runs }) => runs.some(({ id }) => id.startsWith(frontPrefix)));
      const front = wall.runs.find(({ id }) => id.startsWith(frontPrefix));
      const back = wall.runs.find(({ id }) => id.startsWith(backPrefix));
      const frontFrame = wallSideFrame(room, wall, 'front');
      const backFrame = wallSideFrame(room, wall, 'back');
      const backXs = [back.x, back.x + back.width].map((x) => (
        planPointToWallX(frontFrame, elevationToPlan(backFrame, x, 0))
      ));
      const middle = (Math.max(front.x, Math.min(...backXs))
        + Math.min(front.x + front.width, Math.max(...backXs))) / 2;
      const positions = planDepthPositions(room, settings, options);
      const pair = { front: front.id, back: back.id };
      expect(positions.get(front.id)).toEqual({ x: middle, pair });
      expect(positions.get(back.id)).toEqual({
        x: planPointToWallX(backFrame, elevationToPlan(frontFrame, middle, 0)), pair,
      });
      const islandRecords = depths(room).filter(({ start, end }) => [start, end].every(([x, y]) => (
        Math.abs(planPointToWallX(frontFrame, { x, y: -y }) - middle) < 1e-6
      )));
      expect(islandRecords).toHaveLength(2);
      expect(islandRecords.map(({ kind }) => kind)).toEqual(['depth', 'depth']);
      expect([islandRecords[0].start, islandRecords[0].end].some((point) => (
        JSON.stringify(point) === JSON.stringify(islandRecords[1].start)
          || JSON.stringify(point) === JSON.stringify(islandRecords[1].end)
      ))).toBe(true);
      expect(depths(room)).toHaveLength(name === 'G1' ? 7 : 5);
    },
  );

  it('anchor 5: preserves the captured pre-PD2 depth records in G3, G4 and G5', () => {
    // Captured with npm test's 5276-test baseline, before changing planDimensions.
    expect(['G3', 'G4', 'G5'].map((name) => depths(golden(name)))).toEqual([
      [
        { row: 'depth', kind: 'depth', start: [-66, -12.875], end: [-66, 9], offset: 0, text: '21 7/8' },
        { row: 'depth', kind: 'depth', start: [-75, -15], end: [-75, 9], offset: 0, text: '24' },
      ],
      [{ row: 'depth', kind: 'depth', start: [15.5, -2.3125], end: [15.5, 22.5], offset: 0, text: '24 13/16' }],
      [
        { row: 'depth', kind: 'depth', start: [-88.875, -9.875], end: [-88.875, 15], offset: 0, text: '24 7/8' },
        { row: 'depth', kind: 'depth', start: [-48.875, 2.125], end: [-48.875, 27], offset: 0, text: '24 7/8' },
        { row: 'depth', kind: 'depth', start: [54, 17.125], end: [54, 39], offset: 0, text: '21 7/8' },
      ],
    ]);
  });

  it('anchor 6: chains 12, 4.5 and 24 inches in order from the back on a thick wall', () => {
    const room = buildRoom({ walls: [buildWall({ x1: 0, y1: 0, x2: 60, y2: 0, thickness: 4.5, runs: [
      buildRun({ id: 'front', x: 0, width: 60, depth: 24, items: [{ ...auto('f'), kind: 'panel' }] }),
      buildRun({ id: 'back', x: 10, width: 40, depth: 12, wallSide: 'back', items: [{ ...auto('b'), kind: 'panel' }] }),
    ] })] });
    const positions = planDepthPositions(room, DEFAULT_SETTINGS, options);
    expect(positions.get('front')).toEqual({ x: 30, pair: { front: 'front', back: 'back' } });
    expect(positions.get('back')).toEqual({ x: 30, pair: { front: 'front', back: 'back' } });
    const records = depths(room, DEFAULT_SETTINGS);
    expect(records.map(({ kind, start, end }) => [kind, Math.hypot(end[0] - start[0], end[1] - start[1])]))
      .toEqual([['depth', 12], ['wall', 4.5], ['depth', 24]]);
    expect(records.map(({ start, end }) => [start, end])).toEqual([
      [[30, 4.5], [30, 16.5]], [[30, 0], [30, 4.5]], [[30, -24], [30, 0]],
    ]);
    expect(records[1]).toHaveProperty('textAt');
  });

  it('anchor 7: reserves a narrow upper\'s clamped preferred point before moving the wide base', () => {
    const room = buildRoom({ walls: [buildWall({ runs: [
      buildRun({ id: 'base', x: 0, width: 100 }),
      buildRun({ id: 'upper', x: 40, width: 12, cabinetTypeId: CABINET_TYPE_IDS.UPPER }),
    ] })] });
    const positions = planDepthPositions(room, settings, options);
    expect(positions.get('upper')).toEqual({ x: 46 });
    expect(positions.get('base')).toEqual({ x: 56.75 });
  });

  it('keeps left-first lane and wall-order ties, falling back when a face is packed and skipping empty runs', () => {
    const room = buildRoom({ walls: [buildWall({ runs: [
      buildRun({ id: 'upper', width: 40, cabinetTypeId: CABINET_TYPE_IDS.UPPER }),
      buildRun({ id: 'base', width: 40 }),
      buildRun({ id: 'other', width: 40, cabinetTypeId: 'other' }),
      buildRun({ id: 'tall', width: 40, cabinetTypeId: CABINET_TYPE_IDS.TALL }),
      buildRun({ id: 'empty', width: 0 }), buildRun({ id: 'flat', depth: 0 }),
    ] })] });
    const positions = planDepthPositions(room, settings, { laneShift: 0, gap: 10, margin: 5 });
    expect([...positions]).toEqual([
      ['base', { x: 20 }], ['other', { x: 10 }], ['upper', { x: 30 }], ['tall', { x: 20 }],
    ]);
  });

  it('aligns both upper lanes in front x on angled and flipped island walls', () => {
    for (const flipped of [false, true]) {
      const room = buildRoom({ walls: [buildWall({
        x1: 0, y1: 0, x2: 60, y2: 80, thickness: 4.5, flipped,
        runs: ['front', 'back'].flatMap((wallSide) => [
          buildRun({ id: `${wallSide}-base`, wallSide, width: 100 }),
          buildRun({ id: `${wallSide}-upper`, wallSide, width: 100, cabinetTypeId: CABINET_TYPE_IDS.UPPER }),
        ]),
      })] });
      const wall = room.walls[0];
      const front = wallSideFrame(room, wall, 'front');
      const back = wallSideFrame(room, wall, 'back');
      const positions = planDepthPositions(room, settings, options);
      expect(positions.get('front-base').pair).toEqual({ front: 'front-base', back: 'back-base' });
      for (const type of ['base', 'upper']) {
        const frontX = positions.get(`front-${type}`).x;
        const backX = positions.get(`back-${type}`).x;
        expect(planPointToWallX(front, elevationToPlan(back, backX, 0))).toBeCloseTo(frontX);
      }
      expect(positions.get('front-upper').x).toBeCloseTo(50 - options.laneShift);
      const before = structuredClone(room);
      planDimensions(room, settings);
      expect(room).toEqual(before);
    }
  });

  it('uses all-run overlap when base overlap is too small, and independent faces without any overlap', () => {
    const room = buildRoom({ walls: [buildWall({ x1: 0, y1: 0, x2: 100, y2: 0, thickness: 0, runs: [
      buildRun({ id: 'front', width: 40 }),
      buildRun({ id: 'back', wallSide: 'back', width: 62 }),
      buildRun({ id: 'upper', x: 0, width: 100, cabinetTypeId: CABINET_TYPE_IDS.UPPER }),
    ] })] });
    const positions = planDepthPositions(room, settings, options);
    // Base spans overlap only at 38..40 (< 2 * margin); all runs overlap at 38..100.
    expect(positions.get('upper').x).toBe(69 - options.laneShift);
    room.walls[0].runs.pop();
    room.walls[0].runs[1].width = 20;
    expect([...planDepthPositions(room, settings, options)]).toEqual([
      ['front', { x: 20 }], ['back', { x: 10 }],
    ]);
  });

});
