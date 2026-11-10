import { beforeEach, describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { normalizeCornerEnd } from '../cornerEnd.js';
import { cornerEndActive, cornerForRunSide, cornerReserveParts, frontDepth } from '../corners.js';
import { landingsOn } from '../landings.js';
import { syncRoom } from '../room.js';
import { resolveRunAnchorDatum } from '../runAnchors.js';
import { splitRun } from '../splitRun.js';
import { wallViewForRun } from '../wallSides.js';

describe('CC1 step d owner layout at a wall corner (Room A)', () => {
  let subject, ownerWall, returnWall, owner;
  beforeEach(() => {
    owner = run({ autoCount: false, items: [fixed('cc', 36), auto('a')],
      anchors: { left: true, right: false },
      ends: { left: normalizeCornerEnd({}), right: { type: 'filler', width: null } },
    });
    ownerWall = wall({ runs: [owner],
      connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null },
    });
    returnWall = wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
      connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
    });
    subject = room({ walls: [ownerWall, returnWall] });
  });

  it('anchor 1: reaches the corner with no reserve and no return run', () => {
    expect(resolveRunAnchorDatum(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS))
      .toEqual({ x: 0, type: 'corner' });
    const expected = { face: 0, back: 0, lap: 0, total: 0, source: 'corner', neighborRunId: null };
    expect(cornerReserveParts(subject, ownerWall, 'left', owner, DEFAULT_SETTINGS)).toEqual(expected);
    owner.cornerClearance = { left: 12 };
    expect(cornerReserveParts(subject, ownerWall, 'left', owner, DEFAULT_SETTINGS, { laps: false }))
      .toEqual(expected);
  });

  it('anchor 2: keeps zero reserve beside a return base run, leaving its reserve unchanged', () => {
    const returning = run({ id: 'return', depth: 24, anchors: { left: false, right: true } });
    returnWall.runs = [returning];
    expect(resolveRunAnchorDatum(subject, ownerWall, owner, 'left', DEFAULT_SETTINGS))
      .toEqual({ x: 0, type: 'corner' });
    expect(cornerReserveParts(subject, ownerWall, 'left', owner, DEFAULT_SETTINGS))
      .toMatchObject({ total: 0, source: 'corner' });
    expect(cornerReserveParts(subject, returnWall, 'right', returning, DEFAULT_SETTINGS).total)
      .toBeCloseTo(frontDepth(owner, DEFAULT_SETTINGS), 3);
    const fillerOwner = { ...owner, ends: { ...owner.ends, left: { type: 'filler', width: null } } };
    expect(cornerReserveParts(subject, ownerWall, 'left', fillerOwner, DEFAULT_SETTINGS).total)
      .toBeCloseTo(frontDepth(returning, DEFAULT_SETTINGS), 3);
  });

  it('anchor 3: starts with the 36-inch corner cabinet instead of a left end piece', () => {
    returnWall.runs = [run({ id: 'return', depth: 24, anchors: { left: false, right: true } })];
    const syncedOwner = syncRoom(subject, DEFAULT_SETTINGS).walls[0].runs[0];
    const layout = splitRun(syncedOwner, DEFAULT_SETTINGS);
    expect(layout.pieces.some(({ id }) => id === `${owner.id}:left`)).toBe(false);
    expect(layout.pieces[0]).toMatchObject({ id: 'cc', kind: 'cabinet', width: 36, x: syncedOwner.x });
    expect(syncedOwner.x).toBe(0);
    expect(layout.errors).toEqual([]);
  });

  it('anchor 4: lays out an unanchored corner end exactly like none', () => {
    owner.anchors.left = false;
    const layout = splitRun(owner, DEFAULT_SETTINGS);
    const none = { ...owner, ends: { ...owner.ends, left: { type: 'none', width: null } } };
    expect(layout.pieces.some(({ id }) => id === `${owner.id}:left`)).toBe(false);
    expect(layout).toEqual(splitRun(none, DEFAULT_SETTINGS));
  });

  it('keeps the left bead gap without adding a free-end stile overhang', () => {
    owner.x = 10;
    owner._frame = { thickness: 0.75, bead: 0.25 };
    const layout = splitRun(owner, DEFAULT_SETTINGS);
    expect(layout.pieces[0]).toMatchObject({ id: 'cc', width: 36, x: 10.25 });
    const last = layout.pieces.at(-1);
    expect(last.x + last.width).toBeCloseTo(owner.x + owner.width, 3);
    expect(layout.errors).toEqual([]);
  });

  it('also omits an inactive right corner end piece', () => {
    owner.ends = { left: { type: 'filler', width: null }, right: normalizeCornerEnd({}) };
    const layout = splitRun(owner, DEFAULT_SETTINGS);
    const none = { ...owner, ends: { ...owner.ends, right: { type: 'none', width: null } } };
    expect(layout.pieces.some(({ id }) => id === `${owner.id}:right`)).toBe(false);
    expect(layout).toEqual(splitRun(none, DEFAULT_SETTINGS));
  });
});

describe('CC1 step d owner layout at a peninsula (Room P)', () => {
  let subject, host, pen, hostRun, penRun, penSide;
  beforeEach(() => {
    hostRun = run({ id: 'host-run', width: 120, autoCount: false,
      items: [auto('a'), fixed('cc', 36)], anchors: { left: false, right: { to: 'wall', wallId: 'pen' } },
      ends: { left: { type: 'filler', width: null }, right: normalizeCornerEnd({ corner: { kind: 45 } }) },
    });
    penRun = run({ id: 'pen-run', width: 48, autoCount: false, items: [fixed('pen-cc', 36), auto('b')] });
    host = wall({ id: 'host', x1: 0, y1: 0, x2: 144, y2: 0, thickness: 4.5, runs: [hostRun] });
    pen = wall({ id: 'pen', x1: 72, y1: 0, x2: 72, y2: 48, thickness: 4.5,
      connections: { start: null, end: null }, runs: [penRun],
      landings: { start: { wallId: 'host', side: 'front', ref: 'left', to: 'near', offset: 72 }, end: null },
    });
    subject = room({ walls: [host, pen] });
    const corner = cornerForRunSide(subject, host, hostRun, 'right');
    penRun.wallSide = corner.neighborWallSide;
    penSide = corner.neighborSide;
    penRun.anchors[penSide] = true;
  });

  it('anchor 5 / P1: places the owner right edge at the near landing edge', () => {
    const landing = landingsOn(subject, wallViewForRun(host, hostRun))[0];
    expect(cornerReserveParts(subject, host, 'right', hostRun, DEFAULT_SETTINGS))
      .toMatchObject({ total: 0, source: 'corner' });
    expect(resolveRunAnchorDatum(subject, host, hostRun, 'right', DEFAULT_SETTINGS))
      .toEqual({ x: landing.a, type: 'wall' });
    const syncedOwner = syncRoom(subject, DEFAULT_SETTINGS).walls[0].runs[0];
    expect(syncedOwner.x + syncedOwner.width).toBeCloseTo(landing.a, 3);
    const layout = splitRun(syncedOwner, DEFAULT_SETTINGS);
    expect(layout.pieces.some(({ id }) => id === `${hostRun.id}:right`)).toBe(false);
    const last = layout.pieces.at(-1);
    expect(last).toMatchObject({ id: 'cc', kind: 'cabinet', width: 36 });
    expect(last.x + last.width).toBeCloseTo(landing.a, 3);
  });

  it('anchor 6 / P3: retains the crossing run front-depth reserve while inactive', () => {
    penRun.ends[penSide] = normalizeCornerEnd({});
    hostRun.width = 144;
    hostRun.anchors.right = false;
    expect(cornerEndActive(subject, pen, penRun, penSide))
      .toEqual({ active: false, code: 'corner-crossed' });
    const reserve = cornerReserveParts(subject, pen, penSide, penRun, DEFAULT_SETTINGS);
    const filler = { ...penRun, ends: { ...penRun.ends, [penSide]: { type: 'filler', width: null } } };
    expect(reserve).toEqual(cornerReserveParts(subject, pen, penSide, filler, DEFAULT_SETTINGS));
    expect(reserve.total).toBeCloseTo(frontDepth(hostRun, DEFAULT_SETTINGS), 3);
    expect(splitRun(penRun, DEFAULT_SETTINGS).pieces.some(({ id }) => id === `${penRun.id}:${penSide}`))
      .toBe(false);
  });
});
