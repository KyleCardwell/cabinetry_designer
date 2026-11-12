import { describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { shippingList } from '../../../reports/shippingList.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { normalizeCornerEnd } from '../cornerEnd.js';
import { elevationPartNumbers } from '../elevationPartNumbers.js';
import { partNumbers, wallBadgeGroups } from '../partNumbers.js';
import { roomParts } from '../parts.js';
import { defaultPick, pickStack } from '../pick.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';

const S = { ...DEFAULT_SETTINGS, runFlex: 0 };
const ROOM_B = room({ style: { cabinetStyleId: 14 }, walls: [
  wall({ runs: [run({ autoCount: false, width: 144, items: [fixed('cc', 36), auto('a')],
    anchors: { left: true, right: false },
    ends: { left: normalizeCornerEnd({}), right: { type: 'none' } } })],
  connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }),
  wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
    connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } } }),
] });
const ROOM_C = structuredClone(ROOM_B);
ROOM_C.walls[0].runs[0].ends.left.corner.kind = 45;

function resolved(subject) {
  const synced = syncRoom(subject, S);
  const owner = resolveWall(synced, synced.walls[0]);
  const returning = resolveWall(synced, synced.walls[1]);
  return { subject: synced, owner, returning, scene: runScene(synced, owner, owner.runs[0], S) };
}

describe('corner frame parts (CC6)', () => {
  it('exposes Room B’s separate frame and lists it after pieces, before region frames', () => {
    const { subject, scene } = resolved(ROOM_B);
    expect(scene.cornerFrames).toHaveLength(1);
    expect(scene.frames.cornerFrames).toBe(scene.cornerFrames);
    const parts = roomParts(subject, S);
    expect(parts.find(({ key }) => key === 'cc:frame')).toEqual({
      key: 'cc:frame', kind: 'frame', source: 'frame', columnId: 'cc',
      wallId: 'wall-1', side: 'front', runId: 'run-1', pieceId: null, molding: null,
      x: 24, width: 11.25, z: 4, height: 30.5,
    });
    expect(parts.filter(({ runId }) => runId === 'run-1').map(({ key }) => key))
      .toEqual(['cc', 'a', 'cc:frame', 'frame:a']);
  });

  it('uses Room C’s front-line elevation extent for the frame part', () => {
    const { subject } = resolved(ROOM_C);
    const frame = roomParts(subject, S).find(({ key }) => key === 'cc:frame');
    expect(frame).toMatchObject({ kind: 'frame', source: 'frame', x: 24.8125, z: 4, height: 30.5 });
    expect(frame.width).toBeCloseTo(11.5240, 3);
  });

  it('numbers the corner frame after the corner, neighbour and its region frame', () => {
    const { subject } = resolved(ROOM_B);
    expect(partNumbers(subject, S).parts.map(({ key, number }) => [key, number]))
      .toEqual([['cc', 1], ['a', 2], ['frame:a', 3], ['cc:frame', 4], ['molding:toeKick', 5]]);
    const overridden = { ...subject, partNumberOverrides: { 'cc:frame': 17 } };
    expect(partNumbers(overridden, S).byKey).toEqual(new Map([
      ['cc:frame', 17], ['cc', 1], ['a', 2], ['frame:a', 3], ['molding:toeKick', 4],
    ]));
  });

  it('retains Room B and C’s true-size members and miter cuts', () => {
    const b = resolved(ROOM_B).scene.cornerFrames[0];
    expect(b.members).toHaveLength(5);
    expect(b.members.filter(({ kind, side }) => kind === 'rail' && side === 'A'))
      .toEqual([expect.objectContaining({ length: 11.25 }), expect.objectContaining({ length: 11.25 })]);
    expect(b.members.filter(({ kind, side }) => kind === 'rail' && side === 'B'))
      .toEqual([expect.objectContaining({ length: 10.4375 }), expect.objectContaining({ length: 10.4375 })]);
    expect(b.members.find(({ kind }) => kind === 'stile'))
      .toMatchObject({ side: 'B', width: 1.5625, z: 4, height: 30.5, length: 30.5 });
    const c = resolved(ROOM_C).scene.cornerFrames[0];
    expect(c.members).toHaveLength(4);
    for (const stile of c.members.filter(({ kind }) => kind === 'stile')) {
      expect(stile).toMatchObject({ cut: 22.5, width: 1.5, height: 30.5 });
      expect(stile.backWidth).toBeCloseTo(1.8365, 3);
    }
    for (const rail of c.members.filter(({ kind }) => kind === 'rail')) {
      expect(rail.length).toBeCloseTo(13.2975, 3);
      expect(rail.width).toBe(rail.length);
    }
  });

  it('keeps two corner frames in run order after the neighbouring region frames', () => {
    const source = structuredClone(ROOM_B);
    const owner = source.walls[0].runs[0];
    owner.grid = run({ items: [fixed('cc', 36), auto('a'), fixed('cc2', 36)] }).grid;
    owner.anchors.right = true;
    owner.ends.right = normalizeCornerEnd({});
    source.walls[0].connections.end = { wallId: 'wall-3', endpoint: 'start' };
    source.walls.push(wall({ id: 'wall-3', x1: 144, y1: 0, x2: 144, y2: 144,
      connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null } }));
    const { subject, scene } = resolved(source);
    expect(scene.cornerFrames.map(({ columnId }) => columnId)).toEqual(['cc', 'cc2']);
    expect(roomParts(subject, S).filter(({ runId }) => runId === 'run-1').map(({ key }) => key))
      .toEqual(['cc', 'a', 'cc2', 'cc:frame', 'cc2:frame', 'frame:a']);
    expect(partNumbers(subject, S).parts.filter(({ runId }) => runId === 'run-1')
      .map(({ key, number }) => [key, number]))
      .toEqual([['cc', 1], ['a', 2], ['cc2', 3], ['frame:a', 4], ['cc:frame', 5], ['cc2:frame', 6]]);
  });

  it('builds shipping lists for both corners, with region frames and no corner-frame row', () => {
    for (const source of [ROOM_B, ROOM_C]) {
      const { subject } = resolved(source);
      const result = shippingList(subject, S);
      expect(result.rows.some(({ key }) => key === 'cc:frame')).toBe(false);
      expect(result.rows.find(({ key }) => key === 'frame:a')).toMatchObject({ kind: 'frame', number: 3 });
      expect(result.rows.find(({ key }) => key === 'cc')).toMatchObject({ kind: 'cabinet', number: 1 });
    }
  });

  it('anchors badges on each elevation’s nearest own stile, falling back to the rails’ centre', () => {
    for (const source of [ROOM_B, ROOM_C]) {
      const { subject, owner, returning, scene } = resolved(source);
      const frame = scene.cornerFrames[0];
      const expectedX = frame.kind === 90 ? [29.625, 107.96875] : [35.8062184335, 118.6571699141];
      for (const [index, view] of [owner, returning].entries()) {
        const badge = wallBadgeGroups(subject, view, S).find(({ key }) => key === 'cc:frame');
        expect(badge).toMatchObject({ lift: 2, pieces: [{ id: 'cc:frame' }] });
        const anchor = badge.pieces[0].anchor;
        expect(anchor.x).toBeCloseTo(expectedX[index], 9);
        expect(anchor.z).toBe(19.25);
        expect(elevationPartNumbers(subject, view, 'front', S).find(({ key }) => key === 'cc:frame'))
          .toMatchObject({ text: '4', x: anchor.x, leader: expect.objectContaining({ x2: anchor.x, z2: anchor.z }) });
      }
    }
  });

  it('picks frame rails and stiles on either elevation as the corner cabinet, with doors on or off', () => {
    for (const source of [ROOM_B, ROOM_C]) {
      const { subject, owner, returning, scene } = resolved(source);
      const frame = scene.cornerFrames[0];
      for (const [view, projection] of [[owner, frame.owner], [returning, frame.return]]) {
        for (const member of projection.members) {
          const point = { x: member.x + member.width / 2, z: member.z + member.height / 2 };
          for (const doorsOff of [false, true]) {
            const stack = pickStack(subject, view, S, point, { doorsOff });
            const target = { key: 'cc:frame', selection: {
              cornerOf: { wallId: 'wall-1', runId: 'run-1', side: 'left' },
            } };
            expect(stack[0]).toMatchObject(target);
            expect(defaultPick(stack)).toMatchObject(target);
          }
        }
      }
      const opening = frame.owner;
      expect(pickStack(subject, owner, S,
        { x: opening.x + opening.width / 2, z: opening.z + opening.height / 2 })
        .some(({ key }) => key === 'cc:frame')).toBe(false);
    }
  });

  it('mirrors right corner extents, badges and picking and excludes Euro, beaded and inactive corners', () => {
    for (const source of [ROOM_B, ROOM_C]) {
      const mirrored = structuredClone(source);
      const owner = mirrored.walls[0].runs[0];
      owner.grid = run({ items: [auto('a'), fixed('cc', 36)] }).grid;
      owner.anchors = { left: false, right: true };
      owner.ends = { left: { type: 'none' }, right: owner.ends.left };
      mirrored.walls[0].connections = { start: null, end: { wallId: 'wall-2', endpoint: 'start' } };
      Object.assign(mirrored.walls[1], { x1: 144, y1: 0, x2: 144, y2: 144,
        connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null } });
      const left = resolved(source).scene.cornerFrames[0];
      const { subject, owner: view, returning, scene } = resolved(mirrored);
      const right = scene.cornerFrames[0];
      expect(right.owner.width).toBeCloseTo(left.owner.width, 10);
      expect(right.owner.x).toBeCloseTo(144 - left.owner.x - left.owner.width, 10);
      for (const [wall, projection] of [[view, right.owner], [returning, right.return]]) {
        const member = projection.members[0];
        expect(defaultPick(pickStack(subject, wall, S,
          { x: member.x + member.width / 2, z: member.z + member.height / 2 })))
          .toMatchObject({ key: 'cc:frame', selection: {
            cornerOf: { wallId: 'wall-1', runId: 'run-1', side: 'right' },
          } });
        expect(wallBadgeGroups(subject, wall, S).some(({ key }) => key === 'cc:frame')).toBe(true);
      }
    }
    for (const mode of ['euro', 'beaded', 'inactive']) {
      const source = structuredClone(ROOM_B);
      if (mode === 'inactive') source.walls[0].runs[0].anchors.left = false;
      else source.style.cabinetStyleId = mode === 'euro' ? 13 : 15;
      const { subject, scene } = resolved(source);
      expect(scene.cornerFrames).toEqual([]);
      expect(roomParts(subject, S).some(({ key }) => key === 'cc:frame')).toBe(false);
    }
  });
});
