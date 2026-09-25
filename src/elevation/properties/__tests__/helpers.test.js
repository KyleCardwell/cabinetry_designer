import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { describeAnchor } from '../../model/room.js';
import {
  formatCornerReserve,
  formatRunOverhang,
  formatRunWarning,
  lastCabinetItem,
  lastRunItem,
  prepareRunUpdate,
  resolveSelectedPiece,
} from '../helpers.js';

function run(overrides = {}) {
  return {
    id: 'run-1',
    cabinetTypeId: CABINET_TYPE_IDS.BASE,
    x: 0,
    width: 60,
    z: 4,
    height: 30.5,
    depth: 24,
    ends: {
      left: { type: 'filler', width: null },
      right: { type: 'filler', width: null },
    },
    autoCount: false,
    maxCabinetWidth: null,
    items: [],
    heightMode: 'manual',
    overrides: {},
    anchors: { left: false, right: false },
    ...overrides,
  };
}

describe('properties helpers', () => {
  it('15. describes inside, outside, and opening anchor offsets', () => {
    const wallA = {
      id: 'A', name: '', numberOverride: null,
      x1: 0, y1: 0, x2: 120, y2: 0,
      height: 96, thickness: 4.5, flipped: false,
      connections: { start: null, end: { wallId: 'B', endpoint: 'start' } },
      profile: {}, runs: [], openings: [],
    };
    const angle = 60;
    const direction = (180 - angle) * Math.PI / 180;
    const wallB = {
      ...wallA,
      id: 'B',
      x1: 120,
      y1: 0,
      x2: 120 + 96 * Math.cos(direction),
      y2: 96 * Math.sin(direction),
      connections: { start: { wallId: 'A', endpoint: 'end' }, end: null },
    };
    const insideRun = run({ anchors: { left: false, right: true } });
    const neighborRun = run({ id: 'neighbor', anchors: { left: true, right: false } });
    wallA.runs = [insideRun];
    wallB.runs = [neighborRun];
    const insideRoom = {
      id: 'room', profile: { ...DEFAULT_SETTINGS.defaultProfile },
      wallOrder: ['A', 'B'], walls: [wallA, wallB],
    };
    expect(describeAnchor(insideRoom, wallA, insideRun, 'right', DEFAULT_SETTINGS))
      .toBe('Reserve 42 9/16" (face 28 3/4" + back 13 7/8")');

    const outsideWall = { ...wallA, flipped: true, runs: [] };
    const outsideNeighbor = { ...wallB, x2: 120, y2: -96, runs: [] };
    const outsideRoom = { ...insideRoom, walls: [outsideWall, outsideNeighbor] };
    const outsideRun = run({ anchors: { left: false, right: true } });
    expect(describeAnchor(outsideRoom, outsideWall, outsideRun, 'right', DEFAULT_SETTINGS))
      .toBe('Flush with the wall end');
    outsideRun.cornerClearance = { right: 2 };
    expect(describeAnchor(outsideRoom, outsideWall, outsideRun, 'right', DEFAULT_SETTINGS))
      .toBe('Held back 2"');
    outsideRun.cornerClearance.right = -2;
    expect(describeAnchor(outsideRoom, outsideWall, outsideRun, 'right', DEFAULT_SETTINGS))
      .toBe('2" past the wall end');

    const opening = {
      id: 'window-1', kind: 'window', label: 'W1', measureMode: 'jamb',
      width: 36, height: 48, sillZ: 36, offset: 12, offsetFrom: 'right',
      offsetAnchor: 'edge', casing: { width: 3, thickness: 0.75 },
    };
    const openingWall = { ...wallA, connections: { start: null, end: null }, openings: [opening] };
    const openingRoom = { ...insideRoom, wallOrder: ['A'], walls: [openingWall] };
    const openingRun = run({
      anchors: {
        left: false,
        right: { to: 'opening', openingId: opening.id, edge: 'casing', clearance: 4 },
      },
    });
    expect(describeAnchor(openingRoom, openingWall, openingRun, 'right', DEFAULT_SETTINGS))
      .toBe('4" clear of W1 casing');
    openingRun.anchors.right.clearance = -1.5;
    expect(describeAnchor(openingRoom, openingWall, openingRun, 'right', DEFAULT_SETTINGS))
      .toBe('1 1/2" into W1 casing');
  });

  it('formats automatic, face-only, and custom corner reserves', () => {
    expect(formatCornerReserve({
      face: 28.7232,
      back: 13.8564,
      total: 42.5796,
      source: 'auto',
    })).toBe('Reserve 42 9/16" (face 28 3/4" + back 13 7/8")');
    expect(formatCornerReserve({
      face: 28.7232,
      back: 13.8564,
      total: 28.7232,
      source: 'face',
    })).toBe('Reserve 28 3/4" · Face only');
    expect(formatCornerReserve({
      face: 28.7232,
      back: 13.8564,
      total: 30,
      source: 'custom',
    })).toBe('Reserve 30" · Custom');
  });

  it('formats left, right, and two-sided run overhangs', () => {
    expect(formatRunOverhang({ x: -6, width: 60 }, 120)).toBe('Overhangs left 6"');
    expect(formatRunOverhang({ x: 100, width: 50 }, 120)).toBe('Overhangs right 30"');
    expect(formatRunOverhang({ x: -6, width: 134 }, 120))
      .toBe('Overhangs left 6" · right 8"');
    expect(formatRunOverhang({ x: 10, width: 50 }, 120)).toBeNull();
  });

  it('formats a run warning for a blocked opening', () => {
    expect(formatRunWarning({ code: 'blocks-opening', label: 'W1' })).toBe('Blocks W1');
    expect(formatRunWarning({ code: 'other', message: 'Existing warning' }))
      .toBe('Existing warning');
    expect(formatRunWarning({ code: 'other' })).toBeNull();
  });

  it('builds a validated run patch without mutating the stored run', () => {
    const selected = run();
    const wall = {
      id: 'wall-1',
      x1: 0,
      y1: 0,
      x2: 120,
      y2: 0,
      height: 96,
      profile: {},
      connections: { start: null, end: null },
      runs: [selected],
    };
    const room = { profile: { ...DEFAULT_SETTINGS.defaultProfile }, walls: [wall] };
    const result = prepareRunUpdate(room, wall.id, selected, DEFAULT_SETTINGS, { x: 12, width: 72 });

    expect(result.validation).toEqual({ ok: true, reason: null });
    expect(result.patchedRun).toMatchObject({ x: 12, width: 72 });
    expect(selected).toMatchObject({ x: 0, width: 60 });
  });

  it('reports an invalid prospective run patch', () => {
    const selected = run();
    const wall = {
      id: 'wall-1',
      x1: 0,
      y1: 0,
      x2: 120,
      y2: 0,
      height: 96,
      profile: {},
      connections: { start: null, end: null },
      runs: [selected],
    };
    const room = { profile: { ...DEFAULT_SETTINGS.defaultProfile }, walls: [wall] };
    const result = prepareRunUpdate(room, wall.id, selected, DEFAULT_SETTINGS, { width: 157 });

    expect(result.validation).toEqual({ ok: false, reason: 'out-of-bounds' });
  });

  it('resolves stored items and derived end pieces', () => {
    const selected = run({ items: [{ id: 'cab-1', kind: 'cabinet', width: null }] });
    const layout = {
      pieces: [
        { id: 'run-1:left', role: 'end-left' },
        { id: 'cab-1', role: 'item' },
      ],
    };

    expect(resolveSelectedPiece(selected, layout, 'cab-1')).toMatchObject({
      item: selected.items[0],
      side: null,
    });
    expect(resolveSelectedPiece(selected, layout, 'run-1:left')).toMatchObject({
      item: null,
      side: 'left',
    });
    expect(resolveSelectedPiece(selected, layout, 'missing')).toBeNull();
  });

  it('finds the final item and the final cabinet independently', () => {
    const selected = run({
      items: [
        { id: 'cab-1', kind: 'cabinet', width: null },
        { id: 'fill-1', kind: 'filler', width: 3 },
      ],
    });

    expect(lastRunItem(selected).id).toBe('fill-1');
    expect(lastCabinetItem(selected).id).toBe('cab-1');
    expect(lastRunItem(run())).toBeNull();
    expect(lastCabinetItem(run())).toBeNull();
  });
});
