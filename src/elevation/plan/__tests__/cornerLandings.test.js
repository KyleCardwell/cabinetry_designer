import { describe, expect, it } from 'vitest';
import { room, run, wall } from '../../../test/builders.js';
import { K, KC } from '../../../test/fixtures/landingRoomK.js';
import { heldLandingCorner, holdLandedWalls, wallFrame } from '../../model/index.js';
import { landingInterval, landingOffsetFor } from '../../model/landings.js';
import { wallSideFrame } from '../../model/wallSides.js';
import { canExtendPast, extendPastCorner, makeWallCorner, wallCornerEnd } from '../cornerLandings.js';
import { setWallLength } from '../wallOps.js';

describe('WL3 a: make a landing into a corner', () => {
  it('keeps the shared K and KC frame anchors', () => {
    const back = wallSideFrame(K, K.walls[2], 'back');
    expect(back).toMatchObject({
      leftPoint: { x: -123.5, y: 13.5 }, r: { x: 1, y: 0 }, length: 124,
      leftEndpoint: 'end', rightEndpoint: 'start',
    });
    expect(landingInterval(K, K.walls[1], 'end')).toMatchObject({ a: 80.5, b: 85 });
    expect(wallSideFrame(KC, KC.walls[2], 'front')).toMatchObject({
      leftPoint: { x: -38.5, y: 9 }, r: { x: -1, y: 0 }, length: 85,
    });
    expect(wallSideFrame(KC, KC.walls[2], 'back').length).toBe(85);
    expect(wallSideFrame(KC, KC.walls[1], 'front').length).toBe(74.5);
    expect(K.walls.slice(1).map((entry) => wallFrame(K, entry).n)).toEqual([
      { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 0 },
    ]);
  });

  it('anchor 1: moves only the host end to make KC, preserving untouched objects', () => {
    const before = structuredClone(K);
    const result = makeWallCorner(K, 'wall-2', 'end', { move: 'host' });
    expect(result).toEqual({ ok: true, reason: null, message: null, walls: KC.walls });
    expect(result.walls[0]).toBe(K.walls[0]);
    expect(result.walls[3]).toBe(K.walls[3]);
    expect(K).toEqual(before);
  });

  it('anchor 2: slides the landed wall square and extends its joined neighbour', () => {
    const ownRun = run({ id: 'own', anchors: { left: true, right: true } });
    const subject = room({ ...K, walls: K.walls.map((entry) => entry.id === 'wall-2'
      ? { ...entry, runs: [ownRun] } : entry) });
    const result = makeWallCorner(subject, 'wall-2', 'end', {});
    expect(result).toMatchObject({ ok: true, reason: null, message: null });
    expect(result.walls[0]).toEqual({ ...K.walls[0], x2: 0.5 });
    expect(result.walls[1]).toEqual({
      ...KC.walls[1], x1: 0.5, x2: 0.5, runs: [ownRun],
    });
    expect(result.walls[1].runs[0]).toBe(ownRun);
    expect(result.walls[2]).toEqual({
      ...K.walls[2], connections: KC.walls[2].connections,
    });
    expect(result.walls[3]).toBe(K.walls[3]);
  });

  it('anchor 3: selects the free start of K wall-3', () => {
    expect(wallCornerEnd(K, 'wall-2', 'end')).toBe('start');
    expect(wallCornerEnd(K, 'wall-2', 'start')).toBeNull();
    expect(wallCornerEnd(K, 'missing', 'end')).toBeNull();
  });

  it('anchor 4: refuses when neither host end is free', () => {
    const subject = room({ ...K, walls: [
      ...K.walls.map((entry) => entry.id === 'wall-3' ? {
        ...entry, connections: {
          ...entry.connections, start: { wallId: 'wall-5', endpoint: 'start' },
        },
      } : entry),
      wall({
        id: 'wall-5', x1: 0.5, y1: 9, x2: 0.5, y2: -40,
        connections: { start: { wallId: 'wall-3', endpoint: 'start' }, end: null },
      }),
    ] });
    expect(wallCornerEnd(subject, 'wall-2', 'end')).toBeNull();
    const result = makeWallCorner(subject, 'wall-2', 'end', { move: 'host' });
    expect(result).toEqual({
      ok: false, reason: 'no-free-end',
      message: 'Wall 3 has no free end to make a corner with Wall 2.', walls: subject.walls,
    });
    expect(result.walls).toBe(subject.walls);
  });

  it('anchor 5: refuses an explicitly chosen joined host end', () => {
    const result = makeWallCorner(K, 'wall-2', 'end', { move: 'host', hostEndpoint: 'end' });
    expect(result.reason).toBe('no-free-end');
    expect(result.walls).toBe(K.walls);
  });

  it('anchor 6: turns the host face anchor into a corner and releases all other references before moving', () => {
    const reference = { to: 'wall', wallId: 'wall-2' };
    const r1 = run({ id: 'r1', wallSide: 'back', x: 20, width: 50,
      anchors: { left: false, right: reference } });
    const r2 = run({ id: 'r2', wallSide: 'back', x: 86, width: 30,
      anchors: { left: reference, right: false } });
    const front = run({ id: 'front', anchors: { left: reference, right: reference } });
    const soffit = { id: 'soffit', anchors: { left: reference, right: false } };
    const other = wall({
      id: 'wall-5', x1: -30, y1: 83.5, x2: -30, y2: 13.5, thickness: 4.5,
      landings: { start: {
        wallId: 'wall-1', side: 'front', ref: 'left', to: 'near', offset: 153.5,
      }, end: {
        wallId: 'wall-3', side: 'back', ref: 'wall-2', to: 'near', offset: 27,
      } },
    });
    const subject = room({ ...K, walls: [
      ...K.walls.map((entry) => entry.id === 'wall-3'
        ? { ...entry, runs: [r1, r2, front], soffits: [soffit] } : entry), other,
    ] });
    const offset = landingOffsetFor(subject, other, 'end', 'left', 'near');
    expect(offset).toBe(89);
    const result = makeWallCorner(subject, 'wall-2', 'end', { move: 'host' });
    expect(result.ok).toBe(true);
    expect(result.walls[2].runs).toEqual([
      { ...r1, anchors: { ...r1.anchors, right: true } },
      { ...r2, anchors: { ...r2.anchors, left: false } },
      { ...front, anchors: { left: false, right: false } },
    ]);
    expect(result.walls[2].soffits).toEqual([
      { ...soffit, anchors: { left: false, right: false } },
    ]);
    expect(result.walls[4].landings.end).toEqual({
      ...other.landings.end, ref: 'left', offset,
    });
    // An unsynced success still leaves hold refusals to the caller.
    expect(holdLandedWalls(subject, { ...subject, walls: result.walls }).reason)
      .toBe('landing-off-host');
  });

  it('anchor 7: offers the free end passed by a host shrink', () => {
    const after = room({ ...K, walls: setWallLength(K, 'wall-3', 84, 'left').walls });
    expect(heldLandingCorner(K, after)).toEqual({
      wallId: 'wall-2', endpoint: 'end', hostEndpoint: 'start',
    });
    expect(makeWallCorner(K, 'wall-2', 'end', {
      move: 'host', hostEndpoint: heldLandingCorner(K, after).hostEndpoint,
    }).walls).toEqual(KC.walls);
  });

  it('anchor 8: does not offer a joined end passed on the other side', () => {
    const after = room({ ...K, walls: setWallLength(K, 'wall-3', 43, 'right').walls });
    expect(landingInterval(after, after.walls[1], 'end').a).toBe(-0.5);
    expect(heldLandingCorner(K, after)).toBeNull();
  });

  it('anchor 9: no host edit gives no offer and preserves the exact hold result', () => {
    expect(heldLandingCorner(K, { ...K })).toBeNull();
    expect(holdLandedWalls(K, { ...K })).toEqual({
      ok: true, reason: null, message: null, walls: K.walls,
    });
    expect(holdLandedWalls(K, { ...K }).walls).toBe(K.walls);
  });

  it('chooses the nearest free end, breaks a tie left, and permits an explicit farther end', () => {
    const host = wall({ id: 'host', x1: 0, y1: 0, x2: 100, y2: 0 });
    const landed = wall({
      id: 'landed', x1: 48, y1: 0, x2: 48, y2: 40, thickness: 4,
      landings: { start: { wallId: 'host', side: 'front', ref: 'left', to: 'near', offset: 48 }, end: null },
    });
    const subject = room({ walls: [host, landed] });
    expect(landingInterval(subject, landed, 'start')).toMatchObject({ a: 48, b: 52 });
    expect(wallCornerEnd(subject, 'landed', 'start')).toBe('start');
    const nearerRight = room({ walls: [host, { ...landed, x1: 80, x2: 80 }] });
    expect(wallCornerEnd(nearerRight, 'landed', 'start')).toBe('end');
    const result = makeWallCorner(nearerRight, 'landed', 'start', {
      move: 'host', hostEndpoint: 'start',
    });
    expect(result.ok).toBe(true);
    expect(result.walls[0]).toMatchObject({ x1: 80, y1: 0 });
    const occupied = room({ walls: [{
      ...host, landings: { start: { wallId: 'another' }, end: { wallId: 'another' } },
    }, landed] });
    expect(wallCornerEnd(occupied, 'landed', 'start')).toBeNull();
    expect(makeWallCorner(occupied, 'landed', 'start', { hostEndpoint: 'start' }).reason)
      .toBe('no-free-end');
  });

  it('uses the first failing held landing, even if its end cannot be offered', () => {
    const another = wall({
      id: 'wall-5', x1: -60, y1: 60, x2: -60, y2: 13.5, thickness: 4.5,
      connections: { start: { wallId: 'wall-1', endpoint: 'start' }, end: null },
      landings: { start: null, end: {
        wallId: 'wall-3', side: 'back', ref: 'right', to: 'near', offset: 60.5,
      } },
    });
    const before = room({ ...K, walls: [another, ...K.walls] });
    const after = room({ ...before, walls: setWallLength(before, 'wall-3', 30, 'left').walls });
    expect(heldLandingCorner(before, after)).toEqual({
      wallId: 'wall-5', endpoint: 'end', hostEndpoint: 'start',
    });
    const blocked = room({ ...after, walls: after.walls.map((entry) => entry.id === 'wall-3'
      ? { ...entry, landings: { ...entry.landings, start: { wallId: 'wall-1' } } } : entry) });
    expect(holdLandedWalls(before, blocked).message).toContain('Wall 5 lands on it.');
    expect(heldLandingCorner(before, blocked)).toBeNull();
  });

  it('passes through a refused perpendicular move without releasing any data', () => {
    const subject = room({ ...K, walls: K.walls.map((entry) => entry.id === 'wall-3'
      ? { ...entry, x1: 123.5 } : entry) });
    const result = makeWallCorner(subject, 'wall-2', 'end');
    expect(result).toEqual({
      ok: false, reason: 'neighbor-too-short', message: 'neighbor-too-short', walls: subject.walls,
    });
    expect(result.walls).toBe(subject.walls);
  });

  it('intersects angled lines and keeps a flipped landed wall and its run anchors', () => {
    const ownRun = run({ anchors: { left: true, right: false } });
    const subject = room({ ...K, walls: K.walls.map((entry) => entry.id === 'wall-2'
      ? { ...entry, x2: -18.5, flipped: true, runs: [ownRun] } : entry) });
    const result = makeWallCorner(subject, 'wall-2', 'end', { move: 'host' });
    expect(result.ok).toBe(true);
    expect(result.walls[1]).toMatchObject({ flipped: true, y2: 9, runs: [ownRun] });
    expect(result.walls[1].x2).toBeCloseTo(-18.5 + 20 * 4.5 / 70);
    expect(result.walls[2].x1).toBe(result.walls[1].x2);
    expect(result.walls[2].y1).toBe(result.walls[1].y2);
  });
});

describe('WL3 b: extend past a corner', () => {
  it('anchor 1: extends KC back into K without mutating the room', () => {
    const before = structuredClone(KC);
    const result = extendPastCorner(KC, 'wall-3', 'start', 39);
    expect(result).toEqual({ ok: true, reason: null, message: null, walls: K.walls });
    expect(result.walls[0]).toBe(KC.walls[0]);
    expect(result.walls[3]).toBe(KC.walls[3]);
    expect(KC).toEqual(before);
  });

  it('anchor 2: zero extension still pulls B back onto the back face', () => {
    const result = extendPastCorner(KC, 'wall-3', 'start', 0);
    expect(result.ok).toBe(true);
    expect(result.walls[2]).toEqual({ ...KC.walls[2], connections: K.walls[2].connections });
    expect(result.walls[1]).toEqual({
      ...K.walls[1], landings: { start: null, end: { ...K.walls[1].landings.end, offset: 0 } },
    });
  });

  it('anchor 3: extends wall-2 and lands wall-3 on its back face', () => {
    const result = extendPastCorner(KC, 'wall-2', 'end', 10);
    expect(result.ok).toBe(true);
    expect(result.walls[1]).toEqual({ ...K.walls[1], y2: -1, landings: { start: null, end: null } });
    expect(result.walls[2]).toEqual({
      ...K.walls[2], x1: -43,
      landings: { start: { wallId: 'wall-2', side: 'back', ref: 'left', to: 'near', offset: 10 }, end: null },
    });
    expect(landingInterval({ ...KC, walls: result.walls }, result.walls[2], 'start'))
      .toMatchObject({ a: 10, b: 14.5 });
  });

  it('anchor 4: grows the opposite end past the front-face landing thickness', () => {
    const result = extendPastCorner(K, 'wall-3', 'end', 5);
    expect(result.ok).toBe(true);
    expect(result.walls[2]).toEqual({ ...K.walls[2], x2: -133, connections: { start: null, end: null } });
    expect(result.walls[3]).toEqual({
      ...K.walls[3], connections: { start: null, end: null },
      landings: { start: { wallId: 'wall-3', side: 'front', ref: 'right', to: 'near', offset: 5 }, end: null },
    });
    expect(landingInterval({ ...K, walls: result.walls }, result.walls[3], 'start'))
      .toMatchObject({ a: 124, b: 128.5 });
    expect(result.walls[1]).toBe(K.walls[1]);
  });

  it('anchor 5: refuses an endpoint that is already landed', () => {
    expect(extendPastCorner(K, 'wall-2', 'end', 5)).toEqual({
      ok: false, reason: 'not-corner', message: null, walls: K.walls,
    });
  });

  it('anchor 6: refuses an in-line wall using its numbered label', () => {
    const subject = room({ ...K, walls: [
      ...K.walls.map((entry) => entry.id === 'wall-3' ? {
        ...entry, connections: { ...entry.connections, start: { wallId: 'wall-5', endpoint: 'start' } },
      } : entry),
      wall({ id: 'wall-5', x1: 0.5, y1: 9, x2: 20.5, y2: 9,
        connections: { start: { wallId: 'wall-3', endpoint: 'start' }, end: null } }),
    ] });
    expect(canExtendPast(subject, 'wall-3', 'start')).toBe(false);
    expect(extendPastCorner(subject, 'wall-3', 'start', 5)).toEqual({
      ok: false, reason: 'in-line',
      message: "Wall 3 and Wall 5 are in line: there's no corner to extend past.", walls: subject.walls,
    });
  });

  it('anchor 7: reanchors only the growing end on each face without compensating runs', () => {
    const back = run({ id: 'back', wallSide: 'back', x: 20, width: 50,
      anchors: { left: false, right: true } });
    const front = run({ id: 'front', x: 0, width: 30, anchors: { left: true, right: false } });
    const own = run({ id: 'own', x: 10, width: 30, anchors: { left: false, right: true } });
    const otherAnchor = run({ id: 'other', anchors: { left: { to: 'wall', wallId: 'wall-4' }, right: true } });
    const subject = room({ ...KC, walls: KC.walls.map((entry) => {
      if (entry.id === 'wall-3') return { ...entry, runs: [back, front, otherAnchor] };
      if (entry.id === 'wall-2') return { ...entry, runs: [own] };
      return entry;
    }) });
    expect(wallSideFrame(subject, subject.walls[2], 'back').length).toBe(85);
    const result = extendPastCorner(subject, 'wall-3', 'start', 39);
    expect(result.ok).toBe(true);
    expect(result.walls[2].runs).toEqual([
      { ...back, anchors: { left: false, right: { to: 'wall', wallId: 'wall-2' } } },
      { ...front, anchors: { left: false, right: false } },
      otherAnchor,
    ]);
    expect(result.walls[1].runs[0]).toBe(own);
    expect(landingInterval({ ...subject, walls: result.walls }, result.walls[1], 'end').a).toBe(80.5);
    expect(subject.walls[2].runs).toEqual([back, front, otherAnchor]);
  });

  it('anchor 8: makes the extended landing a corner again to recover KC', () => {
    const extended = extendPastCorner(KC, 'wall-3', 'start', 39);
    const result = makeWallCorner({ ...KC, walls: extended.walls }, 'wall-2', 'end', { move: 'host' });
    expect(result).toEqual({ ok: true, reason: null, message: null, walls: KC.walls });
  });

  it('anchor 9: offers extension only on a connected corner', () => {
    expect(canExtendPast(KC, 'wall-3', 'start')).toBe(true);
    expect(canExtendPast(K, 'wall-3', 'start')).toBe(false);
    expect(canExtendPast(KC, 'missing', 'start')).toBe(false);
    expect(canExtendPast(KC, 'wall-3', 'invalid')).toBe(false);
    expect(extendPastCorner(KC, 'missing', 'start', 5).reason).toBe('not-corner');
    expect(extendPastCorner(KC, 'wall-3', 'invalid', 5).reason).toBe('not-corner');
  });

  it('refuses negative, nonnumeric and nonfinite amounts without changing anything', () => {
    for (const amount of [-1, NaN, Infinity, -Infinity, '5', null]) {
      const result = extendPastCorner(KC, 'wall-3', 'start', amount);
      expect(result).toEqual({ ok: false, reason: 'invalid-amount', message: null, walls: KC.walls });
      expect(result.walls).toBe(KC.walls);
    }
  });

  it('refuses a wall pulled shorter than one inch but accepts exactly one inch', () => {
    const short = room({ ...KC, walls: KC.walls.map((entry) => entry.id === 'wall-2'
      ? { ...entry, y1: 14 } : entry) });
    const before = structuredClone(short);
    expect(extendPastCorner(short, 'wall-3', 'start', 5)).toEqual({
      ok: false, reason: 'too-short', message: 'Wall 2 is too short to land on Wall 3.', walls: short.walls,
    });
    expect(short).toEqual(before);
    const enough = room({ ...short, walls: short.walls.map((entry) => entry.id === 'wall-2'
      ? { ...entry, y1: 14.5 } : entry) });
    expect(extendPastCorner(enough, 'wall-3', 'start', 5).ok).toBe(true);
  });

  it('passes a landing refusal through and returns the original walls', () => {
    const subject = room({ ...KC, walls: KC.walls.map((entry) => entry.id === 'wall-3' ? {
      ...entry, landings: { start: null, end: {
        wallId: 'wall-2', side: 'front', ref: 'left', to: 'near', offset: 20,
      } },
    } : entry) });
    const before = structuredClone(subject);
    const result = extendPastCorner(subject, 'wall-3', 'start', 39);
    expect(result).toEqual({
      ok: false, reason: 'host-lands-on-wall',
      message: "Wall 3 lands on Wall 2, so Wall 2 can't land on it.", walls: subject.walls,
    });
    expect(result.walls).toBe(subject.walls);
    expect(subject).toEqual(before);
  });

  it('uses the ten-degree cutoff for both parallel directions', () => {
    for (const degrees of [0, 9.99, 10, 10.01, 169.99, 170, 170.01, 180]) {
      const angle = degrees * Math.PI / 180;
      const subject = room({ walls: [
        wall({ id: 'a', x1: -100, y1: 0, x2: 0, y2: 0,
          connections: { start: null, end: { wallId: 'b', endpoint: 'start' } } }),
        wall({ id: 'b', x1: 0, y1: 0, x2: 100 * Math.cos(angle), y2: 100 * Math.sin(angle),
          connections: { start: { wallId: 'a', endpoint: 'end' }, end: null } }),
      ] });
      const allowed = degrees > 10 && degrees < 170;
      expect(canExtendPast(subject, 'a', 'end'), `${degrees} degrees`).toBe(allowed);
      if (!allowed) expect(extendPastCorner(subject, 'a', 'end', 5).reason).toBe('in-line');
    }
  });

  it('projects both angled wall edges and preserves flipped walls and run anchors', () => {
    const ownRun = run({ anchors: { left: true, right: true } });
    const subject = room({ ...KC, walls: KC.walls.map((entry) => entry.id === 'wall-2'
      ? { ...entry, x1: -13.5, flipped: true, runs: [ownRun] } : entry) });
    const result = extendPastCorner(subject, 'wall-3', 'start', 7);
    expect(result.ok).toBe(true);
    expect(result.walls[1]).toMatchObject({ flipped: true, runs: [ownRun], y2: 13.5 });
    expect(result.walls[1].runs[0]).toBe(ownRun);
    expect(result.walls[1].x2).toBeCloseTo(-38.5 + 25 * 4.5 / 74.5);
    const after = { ...subject, walls: result.walls };
    const interval = landingInterval(after, result.walls[1], 'end');
    const frame = wallSideFrame(after, result.walls[2], 'back');
    // §1 projects the edges to A's line, while the back-face interval is shifted
    // along the angled B by A's thickness. Keep both prescribed measurements.
    expect(result.walls[2].x1).toBeCloseTo(-38.5 + 4.5 * Math.hypot(25, 74.5) / 74.5 + 7);
    const measuredOffset = 7 - 25 * 4.5 / 74.5;
    expect(frame.length - interval.b).toBeCloseTo(measuredOffset);
    expect(result.walls[1].landings.end).toMatchObject({ side: 'back', ref: 'right', to: 'near' });
    expect(result.walls[1].landings.end.offset).toBeCloseTo(measuredOffset);
  });
});
