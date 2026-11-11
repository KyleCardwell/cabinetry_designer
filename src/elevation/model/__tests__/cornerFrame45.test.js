import { describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { cellPieces } from '../cells.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { normalizeCornerEnd } from '../cornerEnd.js';
import { cornerFrame } from '../cornerFrame.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { boxInsets, frameMembers, frameRegions, regionOpenings } from '../frames.js';
import { resolveWall, syncRoom } from '../room.js';

const S = { ...DEFAULT_SETTINGS, runFlex: 0 };
const ROOM_C = room({ style: { cabinetStyleId: 14 }, walls: [
  wall({ runs: [run({ autoCount: false, width: 144, items: [fixed('cc', 36), auto('a')],
    anchors: { left: true, right: false },
    ends: { left: normalizeCornerEnd({ corner: { kind: 45 } }), right: { type: 'none' } } })],
  connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }),
  wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
    connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } } }),
] });

function resolved(subject, wallIndex = 0, side = 'left', supplied = false, settings = S) {
  const synced = syncRoom(subject, settings);
  const view = resolveWall(synced, synced.walls[wallIndex]);
  const owner = view.runs[0];
  const layout = layoutRun(synced, view, owner, settings);
  const cells = cellPieces(owner, layout);
  const faces = runFaceLayouts(synced, view, owner, settings, layout);
  const frames = frameRegions(synced, owner, cells, settings, faces);
  return { frame: cornerFrame(synced, view, owner, side, settings, layout, supplied ? faces : undefined),
    cells, frames, faces };
}

function expectPoint(actual, expected, precision = 3) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, precision));
}

describe('CC6 step c Corner 45 frame', () => {
  it('anchors 1–2: makes a true miter with standard visible stiles and true-length rails', () => {
    const { frame } = resolved(ROOM_C);
    expect(frame).toMatchObject({ columnId: 'cc', kind: 45, side: 'left',
      frame: { z: 4, height: 30.5, thickness: 0.8125 }, warnings: [] });
    expect(frame).not.toHaveProperty('legs');
    const { diagonal: d, members } = frame;
    expect(d.a).toEqual([36, 24]);
    expect(d.b).toEqual([24, 36]);
    expectPoint(d.pa, [36.3366, 24.8125]);
    expectPoint(d.pb, [24.8125, 36.3366]);
    expect(d.trueWidth).toBeCloseTo(16.9706, 3);
    expect(d.frontWidth).toBeCloseTo(16.2975, 3);
    for (const stile of d.stiles) {
      expect(stile.width).toBe(1.5);
      expect(stile.backWidth).toBeCloseTo(1.8365, 3);
      expect(stile.cut).toBeCloseTo(22.5, 6);
    }
    expect(d.stiles.map(({ end }) => end)).toEqual(['a', 'b']);
    expect(d.openings).toHaveLength(1);
    expect(d.openings[0]).toMatchObject({ p0: 1.5, z: 5.5, height: 27.5 });
    const openingWidth = d.openings[0].p1 - d.openings[0].p0;
    expect(openingWidth).toBeCloseTo(13.2975, 3);
    expect(openingWidth).toBeCloseTo(d.trueWidth - d.stiles[0].backWidth - d.stiles[1].backWidth, 10);
    expect(members.filter(({ kind }) => kind === 'stile')).toHaveLength(2);
    for (const member of members.filter(({ kind }) => kind === 'stile')) {
      expect(member).toMatchObject({ width: 1.5, z: 4, height: 30.5, length: 30.5, cut: 22.5 });
      expect(member.backWidth).toBeCloseTo(1.8365, 3);
    }
    expect(d.rails.map(({ z, height }) => [z, height])).toEqual([[4, 1.5], [33, 1.5]]);
    for (const member of members.filter(({ kind }) => kind === 'rail')) {
      expect(member.length).toBeCloseTo(openingWidth, 10);
      expect(member).not.toHaveProperty('cut');
    }
  });

  it('anchor 3: projects the true frame on each elevation about its front miter point', () => {
    const { diagonal: d, members } = resolved(ROOM_C).frame;
    const k = (d.a[0] - d.b[0]) / d.trueWidth;
    const shownA = (p) => d.pa[0] - p * k;
    expect(k).toBeCloseTo(0.7071, 4);
    expectPoint([shownA(1.5), shownA(0)], [35.2759, 36.3365]);
    expectPoint([shownA(d.openings[0].p1), shownA(d.openings[0].p0)], [25.8732, 35.2759]);
    expect((d.openings[0].p1 - d.openings[0].p0) * k).toBeCloseTo(9.4027, 3);
    expectPoint([shownA(d.frontWidth), shownA(d.frontWidth - 1.5)], [24.8125, 25.8732]);
    const shownMembers = members.map((member) => [d.pa[0] + (member.x - d.pa[0]) * k,
      d.pa[0] + (member.x + member.width - d.pa[0]) * k]);
    expectPoint(shownMembers[0], [35.2759, 36.3365]);
    expectPoint(shownMembers[1], [24.8125, 25.8732]);
    shownMembers.slice(2).forEach((span) => expectPoint(span, [25.8732, 35.2759]));
    const shownB = (p) => d.pb[1] - (d.frontWidth - p) * k;
    expect(shownB(0)).toBeCloseTo(d.pa[1], 10);
    expect(shownB(d.frontWidth)).toBeCloseTo(d.pb[1], 10);
  });

  it('anchor 4: uses each half-angle on an uneven diagonal', () => {
    const subject = structuredClone(ROOM_C);
    subject.walls[0].runs[0].ends.left.corner.depthB = 15;
    const d = resolved(subject).frame.diagonal;
    expect(d.trueWidth).toBeCloseTo(24.1868, 3);
    expectPoint(d.stiles.map(({ cut }) => cut), [14.872, 30.128], 2);
    expectPoint(d.stiles.map(({ backWidth }) => backWidth), [1.7158, 1.9715]);
    expect(d.a[0] - d.b[0]).toBe(21);
    expect(d.pa[1]).toBeCloseTo(24.8125, 10);
    expect(d.pb[0]).toBeCloseTo(15.8125, 10);
  });

  it('anchor 5: cuts the owner neighbour and narrows its box behind a wider stile', () => {
    const { frames, cells, faces } = resolved(ROOM_C);
    expect(frames.cornerLaps).toEqual([]);
    const region = frames.regions[0];
    expect(region.cuts.left).toBeCloseTo(22.5, 10);
    const member = frameMembers(region, regionOpenings(region, faces))[0];
    expect(member.x).toBe(36);
    expect(member.x + member.width).toBeCloseTo(37.8365, 3);
    expect(member.x + 0.8125 * Math.tan(region.cuts.left * Math.PI / 180)).toBeCloseTo(36.3365, 3);
    const box = cells.pieces.find(({ id }) => id === 'a');
    expect(box.x + boxInsets(frames, cells, S).get('a').left).toBeCloseTo(37.0865, 3);
  });

  it('anchor 6: cuts the return neighbour in its own wall frame', () => {
    const subject = structuredClone(ROOM_C);
    subject.walls[1].runs = [run({ id: 'return', width: 108, autoCount: false,
      items: [auto('r')], anchors: { left: false, right: true },
      ends: { left: { type: 'none' }, right: { type: 'none' } } })];
    const { frames, cells } = resolved(subject, 1, 'right');
    expect(frames.regions[0].cuts.right).toBeCloseTo(22.5, 10);
    const box = cells.pieces.find(({ id }) => id === 'r');
    const inset = boxInsets(frames, cells, S).get('r').right;
    expect(144 - (box.x + box.width - inset)).toBeCloseTo(37.0865, 3);
  });

  it('anchors 6a–6b: sets the bevelled box inside the frame with deeper inside long points', () => {
    const d = resolved(ROOM_C).frame.diagonal;
    expectPoint([d.box.hang.a, d.box.hang.b], [0.7759, 0.7759]);
    const polygon = [[0, 0], [35.4514, 0], [35.4514, 24.5486], [24.5486, 35.4514], [0, 35.4514]];
    d.box.polygon.forEach((point, i) => expectPoint(point, polygon[i]));
    expectPoint(d.box.sideLongPoints.a, [34.7014, 25.2986]);
    const subject = structuredClone(ROOM_C);
    subject.walls[0].runs[0].ends.left.corner.depthB = 15;
    const uneven = resolved(subject).frame.diagonal.box;
    expectPoint([uneven.hang.a, uneven.hang.b], [0.8520, 0.4598]);
    expectPoint(uneven.polygon[2], [35.2603, 24.4227]);
    expectPoint(uneven.polygon[3], [15.3993, 35.7719]);
    expect(uneven.sideLongPoints.a[1]).toBeCloseTo(24.8513, 3);
    expect(uneven.sideLongPoints.b[0]).toBeCloseTo(16.7118, 3);
  });

  it('anchor 7: leaves Euro, inactive, beaded and Corner 90 behaviour intact', () => {
    for (const cabinetStyleId of [13, 15]) {
      const result = resolved({ ...ROOM_C, style: { cabinetStyleId } });
      expect(result.frame).toBeNull();
      expect(result.frames.regions.every((region) => !region.cuts)).toBe(true);
      if (cabinetStyleId === 15) expect(result.faces.get('a').box.x)
        .toBe(result.cells.pieces.find(({ id }) => id === 'a').x + S.insetFrame.stile);
    }
    const subject = structuredClone(ROOM_C);
    subject.walls[0].runs[0].anchors.left = false;
    expect(resolved(subject).frame).toBeNull();
    subject.walls[0].runs[0].anchors.left = true;
    subject.walls[0].runs[0].ends.left.corner.kind = 90;
    const result = resolved(subject).frame;
    expect(result.kind).toBe(90);
    expect(result.legs).toHaveLength(2);
    expect(result).not.toHaveProperty('diagonal');
  });

  it('shares resolved rail rows, supplied layouts and room stile width', () => {
    const subject = structuredClone(ROOM_C);
    subject.walls[0].runs[0].grid.cells[0].node.face = { direction: 'vertical', children: [
      { type: 'drawer_front', size: 6 }, { type: 'door', size: null },
    ] };
    const settings = { ...S, insetFrame: { ...S.insetFrame, stile: 1 } };
    const { frame } = resolved(subject, 0, 'left', false, settings);
    expect(resolved(subject, 0, 'left', true, settings).frame).toEqual(frame);
    expect(frame.diagonal.stiles.every(({ width }) => width === 2)).toBe(true);
    expect(frame.diagonal.openings).toHaveLength(2);
    expect(frame.diagonal.rails.map(({ z, height }) => [z, height]))
      .toEqual([[4, 1.5], [25.5, 1.5], [33, 1.5]]);
  });

  it('mirrors true-size members and the neighbour cut at a right corner', () => {
    const subject = room({ style: ROOM_C.style, walls: [
      wall({ runs: [run({ autoCount: false, width: 144, items: [auto('a'), fixed('cc', 36)],
        anchors: { left: false, right: true },
        ends: { left: { type: 'none' }, right: normalizeCornerEnd({ corner: { kind: 45 } }) } })],
      connections: { start: null, end: { wallId: 'wall-2', endpoint: 'start' } } }),
      wall({ id: 'wall-2', x1: 144, y1: 0, x2: 144, y2: 144,
        connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null } }),
    ] });
    const { frame, frames, cells } = resolved(subject, 0, 'right');
    const left = resolved(ROOM_C).frame;
    expect(frame.diagonal).toEqual(left.diagonal);
    expect(frames.regions[0].cuts.right).toBeCloseTo(22.5, 10);
    expect(boxInsets(frames, cells, S).get('a').right).toBeCloseTo(1.0865, 3);
    frame.members.forEach((member, i) => {
      expect(member.x).toBeCloseTo(144 - left.members[i].x - left.members[i].width, 10);
      expect(member.length).toBe(left.members[i].length);
    });
  });
});
