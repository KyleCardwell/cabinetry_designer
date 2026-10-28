import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { opening, room as buildRoom, run as buildRun, wall as buildWall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS } from '../constants.js';
import { planMarks } from '../planMarks.js';
import { wallFrame } from '../geometry.js';
import { wallEndPanelPolygon, wallEndPanels } from '../wallEndPanels.js';
import { planDimensions, planSideReach } from '../planDimensions.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
// Keep these layout anchors independent of run flex (RF3).
const settings = { ...document.settings, runFlex: 0 };
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const dimensions = (room) => planDimensions(syncRoom(room, settings), settings);
const WALL_ROWS = ['front', 'back', 'wall'];
const wallRows = (room) => dimensions(room).filter(({ row }) => WALL_ROWS.includes(row));
const wall = (start, end, offset, text) => ({ row: 'wall', kind: 'wall', start, end, offset, text });

describe('SPEC-45 plan dimensions: each wall\'s length and the rows along its faces', () => {
  it('dimensions the window row, then the length, 3/8" (paper) apart outside each wall (G1)', () => {
    expect(wallRows(stored('G1 Euro kitchen'))).toEqual([
      { row: 'front', kind: 'space', start: [-64.5, -84], end: [-64.5, -39], offset: 9, text: '45' },
      { row: 'front', kind: 'opening', start: [-64.5, -39], end: [-64.5, 15], offset: 9, text: '54' },
      { row: 'front', kind: 'space', start: [-64.5, 15], end: [-64.5, 84], offset: 9, text: '69' },
      wall([-64.5, -84], [-64.5, 84], 18, '168'),
      wall([-60, 88.5], [60, 88.5], 9, '120'),
      wall([64.5, 57], [64.5, 84], -9, '27'),
      // The island has no thickness: the row base is at its back runs (12 7/8" deep).
      wall([9.5, -16.75], [101, -16.75], -9, '91 1/2'),
    ]);
  });

  it('moves text that doesn\'t fit off the line and the next row out past it (G2, G3)', () => {
    expect(wallRows(stored('G2 Face frame kitchen'))).toEqual([
      { row: 'front', kind: 'space', start: [-86, 19.5], end: [-84, 19.5], offset: 9, text: '2', textAt: [-85, 32.25] },
      { row: 'front', kind: 'opening', start: [-84, 19.5], end: [-42, 19.5], offset: 9, text: '42' },
      { row: 'front', kind: 'space', start: [-42, 19.5], end: [86, 19.5], offset: 9, text: '128' },
      wall([-86, 19.5], [86, 19.5], 21.75, '172'),
      wall([86.75, -63.5], [86.75, 15], -9, '78 1/2'),
    ]);
    expect(dimensions(stored('G3 Bath alcove')).filter(({ row }) => row === 'front')).toEqual([
      { row: 'front', kind: 'space', start: [-102, 13.5], end: [-30, 13.5], offset: 9, text: '72' },
      { row: 'front', kind: 'landing', start: [-30, 13.5], end: [-25.5, 13.5], offset: 9, text: '4 1/2', textAt: [-27.75, 26.25] },
      { row: 'front', kind: 'space', start: [-25.5, 13.5], end: [66, 13.5], offset: 9, text: '91 1/2' },
    ]);
  });

  it('starts the rows past the deepest recess bump-out (G5)', () => {
    const rows = wallRows(stored('G5 Recess room'));
    expect(rows.map(({ row, kind, start, end, offset }) => [row, kind, start[0], end[0], start[1], offset])).toEqual([
      ['wall', 'wall', -114.5, -114.5, -15, 9],
      ['front', 'space', -110, -78, 43.5, 9],
      ['front', 'recess', -78, -30, 43.5, 9],
      ['front', 'space', -30, 30, 43.5, 9],
      ['front', 'recess', 30, 78, 43.5, 9],
      ['front', 'space', 78, 90, 43.5, 9],
      ['wall', 'wall', -110, 90, 43.5, 18],
      ['wall', 'wall', 94.5, 94.5, -15, -9],
    ]);
  });

  it('dimensions a wing wall on a back face on the room side, past the front runs (G3, wing moved behind)', () => {
    const room = structuredClone(stored('G3 Bath alcove'));
    Object.assign(room.walls[2], { x1: -30, y1: -13.5, x2: -30, y2: -43.5 });
    room.walls[2].landings.start = { ...room.walls[2].landings.start, side: 'back' };
    expect(dimensions(room).filter(({ row }) => row === 'back')).toEqual([
      { row: 'back', kind: 'space', start: [-6, -15], end: [66, -15], offset: -9, text: '72' },
      { row: 'back', kind: 'landing', start: [-10.5, -15], end: [-6, -15], offset: -9, text: '4 1/2', textAt: [-8.25, -27.75] },
      { row: 'back', kind: 'space', start: [-102, -15], end: [-10.5, -15], offset: -9, text: '91 1/2' },
    ]);
  });

  it('always reads left to right or bottom to top, the line 3/8" out at 1/2" = 1\'-0" (every room, an angled wall)', () => {
    const angled = structuredClone(stored('G4 T-filler run'));
    angled.walls[1].x2 = 30;
    for (const room of [...document.rooms, angled]) {
      for (const { row, start, end, offset } of dimensions(room)) {
        const dx = end[0] - start[0];
        expect(dx > 1e-6 || (Math.abs(dx) <= 1e-6 && end[1] > start[1])).toBe(true);
        if (WALL_ROWS.includes(row)) expect(Math.abs(offset)).toBeGreaterThanOrEqual(9);
      }
    }
    const [, sloped] = dimensions(angled).filter(({ row }) => row === 'wall');
    expect([sloped.text, sloped.offset]).toEqual(['54 1/16', -9]);
    expect(sloped.start[0]).toBeCloseTo(33.7442, 4);
    expect(sloped.end[1]).toBeCloseTo(20.0038, 4);
  });
});

describe('SPEC-45.2 run depths in plan', () => {
  const depths = (room) => dimensions(room).filter(({ row }) => row === 'depth');
  const depth = (start, end, text, textAt) => ({
    row: 'depth', kind: 'depth', start, end, offset: 0, text, ...(textAt ? { textAt } : {}),
  });

  it('dimensions every run\'s depth on its own line: bases centred, uppers 3/8" (paper) left, talls right (G1)', () => {
    expect(depths(stored('G1 Euro kitchen'))).toEqual([
      depth([-60, -60], [-34.125, -60], '25 7/8'),
      depth([-60, 2.5625], [-35.125, 2.5625], '24 7/8'),
      depth([-60, 39.21875], [-47.125, 39.21875], '12 7/8', [-53.5625, 35.46875]),
      depth([-2.5625, 71.125], [-2.5625, 84], '12 7/8', [-6.3125, 77.5625]),
      depth([12.4375, 59.125], [12.4375, 84], '24 7/8'),
      depth([55.25, -3.875], [55.25, 21], '24 7/8'),
      depth([55.25, -16.75], [55.25, -3.875], '12 7/8', [59, -10.3125]),
    ]);
  });

  it('moves wider Arial text off the depth line (G2 upper)', () => {
    expect(depths(stored('G2 Face frame kitchen'))[2])
      .toEqual(depth([29.25, 2.1875], [29.25, 15], '12 13/16', [25.5, 8.59375]));
  });

  it('measures a recessed run from the recess back (G5)', () => {
    expect(depths(stored('G5 Recess room'))).toEqual([
      depth([-88.875, -9.875], [-88.875, 15], '24 7/8'),
      depth([-48.875, 2.125], [-48.875, 27], '24 7/8'),
      depth([54, 17.125], [54, 39], '21 7/8'),
    ]);
  });
});

describe('SPEC-45.2 clearances in plan', () => {
  const clearances = (room) => dimensions(room).filter(({ row }) => row === 'clearance');

  it('dimensions each island and aisle gap on its own line, after the depths (G1)', () => {
    const all = dimensions(stored('G1 Euro kitchen'));
    expect(all.slice(-3)).toEqual(clearances(stored('G1 Euro kitchen')));
    expect(clearances(stored('G1 Euro kitchen'))).toEqual([
      { row: 'clearance', kind: 'island', start: [62.25, 21], end: [62.25, 57], offset: 0, text: '36' },
      { row: 'clearance', kind: 'island', start: [-35.125, 2.125], end: [9.5, 2.125], offset: 0, text: '44 5/8' },
      { row: 'clearance', kind: 'aisle', start: [35.1563, 21], end: [35.1563, 59.125], offset: 0, text: '38 1/8' },
    ]);
  });

  it('has none where the canvas shows none (G2–G6)', () => {
    expect(document.rooms.slice(1).map((room) => clearances(room).length)).toEqual([0, 0, 0, 0, 0]);
  });
});

// DM1 anchors use a single 96" wall and 24" Euro base runs, independent of the golden room layouts.
function dm1Room({ back = true, window = false, panels = [] } = {}) {
  const base = (side) => buildRun({
    id: side, cabinetTypeId: CABINET_TYPE_IDS.BASE, wallSide: side,
    x: 0, width: 96, z: 4, height: 30.5, depth: 24,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    anchors: { left: true, right: true }, overrides: {},
    autoCount: false, heightMode: 'manual',
    items: [{ id: `${side}-cabinet`, kind: 'cabinet', width: null }],
  });
  return syncRoom(buildRoom({
    id: 'dm1', profile: {}, wallOrder: ['wall'],
    walls: [buildWall({
      id: 'wall', x1: 0, y1: 0, x2: 96, y2: 0, height: 96, thickness: 4.5,
      connections: { start: null, end: null }, landings: { start: null, end: null },
      endPanels: Object.fromEntries(panels.map((end) => [end, { width: 0.75 }])),
      runs: [base('front'), ...(back ? [base('back')] : [])], joints: [],
      openings: window ? [opening({
        id: 'window', label: 'W1', kind: 'window', width: 36, height: 36, sillZ: 40,
        measureMode: 'jamb', offset: 30, offsetFrom: 'left', casing: null,
      })] : [],
    })],
  }), settings);
}

// Actual y-up position of a dimension line, including its signed offset.
function lineEnds({ start, end, offset }) {
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const dx = -(end[1] - start[1]) / length * offset;
  const dy = (end[0] - start[0]) / length * offset;
  return [start, end].map(([x, y]) => [x + dx, y + dy]);
}
const dm1Rows = (room) => planDimensions(room, settings).filter(({ row }) => WALL_ROWS.includes(row));
const through = (room) => planDimensions(room, settings).filter(({ row }) => row === 'through');

describe('DM1 step a anchors', () => {
  it('1: keeps a perimeter wall row at 13 1/2 and marker A at 41 3/8', () => {
    const room = dm1Room({ back: false });
    expect(dm1Rows(room).map(lineEnds)).toEqual([[[0, 13.5], [96, 13.5]]]);
    expect(planMarks(room, settings)).toContainEqual(markerAt([48, -41.375], 'A'));
  });

  it('2: puts island rows at 38 3/8 and the back marker at 57 7/8', () => {
    const room = dm1Room();
    expect(planSideReach(room, room.walls[0], 'back', settings)).toBe(24.875);
    expect(dm1Rows(room).map(lineEnds)).toEqual([[[0, 38.375], [96, 38.375]]]);
    expect(planMarks(room, settings)).toContainEqual(markerAt([48, 57.875], 'B', [0, -1]));
    expect(through(room)).toEqual([]);
  });

  it('3: labels the window at depth -32, rows at 38 3/8 and 47 3/8, marker at 66 7/8', () => {
    const room = dm1Room({ window: true });
    const rows = dm1Rows(room);
    expect(rows.filter(({ row }) => row === 'front').map((row) => lineEnds(row)[0][1]))
      .toEqual([38.375, 38.375, 38.375]);
    expect(lineEnds(rows.find(({ row }) => row === 'wall'))[0][1]).toBe(47.375);
    expect(planMarks(room, settings)).toContainEqual({
      kind: 'label', at: [48, 32], text: 'W1 · 36"', rotation: 0,
    });
    expect(planMarks(room, settings)).toContainEqual(markerAt([48, 66.875], 'B', [0, -1]));
  });

  it('4: measures through the start panel from -29 3/8 to +24 7/8, 9 past its outer edge', () => {
    expect(through(dm1Room({ panels: ['start'] }))).toEqual([{
      row: 'through', kind: 'through', start: [-9, -24.875], end: [-9, 29.375],
      offset: 0, text: '54 1/4',
    }]);
  });

  it('5: draws only the start panel through dimension when both ends have equal totals', () => {
    expect(through(dm1Room({ panels: ['start', 'end'] })))
      .toEqual(through(dm1Room({ panels: ['start'] })));
  });

  it('deduplicates within 1/32, keeps unequal totals and handles a lone end panel', () => {
    const room = dm1Room({ panels: ['start', 'end'] });
    const wall = room.walls[0];
    // Give each end a different back run so the two panel depths can differ.
    const back = wall.runs.find((run) => run.wallSide === 'back');
    back.anchors = { left: false, right: true };
    const endRun = structuredClone(back);
    endRun.id = 'back-end';
    endRun.anchors = { left: true, right: false };
    endRun.depth += 1 / 32;
    wall.runs.push(endRun);
    expect(through(room)).toHaveLength(1);
    endRun.depth += 1 / 32;
    expect(through(room).map(({ text }) => text)).toEqual(['54 1/4', '54 5/16']);
    delete wall.endPanels.start;
    expect(through(room)).toEqual([{
      row: 'through', kind: 'through', start: [105, -24.875], end: [105, 29.4375],
      offset: 0, text: '54 5/16',
    }]);
  });

  it('places through lines beyond the panel polygon on angled and flipped walls, including end flex', () => {
    for (const flipped of [false, true]) {
      const room = dm1Room({ panels: ['end'] });
      const wall = room.walls[0];
      Object.assign(wall, { x2: 57.6, y2: 76.8, flipped, _endFlex: { end: 2 } });
      const frame = wallFrame(room, wall);
      const [panel] = wallEndPanels(room, wall, settings);
      const polygon = wallEndPanelPolygon(room, wall, panel);
      const axis = (point) => (point.x - frame.leftPoint.x) * frame.r.x
        + (point.y - frame.leftPoint.y) * frame.r.y;
      const left = panel.front.side === 'left';
      const edge = (left ? Math.min : Math.max)(...polygon.map(axis));
      const [record] = through(room);
      for (const [x, y] of lineEnds(record)) {
        expect(axis({ x, y: -y })).toBeCloseTo(edge + (left ? -9 : 9));
        const depth = (x - frame.leftPoint.x) * frame.n.x + (-y - frame.leftPoint.y) * frame.n.y;
        expect(Math.min(Math.abs(depth + 29.375), Math.abs(depth - 24.875))).toBeLessThan(1e-6);
      }
      expect(record.text).toBe('54 1/4');
    }
  });

  it('keeps markers past moved text levels on both sides', () => {
    const room = dm1Room({ window: true });
    room.walls[0].openings[0].offset = 1;
    expect(planMarks(room, settings)).toContainEqual(markerAt([48, 70.625], 'B', [0, -1]));
    room.walls[0].recesses = [{
      id: 'back-recess', label: 'R1', kind: 'recess', wallSide: 'back',
      width: 2, depth: 6, bottom: 0, height: null, offset: 30, offsetFrom: 'left',
    }];
    // Front runs reach 24 7/8; one back row, one moved-text level, then the marker's symbol.
    expect(planMarks(room, settings)).toContainEqual(markerAt([48, -57.125], 'A'));
  });

  it('labels recesses and projections past the opposite runs, including a recess bump-out', () => {
    const room = dm1Room();
    room.walls[0].recesses = [
      { id: 'front', label: 'R1', kind: 'recess', wallSide: 'front', width: 12,
        depth: 6, bottom: 0, height: null, offset: 30, offsetFrom: 'left' },
      { id: 'back', label: 'P1', kind: 'projection', wallSide: 'back', width: 12,
        depth: 6, bottom: 0, height: null, offset: 30, offsetFrom: 'left' },
    ];
    expect(planMarks(room, settings).filter(({ kind }) => kind === 'label')).toEqual([
      { kind: 'label', at: [36, 38], text: 'R1 · 12" × 6"', rotation: 0 },
      { kind: 'label', at: [60, -27.5], text: 'P1 · 12" × 6"', rotation: 0 },
    ]);
    // A bump-out deeper than the runs controls the exterior row base.
    room.walls[0].recesses[0].depth = 30;
    expect(dm1Rows(room).filter(({ row }) => row === 'front').map((row) => lineEnds(row)[0][1]))
      .toEqual([43.5, 43.5, 43.5]);
  });
});

function markerAt(at, text, direction = [0, 1]) {
  return { kind: 'elevation', at, text, direction };
}
