import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { cornerAt } from '../corners.js';
import { furnitureBaseGroups } from '../furnitureBaseGroups.js';
import { isOpenWallEnd, runBands, waterfallEnds } from '../runBands.js';
import { runScene } from '../runScene.js';
import { room as buildRoom, run as buildRun, wall as buildWall } from '../../../test/builders.js';

const settings = DEFAULT_SETTINGS;
const ends = { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } };
const desk = buildRun({ id: 'desk', x: 0, width: 60, top: 'wood', ends, anchors: { left: true, right: true } });

function setup({ connected = false, thickness = 0, length = 60, runOverrides = {} } = {}) {
  const run = buildRun({ ...desk, ...runOverrides });
  const w1 = buildWall({ id: 'w1', x1: 0, y1: 0, x2: length, y2: 0, length, thickness, runs: [run],
    connections: { start: null, end: connected ? { wallId: 'w2', endpoint: 'start' } : null } });
  const w2 = buildWall({ id: 'w2', x1: length, y1: 0, x2: length, y2: 60,
    connections: { start: connected ? { wallId: 'w1', endpoint: 'end' } : null, end: null } });
  const room = buildRoom({ walls: connected ? [w1, w2] : [w1], wallOrder: connected ? ['w1', 'w2'] : ['w1'] });
  return { room, wall: room.walls[0], run };
}

const topEdges = ({ room, wall, run }) => {
  const [top] = runBands(room, wall, run, settings, runScene(room, wall, run, settings)).countertops;
  return [top.x, top.x + top.width];
};

describe('FX4 b anchored ends at an open wall end act as free ends', () => {
  it('Room 9 Wall 4: a wood top anchored to a peninsula end overhangs 3/4" there', () => {
    const open = setup();
    expect(cornerAt(open.room, open.wall, 'right').type).toBe('open');
    expect(isOpenWallEnd(open.room, open.wall, open.run, 'right', settings)).toBe(true);
    expect(topEdges(open)).toEqual([-0.75, 60.75]);
  });

  it('a wall-to-wall corner still stops the top at the wall', () => {
    const closed = setup({ connected: true });
    expect(cornerAt(closed.room, closed.wall, 'right').type).toBe('inside');
    expect(isOpenWallEnd(closed.room, closed.wall, closed.run, 'right', settings)).toBe(false);
    expect(topEdges(closed)[1]).toBe(60);
  });

  it('a waterfall at an open wall end is allowed; at a corner it stays blocked', () => {
    const open = setup({ runOverrides: { waterfall: { right: {} } } });
    expect(waterfallEnds(open.room, open.wall, open.run, settings).right).toEqual({ baseToLeg: false });
    const closed = setup({ connected: true, runOverrides: { waterfall: { right: {} } } });
    expect(waterfallEnds(closed.room, closed.wall, closed.run, settings).warnings)
      .toEqual([{ code: 'waterfall-end-blocked', runId: 'desk', side: 'right' }]);
  });

  it('a furniture base at an open wall end gets no scribe there', () => {
    const open = setup();
    open.room.profile = { ...open.room.profile, baseKind: 'furniture_base' };
    const [group] = furnitureBaseGroups(open.room, settings);
    expect(group.orderedWidth).toBeCloseTo(group.width, 6);
  });
});

describe('FX4 b.1 open ends at any wall thickness', () => {
  it('returns the top at both open ends of a 4 1/2" wall and allows a waterfall (anchor 1)', () => {
    const thick = setup({ thickness: 4.5, runOverrides: { waterfall: { right: {} } } });
    expect(isOpenWallEnd(thick.room, thick.wall, thick.run, 'right', settings)).toBe(true);
    expect(topEdges(setup({ thickness: 4.5 }))).toEqual([-0.75, 60.75]);
    expect(waterfallEnds(thick.room, thick.wall, thick.run, settings))
      .toEqual({ left: null, right: { baseToLeg: false }, warnings: [] });
  });

  it('keeps the right top edge at 60 with a connected return wall (anchor 2)', () => {
    const thick = setup({ thickness: 4.5, connected: true });
    expect(isOpenWallEnd(thick.room, thick.wall, thick.run, 'right', settings)).toBe(false);
    expect(topEdges(thick)).toEqual([-0.75, 60]);
  });

  it('preserves Room 9 Wall 4 top edges at 18 13/16 … 79 7/8 (anchor 3)', () => {
    const input = setup({ length: 79.125, runOverrides: { x: 19.5625, width: 59.5625,
      anchors: { left: false, right: true } } });
    expect(topEdges(input)).toEqual([18.8125, 79.875]);
  });

  it('overhangs an exposed base run by 3/4 inch and sets its toe kick back at the left end', () => {
    const input = setup({ thickness: 4.5 });
    const bands = runBands(input.room, input.wall, input.run, settings,
      runScene(input.room, input.wall, input.run, settings));
    expect(bands.countertops[0].x).toBe(input.run.x - 0.75);
    expect(bands.toeKicks[0].x).toBe(input.run.x + settings.bandDepths.toeKickEndPanelSetback);
  });

  it('adds no furniture base scribe at a thick wall open end', () => {
    const input = setup({ thickness: 4.5 });
    input.room.profile = { ...input.room.profile, baseKind: 'furniture_base' };
    const [group] = furnitureBaseGroups(input.room, settings);
    expect(group.orderedWidth).toBeCloseTo(group.width, 6);
  });
});
