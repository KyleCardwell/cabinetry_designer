import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { moveRun, resolveWall, roomDiagnostics, stretchRun, syncRoom } from '../room.js';
import { layoutRun } from '../faceLayouts.js';
import { runItems } from '../grid.js';
import { wallSideOf } from '../wallSides.js';
import { unflexRun } from '../runFlex.js';
import { wallLength } from '../geometry.js';
import { splitRun } from '../splitRun.js';
import { wallEndPanels } from '../wallEndPanels.js';
import { isRoom, normalizeElevationDocument, toRoomDocument } from '../../store/persistence.js';

const S = DEFAULT_SETTINGS;
const PANEL = { type: 'end_panel', width: null };
const FILLER = { type: 'filler', width: null };
const auto = (id) => ({ id, kind: 'cabinet', width: null });
const typed = (id, width) => ({ id, kind: 'cabinet', width });

function makeRun(overrides = {}) {
  const id = overrides.id ?? 'R';
  return {
    id, cabinetTypeId: 1, x: 50, width: 90, z: 4, height: 30.5, depth: 24,
    ends: { left: PANEL, right: PANEL },
    autoCount: false, maxCabinetWidth: null,
    items: [auto(`${id}1`), auto(`${id}2`), auto(`${id}3`)],
    heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
    ...overrides,
  };
}

function windowAt(id, offset, overrides = {}) {
  return {
    id, kind: 'window', label: id, measureMode: 'jamb', width: 36, height: 48, sillZ: 36,
    offset, offsetFrom: 'left', offsetAnchor: 'edge', casing: { width: 3, thickness: 0.75 }, ...overrides,
  };
}

function makeRoom(runs, { length = 300, openings = [] } = {}) {
  return {
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['A'],
    walls: [{
      id: 'A', name: '', numberOverride: null, x1: 0, y1: 0, x2: length, y2: 0,
      height: 96, thickness: 4.5, flipped: false,
      connections: { start: null, end: null }, profile: {}, runs, openings,
    }],
  };
}

const runOf = (room, id = 'R') => room.walls[0].runs.find((run) => run.id === id);
const span = (run) => [run.x, run.width];
const widths = (run, settings = S) => splitRun(run, settings).pieces.map(({ width }) => width);

describe('SPEC-RF1 run flex: one run', () => {
  it('grows a free run 1/16" each side when its end panels go to 13/16" (90" island)', () => {
    const room = syncRoom(makeRoom([makeRun({ autoCount: true })]), S);
    const run = runOf(room);
    expect(span(run)).toEqual([49.9375, 90.125]);
    expect(widths(run, S)).toEqual([0.8125, 29.5, 29.5, 29.5, 0.8125]);
    expect(run.flex).toEqual({ left: 0.0625, right: 0.0625, x: 49.9375, width: 90.125 });
  });

  it('goes back to the drawn 90" when the panels go back to 3/4" (no drift)', () => {
    const flexed = syncRoom(makeRoom([makeRun()]), S);
    runOf(flexed).ends = { left: { ...PANEL, width: 0.75 }, right: { ...PANEL, width: 0.75 } };
    const back = runOf(syncRoom(flexed, S));
    expect(span(back)).toEqual([50, 90]);
    expect(back).not.toHaveProperty('flex');
  });

  it('is idempotent: a second sync changes nothing', () => {
    const once = syncRoom(makeRoom([makeRun()]), S);
    expect(syncRoom(once, S)).toEqual(once);
  });

  it('does nothing with run flex 0 (boxes take the change, with the warning)', () => {
    const room = syncRoom(makeRoom([makeRun()]), { ...S, runFlex: 0 });
    const run = runOf(room);
    expect(span(run)).toEqual([50, 90]);
    expect(run).not.toHaveProperty('flex');
    expect(roomDiagnostics(room, { ...S, runFlex: 0 }).R.warnings.map(({ code }) => code))
      .toContain('widths-not-rounded');
  });

  it('holds the drawn width with holdWidth, and lets go of an earlier flex', () => {
    const flexed = syncRoom(makeRoom([makeRun()]), S);
    runOf(flexed).holdWidth = true;
    const held = runOf(syncRoom(flexed, S));
    expect(span(held)).toEqual([50, 90]);
    expect(held).not.toHaveProperty('flex');
  });

  it('moves the free end and keeps the casing clearance when the other end is anchored to a window', () => {
    // W2's casing starts at 149, so a 2" clearance puts the run's right edge at 147.
    const anchors = { left: false, right: { to: 'opening', openingId: 'W2', edge: 'casing', clearance: 2 } };
    const room = syncRoom(makeRoom([makeRun({ anchors })], { openings: [windowAt('W2', 152)] }), S);
    expect(span(runOf(room))).toEqual([56.875, 90.125]);
    expect(runOf(room).flex).toMatchObject({ left: 0.125, right: 0 });
  });

  it('takes it from both casing clearances when both ends are anchored to windows (2" → 1 15/16")', () => {
    const anchors = {
      left: { to: 'opening', openingId: 'W1', edge: 'casing', clearance: 2 },
      right: { to: 'opening', openingId: 'W2', edge: 'casing', clearance: 2 },
    };
    // W1 casing 17–59 → x 61; W2 casing 153–195 → right edge 151: 90" drawn.
    const room = syncRoom(makeRoom([makeRun({ anchors })], {
      openings: [windowAt('W1', 20), windowAt('W2', 156)],
    }), S);
    expect(span(runOf(room))).toEqual([60.9375, 90.125]);
    expect(syncRoom(room, S)).toEqual(room);
  });

  it('never grows into a casing it is tight against: it shrinks, or the boxes take the change', () => {
    const anchors = {
      left: { to: 'opening', openingId: 'W1', edge: 'casing', clearance: 0 },
      right: { to: 'opening', openingId: 'W2', edge: 'casing', clearance: 0 },
    };
    // W1 casing 17–59, W2 casing 151–193: 92" tight between them. 92 − 1 5/8 = 90 3/8 → 30 1/8 boxes;
    // 30 needs −3/8, which the edges can give inward (3/16 each).
    const shrunk = syncRoom(makeRoom([makeRun({ anchors })], {
      openings: [windowAt('W1', 20), windowAt('W2', 154)],
    }), S);
    expect(span(runOf(shrunk))).toEqual([59.1875, 91.625]);
    // 90" tight (W2 casing at 149) needs +1/8 to round up, and neither edge can grow: 29 needs −1 3/8,
    // far past 1/4" an edge, so the boxes take it as before, with the warning.
    const tight = syncRoom(makeRoom([makeRun({ anchors })], {
      openings: [windowAt('W1', 20), windowAt('W2', 152)],
    }), S);
    expect(span(runOf(tight))).toEqual([59, 90]);
    expect(runOf(tight)).not.toHaveProperty('flex');
    expect(roomDiagnostics(tight, S).R.warnings.map(({ code }) => code)).toContain('widths-not-rounded');
  });

  it('keeps typed box widths and rounds only the auto boxes', () => {
    const items = [typed('T', 30), auto('A'), auto('B')];
    const run = runOf(syncRoom(makeRoom([makeRun({ items })]), S));
    // 90 − 1 5/8 − 30 = 58 3/8 for two boxes: 29 3/16 → 29 is nearer (−3/8, 3/16 each side).
    expect(span(run)).toEqual([50.1875, 89.625]);
    expect(widths(run, S)).toEqual([0.8125, 30, 29, 29, 0.8125]);
  });

  it('makes a run of typed boxes fill exactly instead of the does-not-fill error', () => {
    const items = [typed('A', 29.5), typed('B', 29.5), typed('C', 29.5)];
    const room = syncRoom(makeRoom([makeRun({ items })]), S);
    expect(span(runOf(room))).toEqual([49.9375, 90.125]);
    expect(roomDiagnostics(room, S).R.errors).toEqual([]);
  });

  it('keeps a pinned cabinet where it is and flexes each side against its own edge', () => {
    const items = [auto('A'), { ...typed('P', 30), pin: { from: 'left', value: 95, anchor: 'center' } }, auto('C')];
    const room = syncRoom(makeRoom([makeRun({ items })]), S);
    const run = runOf(room);
    // Each side: 30 − 13/16 = 29 3/16 → 29 (−3/16) beats 29 1/2 (+5/16, more than 1/4).
    expect(span(run)).toEqual([50.1875, 89.625]);
    const pieces = splitRun(run, S, { pinTargets: { P: 95 } }).pieces;
    expect(pieces.map(({ width }) => width)).toEqual([0.8125, 29, 30, 29, 0.8125]);
    expect(pieces.find(({ id }) => id === 'P').x).toBe(80);
  });

  it('flexes an edge instead of dropping the boxes a step when a filler would go under its minimum', () => {
    // 90 3/4 − 3/4 panel − 1 1/2 minimum filler = 88 1/2 = three 29 1/2" boxes.
    const drawn = makeRoom([makeRun({ width: 90.75, ends: { left: FILLER, right: { ...PANEL, width: 0.75 } } })]);
    const before = syncRoom(drawn, S);
    expect(widths(runOf(before))).toEqual([1.5, 29.5, 29.5, 29.5, 0.75]);
    expect(runOf(before).flex.boxes).toEqual({ run: 29.5 });
    // Defaulting the panel adds 1/16: keeping 29 1/2 needs +1/16, all right by cost 7.
    runOf(before).ends.right = PANEL;
    const after = syncRoom(before, S);
    expect(span(runOf(after))).toEqual([50, 90.8125]);
    expect(widths(runOf(after), S)).toEqual([1.5, 29.5, 29.5, 29.5, 0.8125]);
    // Without flex the boxes drop to 29 and the filler takes 2 15/16.
    const off = syncRoom(before, { ...S, runFlex: 0 });
    expect(widths(runOf(off), S)).toEqual([2.9375, 29, 29, 29, 0.8125]);
  });

  it('never grows a run just to tighten a filler that has room', () => {
    const run = runOf(syncRoom(makeRoom([makeRun({ width: 92, ends: { left: FILLER, right: PANEL } })]), S));
    expect(span(run)).toEqual([50, 92]);
    // 92 − 13/16 − 3 × 29 1/2 = 2 11/16, above the 1 1/2 minimum: no movement.
    expect(widths(run)).toEqual([2.6875, 29.5, 29.5, 29.5, 0.8125]);
  });
});

describe('SPEC-RF1 run flex and edits', () => {
  it('takes a stretched edge exactly as drawn and keeps the other edge\'s flex', () => {
    const flexed = syncRoom(makeRoom([makeRun()]), S);
    const { room } = stretchRun(flexed, 'A', 'R', 'right', 141, S, { exact: true });
    const run = runOf(room);
    // Drawn 50 → 141 (91"): 91 − 1 5/8 = 89 3/8 → 29.79 → 30 needs +5/8, more than the edges allow;
    // 29 1/2 needs −7/8: nothing fits, so the run stays as drawn plus the left edge's old flex goes.
    expect(run.x + run.width).toBe(141);
    expect(unflexRun(run).x).toBe(50);
  });

  it('keeps the flex when the whole run moves', () => {
    const flexed = syncRoom(makeRoom([makeRun()]), S);
    const { room } = moveRun(flexed, 'A', 'R', 99.9375, S, { exact: true });
    expect(span(runOf(room))).toEqual([99.9375, 90.125]);
    expect(runOf(room).flex).toMatchObject({ left: 0.0625, right: 0.0625 });
    expect(unflexRun(runOf(room)).x).toBe(100);
  });

  it('forgets a filler\'s box size once someone stretches the run (no fighting the drag)', () => {
    // 90 13/16 − 13/16 − 1 1/2 = 88 1/2, so remember 29 1/2 boxes before the drag.
    const before = syncRoom(makeRoom([makeRun({ width: 90.8125, ends: { left: FILLER, right: PANEL } })]), S);
    expect(runOf(before).flex.boxes).toEqual({ run: 29.5 });
    const { room } = stretchRun(before, 'A', 'R', 'right', 140.5, S, { exact: true });
    expect(span(runOf(room))).toEqual([50, 90.5]);
    // Dragging drops the memory: 90 1/2 − 13/16 − 3 × 29 = 2 11/16 filler.
    expect(widths(runOf(room))).toEqual([2.6875, 29, 29, 29, 0.8125]);
  });
});

describe('SPEC-RF1 run flex beside other runs', () => {
  it('holds an edge flush against another run (no joint) and moves the other edge', () => {
    const neighbour = makeRun({ id: 'N', x: 140, width: 30, items: [auto('N1')] });
    const room = syncRoom(makeRoom([makeRun(), neighbour]), S);
    expect(span(runOf(room))).toEqual([49.875, 90.125]);
    // N: 30 − 1 5/8 = 28 3/8 → 28 1/2, all on its free right edge.
    expect(span(runOf(room, 'N'))).toEqual([140, 30.125]);
  });

  it('carries a follower along with its leader\'s flexed edge, then flexes the follower', () => {
    const follower = makeRun({
      id: 'F', x: 140, width: 30, items: [auto('F1')],
      anchors: { left: { to: 'follow', runId: 'R', side: 'right', offset: 0 }, right: false },
    });
    const room = syncRoom(makeRoom([follower, makeRun()]), S);
    expect(span(runOf(room))).toEqual([49.9375, 90.125]);
    const run = runOf(room, 'F');
    expect(run.x).toBe(140.0625);
    // F: 30 − 3/4 (its own left panel) − 13/16 = 28 7/16 → 28 1/2, so its free right end moves 1/16 more.
    expect(run.x + run.width).toBe(170.125);
    expect(syncRoom(room, S)).toEqual(room);
  });
});

describe('SPEC-RF2 independent runs and cost order', () => {
  const NONE = { type: 'none', width: null };
  const joint = (jointId) => ({ to: 'joint', jointId, offset: 0 });

  it('a joint never moves: talls flex only their free ends and the base span holds', () => {
    const source = makeRoom([
      makeRun({ id: 'L', cabinetTypeId: CABINET_TYPE_IDS.TALL, width: 30, height: 80,
        items: [auto('L1')], ends: { left: PANEL, right: NONE },
        anchors: { left: false, right: joint('J1') } }),
      makeRun({ id: 'B', x: 80, width: 30, items: [auto('B1')],
        ends: { left: NONE, right: NONE }, anchors: { left: joint('J1'), right: joint('J2') } }),
      makeRun({ id: 'T', cabinetTypeId: CABINET_TYPE_IDS.TALL, x: 110, width: 30, height: 80,
        items: [auto('T1')], ends: { left: NONE, right: PANEL },
        anchors: { left: joint('J2'), right: false } }),
    ]);
    source.walls[0].joints = [{ id: 'J1', x: 80 }, { id: 'J2', x: 110 }];
    const room = syncRoom(source, S);
    // Each tall: 30 − 13/16 = 29 3/16 → 29 needs −3/16, entirely at its free end.
    expect(span(runOf(room, 'L'))).toEqual([50.1875, 29.8125]);
    expect(span(runOf(room, 'T'))).toEqual([110, 29.8125]);
    expect(span(runOf(room, 'B'))).toEqual([80, 30]);
    expect(runOf(room, 'B')).not.toHaveProperty('flex');
    expect(room.walls[0].joints).toEqual(source.walls[0].joints);
    expect(syncRoom(room, S)).toEqual(room);
  });

  it('a joined end panel never moves the neighbour', () => {
    const source = makeRoom([
      makeRun({ id: 'L', width: 30, items: [auto('L1')],
        anchors: { left: false, right: joint('J') } }),
      makeRun({ id: 'N', x: 80, width: 30, items: [auto('N1')],
        ends: { left: NONE, right: NONE }, anchors: { left: joint('J'), right: false } }),
    ]);
    source.walls[0].joints = [{ id: 'J', x: 80 }];
    const room = syncRoom(source, S);
    // L: 30 − 13/16 free panel − 3/4 joined panel = 28 7/16 → 28 1/2 needs +1/16, left only.
    expect(span(runOf(room, 'L'))).toEqual([49.9375, 30.0625]);
    expect(widths(runOf(room, 'L'))).toEqual([0.8125, 28.5, 0.75]);
    expect(span(runOf(room, 'N'))).toEqual([80, 30]);
    expect(runOf(room, 'N')).not.toHaveProperty('flex');
    expect(room.walls[0].joints).toEqual(source.walls[0].joints);
  });

  it('leaves the wall end still when the other free end takes the needed sixteenth on both faces', () => {
    const room = syncRoom(makeRoom(['front', 'back'].map((wallSide) => makeRun({
      id: wallSide, wallSide, anchors: { left: true, right: false },
      ends: { left: { ...PANEL, width: 0.75 }, right: PANEL },
    }))), S);
    // 90 − 3/4 − 13/16 = 88 7/16 → 3 × 29 1/2 needs +1/16, only the free right end.
    for (const side of ['front', 'back']) {
      expect(span(runOf(room, side))).toEqual([0, 90.0625]);
      expect(runOf(room, side).flex).toMatchObject({ left: 0, right: 0.0625 });
    }
    expect(room.walls[0]).not.toHaveProperty('_endFlex');
    expect(syncRoom(room, S)).toEqual(room);
  });

  it('tries the next placing edge pair, then the next round candidate when growth is blocked', () => {
    const target = makeRun({ width: 29.9375, items: [auto('R1')] });
    const right = makeRun({ id: 'N', x: 80, width: 30, holdWidth: true });
    const oneSide = syncRoom(makeRoom([target, right]), S);
    // 29 15/16 − 1 5/8 = 28 5/16: 28 1/2 needs +3/16.
    // The preferred pair (+1/16, +1/8) hits N; (+1/8, +1/16) fits its 1/16 gap.
    expect(runOf(oneSide).flex).toEqual({ left: 0.125, right: 0.0625, x: 49.875, width: 30.125 });
    const left = makeRun({ id: 'L', x: 19.9375, width: 30, holdWidth: true });
    const blocked = syncRoom(makeRoom([left, target, right]), S);
    // With only 1/16 clearance at both edges, +3/16 cannot place.
    // Rounding to 28 needs −5/16; (−1/8, −3/16) wins the right-edge tie and meets the need.
    expect(runOf(blocked).flex).toEqual({ left: -0.125, right: -0.1875, x: 50.125, width: 29.625 });
  });

  it('cost 4 puts all of a needed 1/8 on the free end before using an opening offset', () => {
    const anchors = { left: false, right: { to: 'opening', openingId: 'W', edge: 'casing', clearance: 2 } };
    const room = syncRoom(makeRoom([makeRun({ anchors })], { openings: [windowAt('W', 152)] }), S);
    expect(runOf(room).flex).toEqual({ left: 0.125, right: 0, x: 56.875, width: 90.125 });
  });

  it('cost 7 puts an odd needed 1/16 on the right free end', () => {
    const run = runOf(syncRoom(makeRoom([makeRun({
      ends: { left: { ...PANEL, width: 0.75 }, right: PANEL },
    })]), S));
    // 90 − 3/4 − 13/16 = 88 7/16 → 3 × 29 1/2 needs +1/16.
    expect(run.flex).toEqual({ left: 0, right: 0.0625, x: 50, width: 90.0625 });
  });

  it('cost 5 shares a needed 1/8 evenly between two free ends', () => {
    const run = runOf(syncRoom(makeRoom([makeRun()]), S));
    // 90 − 2 × 13/16 = 88 3/8 → 3 × 29 1/2 needs +1/8: 1/16 per edge minimizes the maximum.
    expect(run.flex).toEqual({ left: 0.0625, right: 0.0625, x: 49.9375, width: 90.125 });
  });
});

describe('SPEC-RF3 free wall ends', () => {
  const front = (overrides = {}) => makeRun({
    x: 0, autoCount: true, anchors: { left: true, right: true }, ...overrides,
  });
  const backPanel = () => front({
    id: 'K', wallSide: 'back', autoCount: false, depth: 0.75,
    items: [{ id: 'K1', kind: 'panel', width: null, depth: 0.75, align: 'back' }],
  });
  const island = (runs = [front()]) => {
    const room = makeRoom(runs, { length: 90 });
    room.walls[0].thickness = 0;
    room.walls[0].endPanels = { start: { width: null }, end: { width: null } };
    return room;
  };

  it('moves the 90" island runs and wall panels out 1/16" each, keeping the drawn length', () => {
    const drawn = syncRoom(island(), { ...S, runFlex: 0 });
    const room = syncRoom(drawn, S);
    const wall = room.walls[0];
    expect(span(runOf(drawn))).toEqual([0.8125, 88.375]);
    expect(span(runOf(room))).toEqual([0.75, 88.5]);
    expect(widths(runOf(room))).toEqual([29.5, 29.5, 29.5]);
    expect(wall._endFlex).toEqual({ start: 0.0625, end: 0.0625 });
    expect(wallEndPanels(drawn, drawn.walls[0], S).map(({ front }) => front.x)).toEqual([0, 89.1875]);
    expect(wallEndPanels(room, wall, S).map(({ front }) => front.x)).toEqual([-0.0625, 89.25]);
    expect(wallLength(wall)).toBe(90);
    expect(wallLength(wall) + wall._endFlex.start + wall._endFlex.end).toBe(90.125);
    expect([wall.x1, wall.y1, wall.x2, wall.y2]).toEqual([0, 0, 90, 0]);
    expect(syncRoom(room, S)).toEqual(room);
    expect(syncRoom(room, { ...S, runFlex: 0 })).toEqual(drawn);
  });

  it('carries a back-panel run by the front decision even when the back is stored first', () => {
    const room = syncRoom(island([backPanel(), front()]), S);
    expect(span(runOf(room, 'K'))).toEqual([0.75, 88.5]);
    expect(runOf(room, 'K').flex).toMatchObject({ left: 0.0625, right: 0.0625 });
    expect(room.walls[0]._endFlex).toEqual({ start: 0.0625, end: 0.0625 });
    expect(syncRoom(room, S)).toEqual(room);
  });

  it('lets back cabinets absorb their change when the front already fits', () => {
    const room = syncRoom(island([
      front({ id: 'K', wallSide: 'back' }),
      front({ autoCount: false, items: [typed('A', 29.375), typed('B', 29.5), typed('C', 29.5)] }),
    ]), S);
    expect(room.walls[0]).not.toHaveProperty('_endFlex');
    expect(span(runOf(room))).toEqual([0.8125, 88.375]);
    expect(span(runOf(room, 'K'))).toEqual([0.8125, 88.375]);
    expect(roomDiagnostics(room, S).K.warnings.map(({ code }) => code)).toContain('widths-not-rounded');
  });

  it('moves only the free endpoint of a peninsula and keeps its connected corner fixed', () => {
    const source = island([front()]);
    const wall = source.walls[0];
    wall.connections.start = { wallId: 'B', endpoint: 'start' };
    source.walls.push({ ...makeRoom([]).walls[0], id: 'B', x2: 0, y2: 100,
      connections: { start: { wallId: 'A', endpoint: 'start' }, end: null } });
    source.wallOrder.push('B');
    const drawn = syncRoom(source, { ...S, runFlex: 0 });
    const room = syncRoom(drawn, S);
    expect(span(runOf(drawn))).toEqual([0, 89.1875]);
    expect(span(runOf(room))).toEqual([0, 89.3125]);
    expect(room.walls[0]._endFlex).toEqual({ end: 0.125 });
    expect(widths(runOf(room))).toEqual([0.8125, 29.5, 29.5, 29.5]);
    expect(syncRoom(room, S)).toEqual(room);
  });

  it('holds the island exact with front holdWidth and makes the back follow at zero', () => {
    const before = syncRoom(island([backPanel(), front()]), S);
    runOf(before).holdWidth = true;
    const room = syncRoom(before, S);
    expect(room.walls[0]).not.toHaveProperty('_endFlex');
    expect(span(runOf(room))).toEqual([0.8125, 88.375]);
    expect(span(runOf(room, 'K'))).toEqual([0.8125, 88.375]);
  });

  it('recomputes from a newly typed 120" drawn wall and stays idempotent', () => {
    const before = syncRoom(island([backPanel(), front()]), S);
    before.walls[0].x2 = 120;
    const room = syncRoom(before, S);
    // Auto count becomes four: neither four 29 1/2" nor four 30" boxes can fit by growing
    // these edges at most 1/4" each, so §1's allowed zero move applies at this drawn length.
    expect(span(runOf(room))).toEqual([0.8125, 118.375]);
    expect(span(runOf(room, 'K'))).toEqual([0.8125, 118.375]);
    expect(widths(runOf(room))).toEqual([29.625, 29.625, 29.625, 29.5]);
    expect(room.walls[0]).not.toHaveProperty('_endFlex');
    expect(wallLength(room.walls[0])).toBe(120);
    expect(syncRoom(room, S)).toEqual(room);
  });

  it('returns to the drawn spans when both wall panels are typed back to 3/4"', () => {
    const before = syncRoom(island([backPanel(), front()]), S);
    before.walls[0].endPanels = { start: { width: 0.75 }, end: { width: 0.75 } };
    const room = syncRoom(before, S);
    expect(room.walls[0]).not.toHaveProperty('_endFlex');
    for (const id of ['R', 'K']) expect(span(runOf(room, id))).toEqual([0.75, 88.5]);
    expect(widths(runOf(room))).toEqual([29.5, 29.5, 29.5]);
    expect(syncRoom(room, S)).toEqual(room);
  });

  it('keeps back-only wall ends at zero', () => {
    const room = syncRoom(island([front({ wallSide: 'back' })]), S);
    expect(span(runOf(room))).toEqual([0.8125, 88.375]);
    expect(room.walls[0]).not.toHaveProperty('_endFlex');
  });

  it('fixes the back wall edge to the front move while letting its other free edge flex', () => {
    const room = syncRoom(island([
      front({ id: 'K', wallSide: 'back', width: 30.1875, autoCount: false,
        items: [auto('K1')], anchors: { left: true, right: false } }),
      front(),
    ]), S);
    expect(span(runOf(room, 'K'))).toEqual([0.75, 30.3125]);
    expect(runOf(room, 'K').flex).toMatchObject({ left: 0.0625, right: 0.0625 });
    expect(widths(runOf(room, 'K'))).toEqual([29.5, 0.8125]);
    expect(syncRoom(room, S)).toEqual(room);
  });

  it('solves the lowest front run first and fixes the upper front and back edges to its move', () => {
    const room = syncRoom(island([
      backPanel(),
      front({ id: 'U', z: 50, height: 30, autoCount: false, items: [auto('U1'), auto('U2')] }),
      front(),
    ]), S);
    for (const id of ['R', 'U', 'K']) {
      expect(span(runOf(room, id))).toEqual([0.75, 88.5]);
      expect(runOf(room, id).flex).toMatchObject({ left: 0.0625, right: 0.0625 });
    }
    expect(widths(runOf(room, 'U'))).toEqual([44.25, 44.25]);
    expect(syncRoom(room, S)).toEqual(room);
  });

  it('maps an asymmetric endpoint move onto the mirrored back face and flipped wall', () => {
    const source = island([backPanel(), front()]);
    source.walls[0].flipped = true;
    source.walls[0].endPanels.end.width = 0.75;
    const room = syncRoom(source, S);
    expect(room.walls[0]._endFlex).toEqual({ start: 0.0625 });
    expect(runOf(room).flex).toMatchObject({ left: 0, right: 0.0625 });
    expect(runOf(room, 'K').flex).toMatchObject({ left: 0.0625, right: 0 });
    expect(span(runOf(room))).toEqual([0.75, 88.5]);
    expect(span(runOf(room, 'K'))).toEqual([0.75, 88.5]);
    expect(syncRoom(room, S)).toEqual(room);
  });

  it('lets the first moving front run decide and carries an earlier unmoving front run with it', () => {
    const lower = { ...backPanel(), id: 'L', wallSide: 'front', z: 0, height: 2 };
    const room = syncRoom(island([backPanel(), lower, front()]), S);
    for (const id of ['R', 'L', 'K']) {
      expect(span(runOf(room, id))).toEqual([0.75, 88.5]);
      expect(runOf(room, id).flex).toMatchObject({ left: 0.0625, right: 0.0625 });
    }
    expect(syncRoom(room, S)).toEqual(room);
  });

  it('lets an upper front holdWidth keep its wall endpoints exact', () => {
    const room = syncRoom(island([
      front(), front({ id: 'U', z: 50, height: 30, holdWidth: true }), backPanel(),
    ]), S);
    expect(room.walls[0]).not.toHaveProperty('_endFlex');
    for (const id of ['R', 'U', 'K']) expect(span(runOf(room, id))).toEqual([0.8125, 88.375]);
  });
});

describe('SPEC-RF1 saved fields', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8'));
  const document = normalizeElevationDocument(fixture);

  it('keeps flex and holdWidth in the stored room and rejects a broken flex', () => {
    const room = syncRoom(structuredClone(document.rooms[0]), document.settings);
    const run = room.walls[0].runs[0];
    run.holdWidth = true;
    run.flex = { left: 0.0625, right: 0, x: run.x, width: run.width, boxes: { run: 30 } };
    const stored = toRoomDocument(room);
    expect(stored.walls[0].runs[0].flex).toEqual(run.flex);
    expect(stored.walls[0].runs[0].holdWidth).toBe(true);
    expect(isRoom(stored)).toBe(true);
    for (const flex of [{ left: 0 }, { ...run.flex, width: 0 }, { ...run.flex, boxes: { middle: 3 } }, { ...run.flex, extra: 1 }]) {
      expect(isRoom({ ...stored, walls: [{ ...stored.walls[0], runs: [{ ...stored.walls[0].runs[0], flex }] }] })).toBe(false);
    }
    expect(isRoom({ ...stored, walls: [{ ...stored.walls[0], runs: [{ ...stored.walls[0].runs[0], holdWidth: false }] }] })).toBe(false);
  });

  it('flexes Kyle\'s golden rooms by at most 1/4" an edge and is idempotent there', () => {
    const flexSettings = document.settings;
    expect(DEFAULT_SETTINGS.runFlex).toBe(0.25);
    expect(flexSettings.runFlex).toBe(0.25); // Missing in the legacy fixture.
    expect(normalizeElevationDocument({
      ...fixture, settings: { ...fixture.settings, runFlex: 0 },
    }).settings.runFlex).toBe(0);
    for (const source of document.rooms) {
      const drawn = syncRoom(source, { ...flexSettings, runFlex: 0 });
      const once = syncRoom(source, flexSettings);
      expect(syncRoom(once, flexSettings)).toEqual(once);
      for (const wall of once.walls) {
        const oldWall = drawn.walls.find(({ id }) => id === wall.id);
        const coordinates = ({ x1, y1, x2, y2 }) => [x1, y1, x2, y2];
        expect(coordinates(wall)).toEqual(coordinates(oldWall));
        expect(wall.joints).toEqual(oldWall.joints);
        for (const run of wall.runs) {
          const oldRun = oldWall.runs.find(({ id }) => id === run.id);
          const cabinets = (room, wall, run, settings) => layoutRun(
            room, resolveWall(room, wall, wallSideOf(run)), run, settings,
          ).pieces.filter(({ kind }) => kind === 'cabinet');
          const before = cabinets(drawn, oldWall, oldRun, { ...flexSettings, runFlex: 0 });
          const after = cabinets(once, wall, run, flexSettings);
          expect(after.map(({ id }) => id)).toEqual(before.map(({ id }) => id));
          for (const item of runItems(run)) {
            if (!item.pin) continue;
            expect(after.find(({ id }) => id === item.id))
              .toEqual(before.find(({ id }) => id === item.id));
          }
          if (!run.flex) continue;
          expect(Math.abs(run.flex.left)).toBeLessThanOrEqual(0.25);
          expect(Math.abs(run.flex.right)).toBeLessThanOrEqual(0.25);
          for (const side of ['left', 'right']) {
            if (run.anchors?.[side]?.to === 'joint') expect(run.flex[side]).toBe(0);
          }
        }
      }
    }
  });
});
