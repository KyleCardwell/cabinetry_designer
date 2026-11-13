import { describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { cornerEnd, normalizeCornerEnd } from '../cornerEnd.js';
import { cornerFrame } from '../cornerFrame.js';
import { squashRect } from '../cornerSquash.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { resolveWall, syncRoom } from '../room.js';

const S = { ...DEFAULT_SETTINGS, runFlex: 0, teamDoorStyle: {
  ...DEFAULT_DOOR_STYLE, profiles: { ...DEFAULT_DOOR_STYLE.profiles, outside: 'p-edge' },
} };
const ROOM_B = room({ style: { cabinetStyleId: 14 }, walls: [
  wall({ runs: [run({ autoCount: false, width: 144, items: [fixed('cc', 36), auto('a')],
    anchors: { left: true, right: false },
    ends: { left: normalizeCornerEnd({}), right: { type: 'none' } } })],
  connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }),
  wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
    connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } } }),
] });

function resolved(subject, settings = S, side = 'left') {
  const synced = syncRoom(subject, settings);
  const view = resolveWall(synced, synced.walls[0]);
  const owner = view.runs[0];
  const layout = layoutRun(synced, view, owner, settings);
  const faces = runFaceLayouts(synced, view, owner, settings, layout);
  return { entry: faces.get('cc'), neighbour: faces.get('a'),
    corner: cornerEnd(synced, view, owner, side, settings, layout),
    frame: cornerFrame(synced, view, owner, side, settings, layout, faces) };
}

describe('corner faces in frame openings (CC6)', () => {
  it('fits Room B leg A in its frame opening at the neighbour’s height', () => {
    const { entry, neighbour, frame } = resolved(ROOM_B);
    expect(frame.legs[0].openings[0]).toEqual({ p0: 24.9375, p1: 35.25, z: 5.5, height: 27.5 });
    expect(entry.openings).toEqual([{ path: 'r', x: 24.9375, width: 10.3125, z: 5.5, height: 27.5 }]);
    expect(entry.faces).toHaveLength(1);
    expect(entry.faces[0]).toMatchObject({ path: 'r', type: 'door', x: 25.03125, width: 10.125,
      z: 5.59375, height: 27.3125 });
    expect(entry.faces[0].z).toBe(neighbour.faces[0].z);
    expect(entry.faces[0].height).toBe(neighbour.faces[0].height);
    const square = resolved(ROOM_B, { ...S, teamDoorStyle: DEFAULT_DOOR_STYLE }).entry;
    expect(square.faces[0]).toMatchObject({ x: 24.9375, width: 10.3125, z: 5.5, height: 27.5 });
  });

  it('fits both a door and panel in the leg B return opening', () => {
    for (const legBFace of ['door', 'panel']) {
      const subject = structuredClone(ROOM_B);
      subject.walls[0].runs[0].ends.left.corner.legBFace = legBFace;
      const { entry } = resolved(subject);
      expect(entry.cornerReturn).toMatchObject({ at: 144, dir: -1 });
      const [face] = entry.cornerReturn.legB.faces;
      expect(face).toMatchObject({ type: legBFace, x: 108.84375, width: 10.125,
        z: 5.59375, height: 27.3125 });
      expect(face.x + face.width).toBe(118.96875);
    }
  });

  it('fits Room C at true size and projects around the shared front miter points', () => {
    const subject = structuredClone(ROOM_B);
    subject.walls[0].runs[0].ends.left.corner.kind = 45;
    const { entry, frame, corner } = resolved(subject);
    const d = frame.diagonal;
    expect(entry.openings[0].width).toBeCloseTo(13.2975, 3);
    expect(entry.faces[0].width).toBeCloseTo(13.1100, 3);
    expect(entry.openings[0].width).toBeCloseTo(d.openings[0].p1 - d.openings[0].p0, 10);
    expect(entry.squash).toMatchObject({ pivot: d.pa[0] });
    expect(entry.squash.k).toBeCloseTo(0.7071, 4);
    expect(squashRect(entry.faces[0], entry.squash).width).toBeCloseTo(9.2701, 3);
    expect(entry.cornerReturn.squash).toMatchObject({ from: d.pa[0] - d.frontWidth, pivot: 144 - d.pb[1] });
    const returnOpening = squashRect(entry.openings[0], entry.cornerReturn.squash);
    expect(returnOpening.x).toBeCloseTo(144 - d.pb[1] + 1.5 * entry.cornerReturn.squash.k, 10);
    expect(returnOpening.width).toBeCloseTo(9.4027, 3);
    expect(corner.faceLayout.feet).toEqual({ a: d.pa, b: d.pb });
    expect(corner.faceLayout.ordered).toBeCloseTo(entry.faces[0].width, 10);
    expect(entry.faces[0]).toMatchObject({ z: 5.59375, height: 27.3125 });
  });

  it('chooses pair doors from the opening width and uses the ordinary 1/8 pair gap', () => {
    for (const [width, pair] of [[60, true], [49.5, false]]) {
      const subject = structuredClone(ROOM_B);
      subject.walls[0].runs[0].grid.cols[0].size = width;
      const { entry } = resolved(subject);
      expect(entry.faces).toHaveLength(pair ? 2 : 1);
      if (pair) {
        const [left, right] = entry.faces;
        expect(left).toMatchObject({ type: 'pair_door', width: 17.03125 });
        expect(right.width).toBe(left.width);
        expect(right.x - left.x - left.width).toBe(0.125);
        expect(left.x - entry.openings[0].x).toBe(0.0625);
      } else expect(entry.faces[0].type).toBe('door');
    }
  });

  it('preserves Euro Room A’s CC3.1 sizing, long doors and ordered diagonal', () => {
    const subject = structuredClone(ROOM_B);
    subject.style.cabinetStyleId = 13;
    let result = resolved(subject);
    expect(result.frame).toBeNull();
    expect(result.entry.faces[0]).toMatchObject({ x: 25, width: 10.9375 });
    subject.walls[0].runs[0].ends.left.corner.doors = 'a_long';
    result = resolved(subject);
    expect(result.entry.faces[0]).toMatchObject({ x: 24.0625, width: 11.875 });
    subject.walls[0].runs[0].ends.left.corner.kind = 45;
    result = resolved(subject);
    expect(result.entry.box.width).toBeCloseTo(15.8215, 3);
    expect(result.entry.faces[0].width).toBe(15.5625);
    expect(result.entry.squash.pivot).toBeCloseTo(36.0625, 3);
  });

  it('uses framed rows and fits for split face trees on both corner kinds and the return leg', () => {
    for (const kind of [90, 45]) {
      const subject = structuredClone(ROOM_B);
      const owner = subject.walls[0].runs[0];
      owner.ends.left.corner.kind = kind;
      const tree = { direction: 'vertical', children: [
        { type: 'drawer_front', size: 6 }, { type: 'door', size: null },
      ] };
      owner.grid.cells.forEach(({ node }) => { node.face = structuredClone(tree); });
      const { entry, frame, neighbour } = resolved(subject);
      const rows = entry.openings.map(({ z, height }) => ({ z, height })).sort((a, b) => a.z - b.z);
      const openings = kind === 90 ? frame.legs[0].openings : frame.diagonal.openings;
      expect(rows).toEqual(openings.map(({ z, height }) => ({ z, height })));
      expect(entry.faces.map(({ z, height }) => ({ z, height })))
        .toEqual(neighbour.faces.filter(({ half }) => half !== 'right').map(({ z, height }) => ({ z, height })));
      if (kind === 90) expect(entry.cornerReturn.legB.faces.map(({ z, height }) => ({ z, height })))
        .toEqual(entry.faces.map(({ z, height }) => ({ z, height })));
    }
  });

  it('mirrors framed faces at right corners and keeps uneven diagonal openings aligned', () => {
    for (const kind of [90, 45]) {
      const subject = structuredClone(ROOM_B);
      subject.walls[0].runs[0].ends.left.corner.kind = kind;
      subject.walls[0].runs[0].ends.left.corner.depthB = 15;
      const left = resolved(subject);
      const owner = subject.walls[0].runs[0];
      owner.grid = run({ items: [auto('a'), fixed('cc', 36)] }).grid;
      owner.anchors = { left: false, right: true };
      owner.ends = { left: { type: 'none' }, right: owner.ends.left };
      subject.walls[0].connections = { start: null, end: { wallId: 'wall-2', endpoint: 'start' } };
      Object.assign(subject.walls[1], { x1: 144, y1: 0, x2: 144, y2: 144,
        connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null } });
      const right = resolved(subject, S, 'right');
      const face = right.entry.faces[0];
      expect(face.width).toBeCloseTo(left.entry.faces[0].width, 10);
      expect(face.x).toBeCloseTo(144 - left.entry.faces[0].x - face.width, 10);
      if (kind === 45) {
        const { diagonal: d } = right.frame;
        expect(right.entry.openings[0].width).toBeCloseTo(d.openings[0].p1 - d.openings[0].p0, 10);
        expect(right.entry.squash.pivot).toBeCloseTo(144 - d.pa[0], 10);
        expect(right.entry.cornerReturn.squash.pivot).toBeCloseTo(d.pb[1], 10);
      }
    }
  });

  it('keeps long-door choices inside the fixed framed openings and leaves excluded corners alone', () => {
    const original = resolved(ROOM_B).entry;
    for (const doors of ['a_long', 'b_long']) {
      const subject = structuredClone(ROOM_B);
      subject.walls[0].runs[0].ends.left.corner.doors = doors;
      expect(resolved(subject).entry).toEqual(original);
    }
    const beaded = structuredClone(ROOM_B);
    beaded.style.cabinetStyleId = 15;
    expect(resolved(beaded).frame).toBeNull();
    const inactive = structuredClone(ROOM_B);
    inactive.walls[0].runs[0].anchors.left = false;
    const result = resolved(inactive);
    expect(result.frame).toBeNull();
    expect(result.entry).not.toHaveProperty('corner');
  });
});
