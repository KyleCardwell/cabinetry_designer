import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { moveRun, roomDiagnostics, stretchRun, syncRoom } from '../room.js';
import { unflexRun } from '../runFlex.js';
import { splitRun } from '../splitRun.js';
import { isRoom, normalizeElevationDocument, toRoomDocument } from '../../store/persistence.js';

// Run flex ships off (runFlex 0) until RF.2; these tests turn it on.
const S = { ...DEFAULT_SETTINGS, runFlex: 0.25 };
const THICK = { ...S, endPanelThickness: 0.8125 };
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
    const room = syncRoom(makeRoom([makeRun()]), THICK);
    const run = runOf(room);
    expect(span(run)).toEqual([49.9375, 90.125]);
    expect(widths(run, THICK)).toEqual([0.8125, 29.5, 29.5, 29.5, 0.8125]);
    expect(run.flex).toEqual({ left: 0.0625, right: 0.0625, x: 49.9375, width: 90.125 });
  });

  // RF.2: stale since EP1 (free ends now default to 13/16"); rewrite with the one-run solver.
  it.skip('goes back to the drawn 90" when the panels go back to 3/4" (no drift)', () => {
    const flexed = syncRoom(makeRoom([makeRun()]), THICK);
    const back = runOf(syncRoom(flexed, S));
    expect(span(back)).toEqual([50, 90]);
    expect(back).not.toHaveProperty('flex');
  });

  it('is idempotent: a second sync changes nothing', () => {
    const once = syncRoom(makeRoom([makeRun()]), THICK);
    expect(syncRoom(once, THICK)).toEqual(once);
  });

  it('does nothing with run flex 0 (boxes take the change, with the warning)', () => {
    const room = syncRoom(makeRoom([makeRun()]), { ...THICK, runFlex: 0 });
    const run = runOf(room);
    expect(span(run)).toEqual([50, 90]);
    expect(run).not.toHaveProperty('flex');
    expect(roomDiagnostics(room, { ...THICK, runFlex: 0 }).R.warnings.map(({ code }) => code))
      .toContain('widths-not-rounded');
  });

  it('holds the drawn width with holdWidth, and lets go of an earlier flex', () => {
    const flexed = syncRoom(makeRoom([makeRun()]), THICK);
    runOf(flexed).holdWidth = true;
    const held = runOf(syncRoom(flexed, THICK));
    expect(span(held)).toEqual([50, 90]);
    expect(held).not.toHaveProperty('flex');
  });

  it('moves the free end and keeps the casing clearance when the other end is anchored to a window', () => {
    // W2's casing starts at 149, so a 2" clearance puts the run's right edge at 147.
    const anchors = { left: false, right: { to: 'opening', openingId: 'W2', edge: 'casing', clearance: 2 } };
    const room = syncRoom(makeRoom([makeRun({ anchors })], { openings: [windowAt('W2', 152)] }), THICK);
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
    }), THICK);
    expect(span(runOf(room))).toEqual([60.9375, 90.125]);
    expect(syncRoom(room, THICK)).toEqual(room);
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
    }), THICK);
    expect(span(runOf(shrunk))).toEqual([59.1875, 91.625]);
    // 90" tight (W2 casing at 149) needs +1/8 to round up, and neither edge can grow: 29 needs −1 3/8,
    // far past 1/4" an edge, so the boxes take it as before, with the warning.
    const tight = syncRoom(makeRoom([makeRun({ anchors })], {
      openings: [windowAt('W1', 20), windowAt('W2', 152)],
    }), THICK);
    expect(span(runOf(tight))).toEqual([59, 90]);
    expect(runOf(tight)).not.toHaveProperty('flex');
    expect(roomDiagnostics(tight, THICK).R.warnings.map(({ code }) => code)).toContain('widths-not-rounded');
  });

  it('keeps typed box widths and rounds only the auto boxes', () => {
    const items = [typed('T', 30), auto('A'), auto('B')];
    const run = runOf(syncRoom(makeRoom([makeRun({ items })]), THICK));
    // 90 − 1 5/8 − 30 = 58 3/8 for two boxes: 29 3/16 → 29 is nearer (−3/8, 3/16 each side).
    expect(span(run)).toEqual([50.1875, 89.625]);
    expect(widths(run, THICK)).toEqual([0.8125, 30, 29, 29, 0.8125]);
  });

  it('makes a run of typed boxes fill exactly instead of the does-not-fill error', () => {
    const items = [typed('A', 29.5), typed('B', 29.5), typed('C', 29.5)];
    const room = syncRoom(makeRoom([makeRun({ items })]), THICK);
    expect(span(runOf(room))).toEqual([49.9375, 90.125]);
    expect(roomDiagnostics(room, THICK).R.errors).toEqual([]);
  });

  it('keeps a pinned cabinet where it is and flexes each side against its own edge', () => {
    const items = [auto('A'), { ...typed('P', 30), pin: { from: 'left', value: 95, anchor: 'center' } }, auto('C')];
    const room = syncRoom(makeRoom([makeRun({ items })]), THICK);
    const run = runOf(room);
    // Each side: 30 − 13/16 = 29 3/16 → 29 (−3/16) beats 29 1/2 (+5/16, more than 1/4).
    expect(span(run)).toEqual([50.1875, 89.625]);
    const pieces = splitRun(run, THICK, { pinTargets: { P: 95 } }).pieces;
    expect(pieces.map(({ width }) => width)).toEqual([0.8125, 29, 30, 29, 0.8125]);
    expect(pieces.find(({ id }) => id === 'P').x).toBe(80);
  });

  // RF.2: stale since EP1 (free ends now default to 13/16"); rewrite with the one-run solver.
  it.skip('flexes an edge instead of dropping the boxes a step when a filler would go under its minimum', () => {
    // 90 3/4 with a free filler on the left: three 29 1/2" boxes and a 1 1/2" (minimum) filler.
    const drawn = makeRoom([makeRun({ width: 90.75, ends: { left: FILLER, right: PANEL } })]);
    const before = syncRoom(drawn, S);
    expect(widths(runOf(before))).toEqual([1.5, 29.5, 29.5, 29.5, 0.75]);
    expect(runOf(before).flex.boxes).toEqual({ run: 29.5 });
    const after = syncRoom(before, THICK);
    expect(span(runOf(after))).toEqual([50, 90.8125]);
    expect(widths(runOf(after), THICK)).toEqual([1.5, 29.5, 29.5, 29.5, 0.8125]);
    // Without flex the boxes drop to 29 and the filler takes 2 15/16.
    const off = syncRoom(before, { ...THICK, runFlex: 0 });
    expect(widths(runOf(off), THICK)).toEqual([2.9375, 29, 29, 29, 0.8125]);
  });

  // RF.2: stale since EP1 (free ends now default to 13/16"); rewrite with the one-run solver.
  it.skip('never grows a run just to tighten a filler that has room', () => {
    const run = runOf(syncRoom(makeRoom([makeRun({ width: 92, ends: { left: FILLER, right: PANEL } })]), S));
    expect(span(run)).toEqual([50, 92]);
    expect(widths(run)).toEqual([2.75, 29.5, 29.5, 29.5, 0.75]);
  });
});

describe('SPEC-RF1 run flex and edits', () => {
  it('takes a stretched edge exactly as drawn and keeps the other edge\'s flex', () => {
    const flexed = syncRoom(makeRoom([makeRun()]), THICK);
    const { room } = stretchRun(flexed, 'A', 'R', 'right', 141, THICK, { exact: true });
    const run = runOf(room);
    // Drawn 50 → 141 (91"): 91 − 1 5/8 = 89 3/8 → 29.79 → 30 needs +5/8, more than the edges allow;
    // 29 1/2 needs −7/8: nothing fits, so the run stays as drawn plus the left edge's old flex goes.
    expect(run.x + run.width).toBe(141);
    expect(unflexRun(run).x).toBe(50);
  });

  it('keeps the flex when the whole run moves', () => {
    const flexed = syncRoom(makeRoom([makeRun()]), THICK);
    const { room } = moveRun(flexed, 'A', 'R', 99.9375, THICK, { exact: true });
    expect(span(runOf(room))).toEqual([99.9375, 90.125]);
    expect(runOf(room).flex).toMatchObject({ left: 0.0625, right: 0.0625 });
    expect(unflexRun(runOf(room)).x).toBe(100);
  });

  // RF.2: stale since EP1 (free ends now default to 13/16"); rewrite with the one-run solver.
  it.skip('forgets a filler\'s box size once someone stretches the run (no fighting the drag)', () => {
    const before = syncRoom(makeRoom([makeRun({ width: 90.75, ends: { left: FILLER, right: PANEL } })]), S);
    const { room } = stretchRun(before, 'A', 'R', 'right', 140.5, S, { exact: true });
    expect(span(runOf(room))).toEqual([50, 90.5]);
    expect(widths(runOf(room))).toEqual([2.75, 29, 29, 29, 0.75]);
  });
});

describe('SPEC-RF1 run flex beside other runs', () => {
  it('holds an edge flush against another run (no joint) and moves the other edge', () => {
    const neighbour = makeRun({ id: 'N', x: 140, width: 30, items: [auto('N1')] });
    const room = syncRoom(makeRoom([makeRun(), neighbour]), THICK);
    expect(span(runOf(room))).toEqual([49.875, 90.125]);
    // N: 30 − 1 5/8 = 28 3/8 → 28 1/2, all on its free right edge.
    expect(span(runOf(room, 'N'))).toEqual([140, 30.125]);
  });

  it('carries a follower along with its leader\'s flexed edge, then flexes the follower', () => {
    const follower = makeRun({
      id: 'F', x: 140, width: 30, items: [auto('F1')],
      anchors: { left: { to: 'follow', runId: 'R', side: 'right', offset: 0 }, right: false },
    });
    const room = syncRoom(makeRoom([makeRun(), follower]), THICK);
    expect(span(runOf(room))).toEqual([49.9375, 90.125]);
    const run = runOf(room, 'F');
    expect(run.x).toBe(140.0625);
    // F: 30 − 3/4 (its own left panel) − 13/16 = 28 7/16 → 28 1/2, so its free right end moves 1/16 more.
    expect(run.x + run.width).toBe(170.125);
    expect(syncRoom(room, THICK)).toEqual(room);
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
    for (const source of document.rooms) {
      const once = syncRoom(source, document.settings);
      expect(syncRoom(once, document.settings)).toEqual(once);
      for (const run of once.walls.flatMap((wall) => wall.runs)) {
        if (!run.flex) continue;
        expect(Math.abs(run.flex.left)).toBeLessThanOrEqual(0.25);
        expect(Math.abs(run.flex.right)).toBeLessThanOrEqual(0.25);
      }
    }
  });
});
