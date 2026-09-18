import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { wallFrame } from '../geometry.js';
import {
  casingSides,
  createOpening,
  openingGeometry,
  openingReferenceBounds,
  openingsAtPoint,
  setMeasureMode,
  setOffsetSide,
  setOpeningReferenceX,
  validateOpeningPlacement,
} from '../openings.js';

const settings = DEFAULT_SETTINGS;

function door(overrides = {}) {
  return {
    id: 'door-1',
    kind: 'door',
    label: 'D1',
    measureMode: 'jamb',
    width: 36,
    height: 80,
    sillZ: 0,
    offset: 24,
    offsetFrom: 'left',
    casing: { width: 3, thickness: 0.75 },
    ...overrides,
  };
}

function windowOpening(overrides = {}) {
  return {
    id: 'window-1',
    kind: 'window',
    label: 'W1',
    measureMode: 'jamb',
    width: 36,
    height: 48,
    sillZ: 36,
    offset: 12,
    offsetFrom: 'right',
    casing: { width: 3, thickness: 0.75 },
    ...overrides,
  };
}

function wall(overrides = {}) {
  return {
    id: 'W',
    name: '',
    numberOverride: null,
    x1: 0,
    y1: 0,
    x2: 120,
    y2: 0,
    height: 96,
    thickness: 4.5,
    flipped: false,
    connections: { start: null, end: null },
    profile: {},
    runs: [],
    openings: [],
    ...overrides,
  };
}

function room(walls = [wall()]) {
  return {
    id: 'room',
    name: 'Room',
    profile: { ...settings.defaultProfile },
    wallOrder: walls.map((candidate) => candidate.id),
    walls,
  };
}

const expectedDoorGeometry = {
  jamb: { x: 24, z: 0, width: 36, height: 80 },
  casing: {
    x: 21,
    z: 0,
    width: 42,
    height: 83,
    thickness: 0.75,
    sides: { top: true, left: true, right: true, bottom: false },
  },
  head: 80,
  offsets: {
    left: { jamb: 24, casing: 21 },
    right: { jamb: 60, casing: 57 },
  },
};

const expectedWindowGeometry = {
  jamb: { x: 72, z: 36, width: 36, height: 48 },
  casing: {
    x: 69,
    z: 33,
    width: 42,
    height: 54,
    thickness: 0.75,
    sides: { top: true, left: true, right: true, bottom: true },
  },
  head: 84,
  offsets: {
    left: { jamb: 72, casing: 69 },
    right: { jamb: 12, casing: 9 },
  },
};

describe('opening geometry', () => {
  it('1. resolves a left-measured jamb-mode door', () => {
    expect(casingSides('door')).toEqual({
      top: true,
      left: true,
      right: true,
      bottom: false,
    });
    expect(openingGeometry(door(), 120, settings)).toEqual(expectedDoorGeometry);
  });

  it('2. resolves the equivalent casing-mode door identically', () => {
    const casingDoor = door({
      measureMode: 'casing',
      width: 42,
      height: 83,
      offset: 21,
    });
    expect(openingGeometry(casingDoor, 120, settings)).toEqual(expectedDoorGeometry);
  });

  it('3. resolves a right-measured jamb-mode window', () => {
    expect(casingSides('window').bottom).toBe(true);
    expect(openingGeometry(windowOpening(), 120, settings)).toEqual(expectedWindowGeometry);
  });

  it('4. resolves the equivalent casing-mode window identically', () => {
    const casingWindow = windowOpening({
      measureMode: 'casing',
      width: 42,
      height: 54,
      sillZ: 33,
      offset: 9,
    });
    expect(openingGeometry(casingWindow, 120, settings)).toEqual(expectedWindowGeometry);
  });

  it('5. collapses casing measurements onto jamb measurements without casing', () => {
    const geometry = openingGeometry(door({ casing: null }), 120, settings);
    expect(geometry.casing).toBeNull();
    expect(geometry.jamb).toEqual(expectedDoorGeometry.jamb);
    expect(geometry.offsets).toEqual({
      left: { jamb: 24, casing: 24 },
      right: { jamb: 60, casing: 60 },
    });
  });
});

describe('opening measurement conversions', () => {
  it('6. round-trips door measurement mode without changing geometry', () => {
    const original = door();
    const casingMode = setMeasureMode(original, 'casing', 120, settings);
    expect(casingMode).toMatchObject({
      width: 42,
      height: 83,
      sillZ: 0,
      offset: 21,
      measureMode: 'casing',
    });
    expect(openingGeometry(casingMode, 120, settings))
      .toEqual(openingGeometry(original, 120, settings));

    const roundTrip = setMeasureMode(casingMode, 'jamb', 120, settings);
    for (const key of ['width', 'height', 'sillZ', 'offset']) {
      expect(roundTrip[key]).toBeCloseTo(original[key], 9);
    }
  });

  it('7. round-trips the measured offset side without moving the window', () => {
    const original = windowOpening();
    const left = setOffsetSide(original, 'left', 120, settings);
    expect(left).toMatchObject({ offsetFrom: 'left', offset: 72 });
    expect(openingGeometry(left, 120, settings))
      .toEqual(openingGeometry(original, 120, settings));

    const roundTrip = setOffsetSide(left, 'right', 120, settings);
    expect(roundTrip.offset).toBeCloseTo(12, 9);
  });

  it('8. makes mode and offset-side conversion commute', () => {
    const original = windowOpening();
    const modeThenSide = setOffsetSide(
      setMeasureMode(original, 'casing', 120, settings),
      'left',
      120,
      settings,
    );
    const sideThenMode = setMeasureMode(
      setOffsetSide(original, 'left', 120, settings),
      'casing',
      120,
      settings,
    );
    expect(modeThenSide).toEqual(sideThenMode);
  });
});

describe('opening validation', () => {
  const resolvedWall = (openings = []) => ({
    ...wall({ openings }),
    length: 120,
  });

  it('9. rejects casing beyond a wall end and accepts casing touching it', () => {
    expect(validateOpeningPlacement(
      resolvedWall(),
      door({ offset: 1 }),
      settings,
    )).toEqual({ ok: false, reason: 'opening-out-of-bounds' });
    expect(validateOpeningPlacement(
      resolvedWall(),
      door({ offset: 3 }),
      settings,
    )).toEqual({ ok: true, reason: null });
  });

  it('10. rejects casing above the wall', () => {
    expect(validateOpeningPlacement(
      resolvedWall(),
      windowOpening({ sillZ: 66 }),
      settings,
    )).toEqual({ ok: false, reason: 'opening-too-tall' });
  });

  it('11. rejects overlapping casing but allows touching casing', () => {
    const first = door();
    expect(validateOpeningPlacement(
      resolvedWall([first]),
      door({ id: 'door-2', label: 'D2', offset: 60 }),
      settings,
    )).toEqual({ ok: false, reason: 'opening-conflict' });
    expect(validateOpeningPlacement(
      resolvedWall([first]),
      door({ id: 'door-2', label: 'D2', offset: 66 }),
      settings,
    )).toEqual({ ok: true, reason: null });
  });

  it('12. rejects a jamb narrower than the opening minimum', () => {
    expect(validateOpeningPlacement(
      resolvedWall(),
      windowOpening({ width: 4 }),
      settings,
    )).toEqual({ ok: false, reason: 'opening-too-small' });
  });
});

describe('opening creation and hit testing', () => {
  it('18. creates a valid default door at the requested jamb edge', () => {
    const targetWall = wall();
    const targetRoom = room([targetWall]);
    const opening = createOpening(
      { kind: 'door', x: 40 },
      { settings, room: targetRoom, wall: targetWall },
    );
    expect(opening).toMatchObject({
      kind: 'door',
      label: 'D1',
      measureMode: 'jamb',
      width: 36,
      height: 80,
      sillZ: 0,
      offset: 40,
      offsetFrom: 'left',
      casing: { width: 3, thickness: 0.75 },
    });
    expect(openingGeometry(opening, 120, settings).casing)
      .toMatchObject({ x: 37, width: 42 });
    expect(validateOpeningPlacement(
      { ...targetWall, length: 120 },
      opening,
      settings,
    )).toEqual({ ok: true, reason: null });
  });

  it('19. clamps a door so its casing ends at the wall', () => {
    const targetWall = wall();
    const targetRoom = room([targetWall]);
    const opening = createOpening(
      { kind: 'door', x: 118 },
      { settings, room: targetRoom, wall: targetWall },
    );
    expect(opening.offset).toBe(81);
    expect(openingGeometry(opening, 120, settings).casing)
      .toMatchObject({ x: 78, width: 42 });
  });

  it('20. defaults window sill height and counts labels across the room', () => {
    const firstWall = wall({ id: 'A' });
    const secondWall = wall({ id: 'B', y1: 60, y2: 60 });
    const targetRoom = room([firstWall, secondWall]);
    const first = createOpening(
      { kind: 'window', x: 10 },
      { settings, room: targetRoom, wall: firstWall },
    );
    firstWall.openings.push(first);
    const second = createOpening(
      { kind: 'window', x: 10 },
      { settings, room: targetRoom, wall: secondWall },
    );
    expect(first).toMatchObject({ label: 'W1', sillZ: settings.defaultWindowSillZ });
    expect(second.label).toBe('W2');
  });

  it('finds an opening through either its wall void or room-side casing', () => {
    const targetWall = wall({ openings: [door()] });
    const targetRoom = room([targetWall]);
    const frame = wallFrame(targetRoom, targetWall);
    const voidPoint = {
      x: frame.leftPoint.x + frame.r.x * 30 - frame.n.x * 2,
      y: frame.leftPoint.y + frame.r.y * 30 - frame.n.y * 2,
    };
    const casingPoint = {
      x: frame.leftPoint.x + frame.r.x * 22 + frame.n.x * 0.5,
      y: frame.leftPoint.y + frame.r.y * 22 + frame.n.y * 0.5,
    };
    expect(openingsAtPoint(targetRoom, voidPoint, settings)).toEqual(['door-1']);
    expect(openingsAtPoint(targetRoom, casingPoint, settings)).toEqual(['door-1']);
  });

  it('snaps and clamps a moved reference edge without changing its measured side', () => {
    const original = door({ offsetFrom: 'right', offset: 60 });
    expect(openingReferenceBounds(original, 120, settings)).toEqual({ min: 3, max: 81 });

    const moved = setOpeningReferenceX(original, 117.8, 120, settings);
    expect(moved).toMatchObject({ offsetFrom: 'right', offset: 3 });
    expect(openingGeometry(moved, 120, settings).casing)
      .toMatchObject({ x: 78, width: 42 });
  });
});
