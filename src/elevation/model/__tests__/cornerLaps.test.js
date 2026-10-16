import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cornerLap } from '../cornerLaps.js';
import { cornerReserve, cornerReserveParts, frontDepth } from '../corners.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { gridFromItems } from '../grid.js';
import { runFillerThickness } from '../planPieces.js';
import { roomDiagnostics, syncRoom } from '../room.js';
import { describeAnchor, endMinWidthsForRun, horizontalResolution, resolveRunAnchorDatum } from '../runAnchors.js';
import { splitRun } from '../splitRun.js';
import { formatCornerReserve, formatRunWarning } from '../../properties/helpers.js';
import { toRoomDocument } from '../../store/persistence.js';

const settings = DEFAULT_SETTINGS;

function fixture(angle = 90) {
  function run(id) {
    return {
      id, cabinetTypeId: CABINET_TYPE_IDS.BASE,
      x: 0, width: 48, z: 4, height: 30.5, depth: 24,
      anchors: { left: true, right: true },
      ends: { left: { type: 'filler', width: null }, right: { type: 'filler', width: null } },
      heightMode: 'manual', overrides: {}, autoCount: false,
      grid: gridFromItems(id, [{ id: `${id}-cab`, kind: 'cabinet', width: 45 }]),
    };
  }
  const a = run('a');
  const b = run('b');
  const direction = (180 - angle) * Math.PI / 180;
  const wallA = {
    id: 'A', x1: 0, y1: 0, x2: 84.875, y2: 0, height: 96, thickness: 4.5,
    connections: { end: { wallId: 'B', endpoint: 'start' } },
    profile: {}, openings: [], runs: [a],
  };
  const wallB = {
    ...wallA, id: 'B', x1: 84.875, y1: 0,
    x2: 84.875 + 120.875 * Math.cos(direction), y2: 120.875 * Math.sin(direction),
    connections: { start: { wallId: 'A', endpoint: 'end' } }, runs: [b],
  };
  const room = { id: 'room', profile: { ...settings.defaultProfile }, walls: [wallA, wallB] };
  return { room, wallA, wallB, a, b };
}

function manual(run, side, cornerLap) {
  run.endFiller = { [side]: { cornerLap } };
}

describe('FL2 step a corner filler laps', () => {
  it.each([
    ['C1', 24.0625, 24.875, true, 'free-end'],
    ['C2', 24.0625, 24.875, true, 'shorter'],
    ['C3', 24.0625, 24.875, true, 'tie'],
    ['C4', 24.875, 24.0625, false, 'manual'],
    ['C5', 24.0625, 24.0625, true, 'manual'],
    ['C6', 24.875, 24.875, null, null],
    ['C7', 24.0625, 24.875, true, 'shorter'],
    ['C8', 24.25, 24.875, true, 'shorter'],
    ['C9', 30, 24.875, true, 'shorter'],
    ['C10', 24.875, 24.875, null, null],
    ['C11', 34.0295, 35.1786, true, 'shorter'],
  ])('%s: reserves and lap decision', (name, reserveA, reserveB, laps, source) => {
    const { room, wallA, wallB, a, b } = fixture(name === 'C11' ? 135 : 90);
    if (name === 'C1') a.anchors.left = false;
    if (name === 'C3') wallA.x1 = -36;
    if (name === 'C4' || name === 'C5') manual(b, 'left', 'over');
    if (name === 'C5') manual(a, 'right', 'over');
    if (name === 'C6') b.ends.left.type = 'end_panel';
    if (name === 'C7') {
      room.doorStyles = [{ ...DEFAULT_DOOR_STYLE, id: 'mdf', designId: 'slab-mdf', thickness: 0.75 }];
      b.doorStyleId = 'mdf';
      b._doorThickness = 0.75;
    }
    if (name === 'C8') b._doorThickness = 1;
    if (name === 'C9') a.cornerClearance = { right: 30 };
    if (name === 'C10') a.ends.right.width = 3;
    expect(cornerReserve(room, wallA, 'right', a, settings)).toBeCloseTo(reserveA, 3);
    expect(cornerReserve(room, wallB, 'left', b, settings)).toBeCloseTo(reserveB, 3);
    const decision = cornerLap(room, wallA, a, 'right', settings);
    if (laps === null) {
      expect(decision).toBeNull();
      expect(cornerLap(room, wallB, b, 'left', settings)).toBeNull();
      return;
    }
    expect(decision).toEqual({
      laps, auto: name === 'C4' || name === 'C5' ? false : true,
      source, amount: name === 'C7' ? 0.75 : 0.8125,
      neighborRunId: 'b', neighborWallId: 'B', conflict: name === 'C5',
    });
    expect(cornerLap(room, wallB, b, 'left', settings)).toMatchObject({
      laps: name === 'C4' || name === 'C5', conflict: name === 'C5',
      neighborRunId: 'a', neighborWallId: 'A', amount: 0.8125,
    });
    if (name === 'C2') { // FL2.1 F4: Euro neighbor keeps the standard filler lap amount.
      expect(horizontalResolution(room, wallA, a, settings, { laps: false }).width).toBe(60);
      expect(horizontalResolution(room, wallB, b, settings, { laps: false }).width).toBe(96);
      expect(resolveRunAnchorDatum(room, wallA, a, 'right', settings, { laps: false }).x).toBe(60);
      expect(horizontalResolution(room, wallA, a, settings).width).toBe(60.8125);
      const description = 'Reserve 24 1/16" (face 24 7/8" + back 0" − lap 13/16")';
      expect(describeAnchor(room, wallA, a, 'right', settings)).toBe(description); // A3
      expect(formatCornerReserve(cornerReserveParts(room, wallA, 'right', a, settings))).toBe(description);
      const synced = syncRoom(room, settings);
      expect(syncRoom(synced, settings)).toEqual(synced);
    }
    if (name === 'C4') {
      expect(cornerLap(room, wallA, a, 'right', settings, { ignoreOwn: true }).laps).toBe(false);
      expect(cornerLap(room, wallB, b, 'left', settings, { ignoreOwn: true }).laps).toBe(false);
    }
    if (name === 'C5') {
      const diagnostics = roomDiagnostics(room, settings);
      for (const id of ['a', 'b']) {
        const warning = diagnostics[id].warnings.find(({ code }) => code === 'corner-lap-conflict');
        expect(warning).toMatchObject({ laps: true });
        expect(formatRunWarning(warning)).toBe('Both corner fillers are set to lap over');
      }
    }
  });

  it('honors die-in choices, reports both-into conflicts, and ignores its own manual choice for Auto', () => {
    const { room, wallA, wallB, a, b } = fixture();
    manual(a, 'right', 'into');
    expect(cornerLap(room, wallA, a, 'right', settings)).toMatchObject({ laps: false, auto: true, source: 'manual' });
    expect(cornerLap(room, wallA, a, 'right', settings, { ignoreOwn: true })).toMatchObject({ laps: true, conflict: false });
    expect(cornerLap(room, wallB, b, 'left', settings).laps).toBe(true);
    manual(b, 'left', 'into');
    for (const [wall, run, side] of [[wallA, a, 'right'], [wallB, b, 'left']]) {
      expect(cornerLap(room, wall, run, side, settings)).toMatchObject({ laps: false, auto: true, conflict: true });
      expect(cornerReserve(room, wall, side, run, settings)).toBe(24.875);
      const warning = roomDiagnostics(room, settings)[run.id].warnings.find(({ code }) => code === 'corner-lap-conflict');
      expect(formatRunWarning(warning)).toBe('Both corner fillers are set to die in');
    }
  });

  it.each(['C1', 'C2', 'C3'])('%s: keeps boxes fixed and puts all extra span into the corner filler', (name) => {
    const { room, a, wallA } = fixture();
    if (name === 'C1') a.anchors.left = false;
    if (name === 'C3') wallA.x1 = -36;
    const offRoom = structuredClone(room);
    manual(offRoom.walls[0].runs[0], 'right', 'into');
    manual(offRoom.walls[1].runs[0], 'left', 'into');
    const off = syncRoom(offRoom, settings);
    const on = syncRoom(room, settings);
    function pieces(resolved) {
      const wall = resolved.walls[0];
      const run = wall.runs[0];
      return splitRun(run, settings, { endMinWidths: endMinWidthsForRun(resolved, wall, run, settings) }).pieces;
    }
    const before = pieces(off);
    const after = pieces(on);
    expect(after.filter(({ role }) => role === 'item')).toEqual(before.filter(({ role }) => role === 'item'));
    expect(after.find(({ role }) => role === 'end-right').width
      - before.find(({ role }) => role === 'end-right').width).toBe(0.8125);
    expect(on.walls[0].runs[0].width - off.walls[0].runs[0].width).toBe(0.8125);
    expect(syncRoom(on, settings)).toEqual(on);
    const saved = toRoomDocument(on);
    expect(saved.walls[0].runs[0]).not.toHaveProperty('_cornerLapWidth');
    expect(saved.walls[0].runs[0].width).toBe(off.walls[0].runs[0].width);
    expect(syncRoom(saved, settings)).toEqual(on);
    const broken = structuredClone(on);
    const farAnchor = broken.walls[0].runs[0].anchors.left;
    broken.walls[0].runs[0].anchors.left = { to: 'opening', openingId: 'missing', edge: 'jamb' };
    const recovered = syncRoom(broken, settings);
    recovered.walls[0].runs[0].anchors.left = farAnchor;
    expect(syncRoom(recovered, settings)).toEqual(on);
    manual(on.walls[0].runs[0], 'right', 'into');
    manual(on.walls[1].runs[0], 'left', 'into');
    const removed = syncRoom(on, settings);
    expect(pieces(removed)).toEqual(before);
    expect(removed.walls[0].runs[0]).not.toHaveProperty('_cornerLapWidth');
  });

  it('uses the reserve-setting compatible neighbor and requires an anchored flex filler pair', () => {
    const { room, wallA, wallB, a, b } = fixture();
    const shallow = { ...b, id: 'shallow', depth: 12, ends: { left: { type: 'end_panel' } } };
    wallB.runs.unshift(shallow);
    wallB.runs.push({ ...b, id: 'upper', cabinetTypeId: CABINET_TYPE_IDS.UPPER, depth: 40 });
    wallB.runs.push({ ...b, id: 'unanchored', depth: 48, anchors: {} });
    expect(cornerReserveParts(room, wallA, 'right', a, settings).neighborRunId).toBe('b');
    expect(cornerLap(room, wallA, a, 'right', settings).laps).toBe(true);
    shallow.depth = 30;
    expect(cornerLap(room, wallA, a, 'right', settings)).toBeNull();
    shallow.depth = 12;
    a.anchors.right = false;
    expect(cornerLap(room, wallA, a, 'right', settings)).toBeNull();
    a.anchors.right = true;
    for (const type of ['blind', 'none', 'end_panel']) {
      a.ends.right.type = type;
      expect(cornerLap(room, wallA, a, 'right', settings)).toBeNull();
    }
  });

  it('subtracts the scaled lap from face-only and acute auto reserves, with an explicit laps-off path', () => {
    const { room, wallA, a } = fixture(60);
    const off = cornerReserveParts(room, wallA, 'right', a, settings, { laps: false });
    expect(off.lap).toBe(0);
    const parts = cornerReserveParts(room, wallA, 'right', a, settings);
    expect(parts.lap).toBeCloseTo(0.8125 / Math.sin(Math.PI / 3));
    expect(parts.total).toBeCloseTo(off.face + off.back - parts.lap);
    a.cornerClearance = { right: 'face' };
    expect(cornerReserve(room, wallA, 'right', a, settings)).toBeCloseTo(off.face - parts.lap);
    expect(cornerReserve(room, wallA, 'right', a, settings, { laps: false })).toBe(off.face);
  });
});

describe('FL2.1 step a face frame corner lap amount', () => {
  it.each([
    ['F1', 0.8125, false, 24.8125],
    ['F2', 1, false, 25],
    ['F3', 0.8125, true, 24.8125],
  ])('%s: laps over the neighbor frame thickness', (_name, thickness, mdf, expectedFrontDepth) => {
    const frameSettings = { ...settings, insetFrame: { ...settings.insetFrame, thickness } };
    for (const ownFrame of [false, true]) {
      const { room, a, b } = fixture();
      b.style = { cabinetStyleId: 14 };
      if (ownFrame) a.style = { cabinetStyleId: 14 };
      if (mdf) {
        room.doorStyles = [{ ...DEFAULT_DOOR_STYLE, id: 'mdf', designId: 'slab-mdf', thickness: 0.75 }];
        b.doorStyleId = 'mdf';
      }
      const resolved = syncRoom(room, frameSettings);
      const [wallA, wallB] = resolved.walls;
      const [resolvedA] = wallA.runs;
      const [resolvedB] = wallB.runs;
      expect(resolvedB._frame.thickness).toBe(thickness);
      expect(frontDepth(resolvedB, frameSettings)).toBe(expectedFrontDepth);
      if (mdf) expect(runFillerThickness(resolved, wallB, resolvedB, frameSettings)).toBe(0.75);
      expect(cornerLap(resolved, wallA, resolvedA, 'right', frameSettings)).toMatchObject({
        laps: true, amount: thickness, neighborRunId: 'b',
      });
      expect(cornerReserve(resolved, wallA, 'right', resolvedA, frameSettings)).toBe(24);
      expect(cornerLap(resolved, wallB, resolvedB, 'left', frameSettings).amount)
        .toBe(ownFrame ? thickness : 0.8125);
    }
  });
});
