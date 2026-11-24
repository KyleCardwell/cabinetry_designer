import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { plotScale } from '../drawingScale.js';
import { planClearances } from '../clearances.js';
import { toDrawingPayload } from '../drawingPayload.js';
import { boxesOverlap, lineHitsBox } from '../planBoxes.js';
import { placePlanMarks } from '../planMarkPlacement.js';
import { planMarkPlacementInput } from '../planMarks.js';
import { placePlanClearance, planDimensions, planPlacedClearances } from '../planDimensions.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';
import { goldenRooms } from './helpers/goldenRooms.js';

const document = normalizeElevationDocument(JSON.parse(readFileSync(
  new URL('./fixtures/golden.json', import.meta.url), 'utf8',
)));
const fixtures = Object.values(import.meta.glob('./fixtures/room*.json', { eager: true, import: 'default' }));
const { settings } = document;
const golden = (prefix) => syncRoom(document.rooms.find(({ name }) => name.startsWith(prefix)), settings);

// Independent guard geometry: oriented DXF text rectangles and offset dimension lines, y up.
function geometry({ start, end, offset, text, textAt }, scale) {
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const u = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
  const v = [-u[1], u[0]];
  const line = [start, end].map(([x, y]) => [x + v[0] * offset, y + v[1] * offset]);
  const center = textAt ?? line[0].map((value, i) => (value + line[1][i]) / 2);
  const h = 3 / 32 * scale;
  const half = [text.length * 0.5 * h / 2, h / 2];
  const axes = [u, v];
  const corners = [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([a, b]) => (
    center.map((value, i) => value + a * u[i] * half[0] + b * v[i] * half[1])
  ));
  return { line, center, axes, half, corners };
}
const dot = (point, axis) => point[0] * axis[0] + point[1] * axis[1];
function overlaps(a, b) {
  return [...a.axes, ...b.axes].every((axis) => {
    const one = a.corners.map((p) => dot(p, axis));
    const two = b.corners.map((p) => dot(p, axis));
    return Math.min(Math.max(...one), Math.max(...two))
      > Math.max(Math.min(...one), Math.min(...two)) + 1e-6;
  });
}
function lineThroughText(line, box) {
  return Array.from({ length: 51 }, (_, i) => i / 50).some((t) => {
    const point = line[0].map((value, i) => value + t * (line[1][i] - value) - box.center[i]);
    return box.axes.every((axis, i) => Math.abs(dot(point, axis)) < box.half[i] - 1e-6);
  });
}
const conflicts = (a, b) => overlaps(a, b) || lineThroughText(a.line, b) || lineThroughText(b.line, a);

it('clears golden plan marks and moved text except named candidate fallbacks (GC5.2)', () => {
  const fallbacks = {};
  const expectedFallbacks = {
    N1: [{ text: '13/16', hits: 1 }, { text: '4 1/2', hits: 2 }],
    N3: [{ text: '12 7/8', hits: 1 }],
    N4: [{ text: 'E', hits: 2 }, { text: 'G', hits: 2 }],
  };
  for (const { key, load } of goldenRooms()) {
    const { room, settings } = load();
    const { plan } = toDrawingPayload(syncRoom(room, settings), settings);
    const scale = plotScale(settings);
    const { items, blockers } = planMarkPlacementInput(plan.dimensions, plan.marks, plan.parts, scale);
    const placed = placePlanMarks(items.map((item) => ({ ...item, steps: [[0, 0]] })), blockers, { gap: scale / 16 });
    const found = placed.filter(({ hits }) => hits > 0).map(({ key, hits }) => ({
      text: key.startsWith('mark:') ? plan.marks[Number(key.split(':')[1])].text
        : plan.dimensions[Number(key.split(':')[1])].text,
      hits,
    }));
    if (found.length) fallbacks[key] = found;

    // Audit the final geometry independently of the candidate builder, including later items.
    const grow = (box) => ({ ...box, half: box.half.map((h) => h + scale / 32) });
    const dimensions = plan.dimensions.map((record) => grow(geometry(record, scale)));
    const movable = plan.dimensions.flatMap((record, i) => (record.textAt
      ? [{ key: `dimension:${i}`, box: dimensions[i], own: i }] : []));
    plan.marks.forEach((mark, i) => {
      const angle = (mark.rotation ?? 0) * Math.PI / 180;
      const u = mark.direction ?? [Math.cos(angle), Math.sin(angle)];
      const v = [-u[1], u[0]];
      const marker = mark.kind === 'elevation';
      movable.push({ key: `mark:${i}`, box: grow({
        center: mark.at.map((value, axis) => value + (marker ? u[axis] * 0.1 * scale : 0)),
        axes: [u, v], half: marker ? [0.35 * scale, 0.375 * scale]
          : [mark.text.length * 0.5 * (3 / 32) * scale / 2, (3 / 32) * scale / 2],
      }) });
    });
    const fallbackKeys = new Set(placed.filter(({ hits }) => hits > 0).map(({ key }) => key));
    for (let i = 0; i < movable.length; i += 1) {
      const item = movable[i];
      if (fallbackKeys.has(item.key)) continue;
      const context = `${key} ${item.key}`;
      for (const other of movable.slice(i + 1)) {
        if (!fallbackKeys.has(other.key)) expect(boxesOverlap(item.box, other.box), context).toBe(false);
      }
      plan.dimensions.forEach((record, j) => {
        if (item.own === j) return;
        if (!record.textAt) expect(boxesOverlap(item.box, dimensions[j]), context).toBe(false);
        for (const line of [dimensions[j].line,
          [record.start, dimensions[j].line[0]], [record.end, dimensions[j].line[1]]]) {
          expect(lineHitsBox(line, item.box), context).toBe(false);
        }
      });
      for (const { points, closed, kind } of plan.parts) {
        const loop = closed === false ? points : [...points, points[0]];
        let winding = 0;
        for (let j = 1; j < loop.length; j += 1) {
          const line = [loop[j - 1], loop[j]];
          expect(lineHitsBox(line, item.box), context).toBe(false);
          const [a, b] = line.map((p) => p.map((value, axis) => value - item.box.center[axis]));
          winding += Math.atan2(a[0] * b[1] - a[1] * b[0], dot(a, b));
        }
        if (closed !== false && !(kind === 'cabinet' && plan.dimensions[item.own]?.row === 'depth')) {
          expect(Math.abs(winding), context).toBeLessThan(Math.PI);
        }
      }
    }
  }
  expect(fallbacks).toEqual(expectedFallbacks);
});

it('places blocked depth text over cabinets but counts edges and wall and projection interiors (GC5.2)', () => {
  const dimension = { row: 'depth', start: [0, -6], end: [0, 6], offset: 0,
    text: '12 7/8', textAt: [0, 0] };
  const points = [[-30, -30], [30, -30], [30, 30], [-30, 30]];
  for (const kind of ['cabinet', 'wall', 'projection']) {
    const { items, blockers } = planMarkPlacementInput([dimension], [], [{ kind, points }], 1);
    blockers.lines.push([[-2, 0], [2, 0]]);
    const placed = placePlanMarks(items.map((item) => ({ ...item,
      steps: [[29.96875, 0], [0, 0], [6, 0], [12, 0]],
    })), blockers, { gap: 1 / 16 });
    expect(placed, kind).toEqual([{ key: 'dimension:0',
      at: [6, 0], hits: kind === 'cabinet' ? 0 : 1,
    }]);
  }
});

it('all golden and fixture dimensions clear other text, except Room 8 wall rows 28 / 36 (PD3)', () => {
  const inputs = [
    ...document.rooms.map((room) => ({ room, settings })),
    ...fixtures.map((room) => ({ room, settings: { ...DEFAULT_SETTINGS, ...room.settingsOverrides } })),
  ];
  // The two outside wall rows cross at a corner; explicitly deferred by PD3.
  const knownCases = [{ room: 'Room 8', row: 'wall', texts: ['28', '36'] }];
  const found = [];
  const skipped = [];
  for (const { room, settings } of inputs) {
    const records = planDimensions(syncRoom(room, settings), settings);
    const shapes = records.map((record) => geometry(record, plotScale(settings)));
    expect(shapes.every(({ corners }) => corners.flat().every(Number.isFinite))).toBe(true);
    records.forEach((a, i) => records.slice(i + 1).forEach((b, j) => {
      const known = knownCases.some((entry) => entry.room === room.name && a.row === entry.row
        && b.row === entry.row && [a.text, b.text].sort().join('/') === entry.texts.join('/'));
      if (conflicts(shapes[i], shapes[i + j + 1])) {
        if (known) skipped.push(`${room.name}: ${[a.text, b.text].sort().join(' / ')}`);
        else found.push(`${room.name}: ${i} ${a.row} ${a.text} / ${i + j + 1} ${b.row} ${b.text}`);
      }
    }));
  }
  expect(found).toEqual([]);
  expect(skipped).toEqual(['Room 8: 28 / 36']);
});

it('G1 moves 44 9/16 four inches toward the span start, the nearest clear candidate (PD3)', () => {
  const room = golden('G1');
  const before = planClearances(room, settings).find(({ length }) => length === 44.5625);
  const after = planPlacedClearances(room, settings).find(({ length }) => length === before.length);
  expect(after).toEqual({ ...before, from: { ...before.from, y: 1.875 }, to: { ...before.to, y: 1.875 } });
  expect(Object.keys(after).sort()).toEqual(['from', 'kind', 'length', 'to']);
  const records = planDimensions(room, settings);
  const through = geometry(records.find(({ row, text }) => row === 'through' && text === '37 3/4'), plotScale(settings));
  const clearance = records.find(({ row, text }) => row === 'clearance' && text === '44 9/16');
  expect(clearance).toEqual({ row: 'clearance', kind: 'island', start: [-35.125, -1.875],
    end: [9.4375, -1.875], offset: 0, text: '44 9/16' });
  expect(conflicts(geometry(clearance, plotScale(settings)), through)).toBe(false);
  // Every closer candidate on either side is blocked, including the original middle.
  for (const shift of [0, -1, 1, -2, 2, -3, 3]) {
    const candidate = { ...clearance, start: [clearance.start[0], 2.125 + shift], end: [clearance.end[0], 2.125 + shift] };
    expect(lineThroughText(geometry(candidate, plotScale(settings)).line, through)).toBe(true);
  }
  expect(Math.hypot(after.to.x - after.from.x, after.to.y - after.from.y)).toBe(before.length);
});

it('preserves the captured G2–G6 and Room 9 clearance records (all empty) (PD3)', () => {
  const room9 = fixtures.find(({ name }) => name === 'Room 9');
  for (const room of [...document.rooms.slice(1), room9]) {
    const config = room === room9 ? { ...DEFAULT_SETTINGS, ...room9.settingsOverrides } : settings;
    expect(planPlacedClearances(syncRoom(room, config), config)).toEqual([]);
  }
});

it('a wholly blocked span stays in the middle (PD3)', () => {
  const clearance = { kind: 'island', from: { x: 0, y: 0 }, to: { x: 40, y: 0 }, length: 40,
    along: { start: { x: 0, y: -20 }, end: { x: 0, y: 20 } } };
  const obstacles = [{ start: [20, -20], end: [20, 20], offset: 0, text: 'blocked entire span', textAt: [20, 0] }];
  expect(placePlanClearance(clearance, obstacles, settings)).toBe(clearance);
});

it('keeps the scale-dependent end margin and prefers the span start on a tie (PD3)', () => {
  const clearance = { kind: 'aisle', from: { x: 0, y: 0 }, to: { x: 40, y: 0 }, length: 40,
    along: { start: { x: 0, y: -8 }, end: { x: 0, y: 8 } } };
  const obstacle = { start: [5, -8], end: [5, 8], offset: 0, text: '1' };
  expect(placePlanClearance(clearance, [obstacle], { plotScale: 24 }).from.y).toBe(-1);
  // At scale 32 only the blocked middle respects the 8-inch margin.
  expect(placePlanClearance(clearance, [obstacle], { plotScale: 32 })).toBe(clearance);
  expect(placePlanClearance(clearance, [], settings)).toBe(clearance);
});

it('clears its own text from obstacle lines and offset or moved text boxes, also when rotated (PD3)', () => {
  for (const angle of [0, Math.PI / 5, Math.PI / 2]) {
    const point = ([x, y]) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
    const canvas = (p) => { const [x, y] = point(p); return { x, y: -y }; };
    const clearance = { kind: 'aisle', from: canvas([0, 0]), to: canvas([40, 0]), length: 40,
      along: { start: canvas([0, -20]), end: canvas([0, 20]) } };
    for (const [obstacle, expected] of [
      // The moved obstacle text is far away; its line still passes through the clearance text.
      [{ start: [20, -10], end: [20, 10], offset: 0, text: '1', textAt: [100, 100] }, -12],
      // Only the text boxes overlap here; neither line passes through the other's text.
      [{ start: [90, 90], end: [110, 90], offset: 0, text: '123456', textAt: [20, 2] }, -1],
      // The signed left-normal offset moves this vertical line from x=15 to x=5.
      [{ start: [15, -10], end: [15, 10], offset: 10, text: '1' }, -1],
    ]) {
      const rotated = { ...obstacle, start: point(obstacle.start), end: point(obstacle.end),
        ...(obstacle.textAt ? { textAt: point(obstacle.textAt) } : {}) };
      const placed = placePlanClearance(clearance, [rotated], { plotScale: 24 });
      expect(placed.from.x).toBeCloseTo(canvas([0, expected]).x, 4);
      expect(placed.from.y).toBeCloseTo(canvas([0, expected]).y, 4);
    }
  }
});
