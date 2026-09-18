import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { openingClearances } from '../dimensions.js';
import { roomDiagnostics, syncRoom } from '../room.js';

function windowOpening(overrides = {}) {
  return {
    id: 'window-1', kind: 'window', label: 'W1', measureMode: 'jamb',
    width: 36, height: 48, sillZ: 36, offset: 12, offsetFrom: 'right',
    offsetAnchor: 'edge', casing: { width: 3, thickness: 0.75 }, ...overrides,
  };
}

function cabinetRun(overrides = {}) {
  const width = overrides.width ?? 40;
  const id = overrides.id ?? 'base';
  return {
    id, cabinetTypeId: overrides.cabinetTypeId ?? CABINET_TYPE_IDS.BASE,
    x: 0, width, z: 4, height: 32.5, depth: 24,
    ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
    autoCount: false, maxCabinetWidth: null,
    items: [{ id: `${id}-cabinet`, kind: 'cabinet', width }],
    heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
    ...overrides,
  };
}

function testRoom({ runs = [], openings = [windowOpening()] } = {}) {
  return {
    id: 'room', name: 'Room', profile: { ...DEFAULT_SETTINGS.defaultProfile },
    wallOrder: ['A'], walls: [{
      id: 'A', name: '', numberOverride: null, x1: 0, y1: 0, x2: 120, y2: 0,
      height: 96, thickness: 4.5, flipped: false,
      connections: { start: null, end: null }, profile: {}, runs, openings,
    }],
  };
}

function openingAnchor(clearance = null) {
  return { to: 'opening', openingId: 'window-1', edge: 'casing', clearance };
}

describe('opening run anchors', () => {
  it('26. anchors a run right edge to the casing using the default clearance', () => {
    const room = syncRoom(testRoom({
      runs: [cabinetRun({ anchors: { left: false, right: openingAnchor() } })],
    }), DEFAULT_SETTINGS);
    expect(room.walls[0].runs[0]).toMatchObject({ x: 29, width: 40 });
    expect(room.walls[0].runs[0].x + room.walls[0].runs[0].width).toBe(69);
  });

  it('27. honors an explicit casing clearance', () => {
    const room = syncRoom(testRoom({
      runs: [cabinetRun({ anchors: { left: false, right: openingAnchor(4) } })],
    }), DEFAULT_SETTINGS);
    expect(room.walls[0].runs[0]).toMatchObject({ x: 25, width: 40 });
    expect(room.walls[0].runs[0].x + room.walls[0].runs[0].width).toBe(65);
  });

  it('28. derives width between a corner datum and an opening datum', () => {
    const room = syncRoom(testRoom({
      runs: [cabinetRun({ anchors: { left: true, right: openingAnchor(4) } })],
    }), DEFAULT_SETTINGS);
    expect(room.walls[0].runs[0]).toMatchObject({ x: 0, width: 65 });
  });

  it('29. follows a moved opening in one room sync', () => {
    const room = testRoom({
      runs: [cabinetRun({ anchors: { left: false, right: openingAnchor() } })],
    });
    room.walls[0].openings[0].offset = 18;
    const run = syncRoom(room, DEFAULT_SETTINGS).walls[0].runs[0];
    expect(run.x + run.width).toBe(63);
  });

  it('31. warns only for vertically compatible unanchored run ends', () => {
    const settings = { ...DEFAULT_SETTINGS, casingClearance: 4 };
    const room = testRoom({ runs: [
      cabinetRun({ id: 'base', x: 26.5, width: 40 }),
      cabinetRun({
        id: 'upper', cabinetTypeId: CABINET_TYPE_IDS.UPPER,
        x: 26.5, width: 40, z: 85, height: 10, depth: 12,
      }),
    ] });
    const diagnostics = roomDiagnostics(room, settings);
    expect(diagnostics.base.warnings).toContainEqual({
      code: 'casing-clearance', openingId: 'window-1', label: 'W1',
      side: 'left', gap: 2.5, required: 4,
    });
    expect(diagnostics.upper.warnings.some(({ code }) => code === 'casing-clearance'))
      .toBe(false);
  });

  it('reports missing opening and crossed-datum anchor errors', () => {
    const missing = testRoom({
      runs: [cabinetRun({ anchors: { left: false, right: openingAnchor() } })],
      openings: [],
    });
    expect(roomDiagnostics(missing, DEFAULT_SETTINGS).base.errors)
      .toContainEqual({ code: 'anchor-opening-missing', side: 'right' });

    const crossed = testRoom({
      runs: [cabinetRun({
        anchors: { left: openingAnchor(), right: openingAnchor() },
      })],
    });
    expect(roomDiagnostics(crossed, DEFAULT_SETTINGS).base.errors)
      .toContainEqual({ code: 'anchor-opening-overlap' });
  });
});

describe('openingClearances', () => {
  it('32. measures from the nearest compatible run to each casing edge', () => {
    const room = testRoom({ runs: [cabinetRun({ x: 20, width: 40 })] });
    expect(openingClearances(room, room.walls[0], DEFAULT_SETTINGS)).toEqual([
      { openingId: 'window-1', label: 'W1', side: 'left', start: 60, end: 69,
        targetRunId: 'base', required: 0, violated: false },
      { openingId: 'window-1', label: 'W1', side: 'right', start: 111, end: 120,
        targetRunId: null, required: 0, violated: false },
    ]);
  });

  it('33. marks only a segment shorter than the required clearance', () => {
    const settings = { ...DEFAULT_SETTINGS, casingClearance: 4 };
    const room = testRoom({ runs: [cabinetRun({ x: 27, width: 40 })] });
    const [left, right] = openingClearances(room, room.walls[0], settings);
    expect(left).toMatchObject({ start: 67, end: 69, required: 4, violated: true });
    expect(right).toMatchObject({ start: 111, end: 120, required: 4, violated: false });
  });
});
