import { describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { normalizeCornerEnd } from '../cornerEnd.js';
import { cornerFrame } from '../cornerFrame.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { resolveWall, syncRoom } from '../room.js';

const S = { ...DEFAULT_SETTINGS, runFlex: 0 };

function roomB({ corner = {}, items = [fixed('cc', 36), auto('a')], owner = {}, returnRun = null,
  style = { cabinetStyleId: 14 }, right = false } = {}) {
  const side = right ? 'right' : 'left';
  return syncRoom(room({ style, walls: [
    wall({ runs: [run({ autoCount: false, width: 144, items: right ? [...items].reverse() : items,
      anchors: { left: !right, right },
      ends: { [side]: normalizeCornerEnd({ corner }), [right ? 'left' : 'right']: { type: 'none' } },
      ...owner })],
    connections: right ? { start: null, end: { wallId: 'wall-2', endpoint: 'start' } }
      : { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }),
    wall({ id: 'wall-2', x1: right ? 144 : 0, y1: right ? 0 : 144,
      x2: right ? 144 : 0, y2: right ? 144 : 0,
      connections: right ? { start: { wallId: 'wall-1', endpoint: 'end' }, end: null }
        : { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
      runs: returnRun ? [returnRun] : [] }),
  ] }), S);
}

function frameOf(subject, settings = S, side = 'left', supplied = false) {
  const resolved = resolveWall(subject, subject.walls[0]);
  const owner = resolved.runs[0];
  const layout = layoutRun(subject, resolved, owner, settings);
  const faces = supplied ? runFaceLayouts(subject, resolved, owner, settings, layout) : undefined;
  return cornerFrame(subject, resolved, owner, side, settings, layout, faces);
}

describe('CC6 step b Corner 90 frame', () => {
  it('anchor 1: runs A long, with its neighbour lapping and a 10.3125 opening', () => {
    const result = frameOf(roomB());
    expect(result).toMatchObject({ columnId: 'cc', kind: 90, side: 'left',
      frame: { z: 4, height: 30.5, thickness: 0.8125 }, warnings: [] });
    expect(result.legs[0]).toEqual({ id: 'A', x0: 24, x1: 35.25, stileAtEnd: null,
      rails: [{ p0: 24, p1: 35.25, z: 4, height: 1.5 },
        { p0: 24, p1: 35.25, z: 33, height: 1.5 }],
      openings: [{ p0: 24.9375, p1: 35.25, z: 5.5, height: 27.5 }] });
    expect(result.members.filter(({ side }) => side === 'A').map(({ length }) => length)).toEqual([11.25, 11.25]);
  });

  it('anchor 2: butts B into A and covers its return panel with an own stile', () => {
    const result = frameOf(roomB());
    expect(result.legs[1]).toEqual({ id: 'B', x0: 24.8125, x1: 36.8125,
      rails: [{ p0: 24.8125, p1: 35.25, z: 4, height: 1.5 },
        { p0: 24.8125, p1: 35.25, z: 33, height: 1.5 }],
      openings: [{ p0: 24.9375, p1: 35.25, z: 5.5, height: 27.5 }],
      stileAtEnd: { x0: 35.25, x1: 36.8125 } });
    expect(result.members.filter(({ side, kind }) => side === 'B' && kind === 'rail')
      .map(({ length }) => length)).toEqual([10.4375, 10.4375]);
    expect(result.members.find(({ kind }) => kind === 'stile')).toMatchObject({
      side: 'B', width: 1.5625, z: 4, height: 30.5, length: 30.5,
    });
  });

  it('anchor 3: overhangs a bare return end by lap', () => {
    expect(frameOf(roomB({ corner: { returnPiece: 'none' } })).legs[1].stileAtEnd)
      .toEqual({ x0: 35.25, x1: 36.75 });
  });

  it('anchor 4: includes a return filler in its wider stile', () => {
    expect(frameOf(roomB({ corner: { returnPiece: 'filler', returnWidth: 1.5 } })).legs[1].stileAtEnd)
      .toEqual({ x0: 35.25, x1: 37.5 });
  });

  it('anchor 5: Room D has no own stile beside a framed return run', () => {
    const subject = roomB({ returnRun: run({ id: 'return', width: 108, autoCount: false,
      items: [auto('r')], anchors: { left: false, right: true },
      ends: { left: { type: 'none' }, right: { type: 'none' } } }) });
    const leg = frameOf(subject).legs[1];
    expect(leg.stileAtEnd).toBeNull();
    expect(leg.rails.every(({ p1 }) => p1 === 35.25)).toBe(true);
  });

  it('anchor 6: an isolated corner column gets an own A stile', () => {
    expect(frameOf(roomB({ items: [fixed('cc', 36)] })).legs[0].stileAtEnd)
      .toEqual({ x0: 35.25, x1: 36.75 });
  });

  it('anchor 7: long-door choices do not move the frame openings', () => {
    const expected = frameOf(roomB()).legs;
    for (const doors of ['a_long', 'b_long']) {
      expect(frameOf(roomB({ corner: { doors } })).legs).toEqual(expected);
    }
  });

  it('anchor 8: Euro, inactive, Corner 45 and beaded corners have no Corner 90 frame', () => {
    for (const options of [
      { style: { cabinetStyleId: 13 } },
      { owner: { anchors: { left: false, right: false } } },
      { corner: { kind: 45 } },
      { style: { cabinetStyleId: 15 } },
    ]) expect(frameOf(roomB(options))).toBeNull();
  });

  it('keeps mid rails on the same rows as the resolved faces, with or without supplied layouts', () => {
    const cc = { ...fixed('cc', 36), face: { direction: 'vertical', children: [
      { type: 'drawer_front', size: 6 }, { type: 'door', size: null },
    ] } };
    const subject = roomB({ items: [cc, auto('a')] });
    const result = frameOf(subject);
    expect(frameOf(subject, S, 'left', true)).toEqual(result);
    expect(result.legs[0].openings).toHaveLength(2);
    expect(result.legs[0].rails.map(({ z, height }) => [z, height])).toEqual([
      [4, 1.5], [25.5, 1.5], [33, 1.5],
    ]);
    expect(result.legs[1].rails.map(({ z, height }) => [z, height]))
      .toEqual(result.legs[0].rails.map(({ z, height }) => [z, height]));
  });

  it('includes the upper frame drop without moving its top rail', () => {
    const result = frameOf(roomB({ owner: { cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30, depth: 12 } }));
    expect(result.frame).toEqual({ z: 53.25, height: 30.75, thickness: 0.8125 });
    expect(result.legs[0].rails.map(({ z, height }) => [z, height])).toEqual([[53.25, 1.5], [82.5, 1.5]]);
  });

  it('mirrors member coordinates at a right corner while keeping true lengths', () => {
    const result = frameOf(roomB({ right: true }), S, 'right');
    expect(result.side).toBe('right');
    expect(result.legs).toEqual(frameOf(roomB()).legs);
    expect(result.members[0]).toMatchObject({ side: 'A', x: 108.75, width: 11.25, length: 11.25 });
  });

  it('treats a Euro return run as an exposed leg end', () => {
    const subject = roomB({ returnRun: run({ id: 'return', width: 108, autoCount: false,
      style: { cabinetStyleId: 13 }, items: [auto('r')], anchors: { left: false, right: true },
      ends: { left: { type: 'none' }, right: { type: 'none' } } }) });
    expect(frameOf(subject).legs[1].stileAtEnd).toEqual({ x0: 35.25, x1: 36.75 });
  });
});
