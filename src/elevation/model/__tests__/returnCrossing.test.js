import { describe, expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cornerShapes } from '../cornerParts.js';
import { cornerReserveParts, frontDepth } from '../corners.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const NONE = { type: 'none', width: null };

function deskRoom(host = {}) {
  return room({ walls: [
    wall({ id: 'H', x2: 120, runs: [run({
      id: 'T', cabinetTypeId: CABINET_TYPE_IDS.TALL, z: 4, height: 88, depth: 18, autoCount: false,
      ends: { left: NONE, right: NONE }, items: [auto('A'), auto('B'), auto('C')], ...host,
    })] }),
    wall({
      id: 'W', x1: 60, y1: 0, x2: 60, y2: 72, thickness: 0,
      landings: { start: { wallId: 'H', side: 'front', ref: 'left', to: 'near', offset: 60 }, end: null },
      runs: [run({ id: 'R', width: 40, items: [auto('desk')], anchors: { left: true, right: false } })],
    }),
  ] });
}

const desk = (synced) => synced.walls[1].runs[0];

describe('DR5 a return lands on the front of a host run that crosses its wall', () => {
  it('starts the return at the crossing run\'s front, not the wall', () => {
    const synced = syncRoom(deskRoom(), settings);
    const depth = frontDepth(synced.walls[0].runs[0], settings);
    expect(depth).toBeGreaterThan(18);
    expect(Math.abs(desk(synced).x - depth)).toBeLessThanOrEqual(1 / 32);
    expect(desk(synced).width).toBe(40);
    expect(cornerReserveParts(synced, synced.walls[1], 'left', desk(synced), settings).neighborRunId).toBeNull();
    expect(syncRoom(synced, settings)).toEqual(synced);
  });

  it('ignores host runs that miss the landing or sit in another band', () => {
    expect(desk(syncRoom(deskRoom({ width: 50 }), settings)).x).toBe(0);
    expect(desk(syncRoom(deskRoom({ x: 70, width: 50 }), settings)).x).toBe(0);
    expect(desk(syncRoom(deskRoom({ cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 36, depth: 12 }), settings)).x)
      .toBe(0);
  });

  it('follows the landing when the wall moves along the host', () => {
    const synced = syncRoom(deskRoom(), settings);
    synced.walls[1].landings.start.offset = 110;
    const moved = syncRoom(synced, settings);
    expect(desk(moved).x).toBe(desk(synced).x);
  });
});

describe('DR5 the crossing run is a return on the landed wall', () => {
  it('cuts the crossing run as a section at the landed wall\'s end, keyed like a corner return', () => {
    const synced = syncRoom(deskRoom(), settings);
    const shapes = cornerShapes(synced, synced.walls[1], 'front', settings, { returns: 'end' });
    const shape = shapes.find(({ key }) => key === 'left:H:T');
    expect(shape).toMatchObject({ kind: 'return', wallId: 'H', runId: 'T' });
    const body = shape.parts.filter(({ kind }) => kind === 'section');
    expect(Math.min(...body.map(({ x }) => x))).toBe(0);
    expect(Math.max(...body.map(({ x, width }) => x + width)))
      .toBeCloseTo(frontDepth(synced.walls[0].runs[0], settings), 6);
    expect(body.every(({ z, height }) => z === 4 && height === 88)).toBe(true);
  });

  it('shows nothing for a host run that misses the landing', () => {
    const synced = syncRoom(deskRoom({ width: 50 }), settings);
    expect(cornerShapes(synced, synced.walls[1], 'front', settings).some(({ runId }) => runId === 'T'))
      .toBe(false);
  });
});

/** A desk of 4" drawers over a void, with a filler on the left and an end panel on the right. */
function floatingDesk(panelHeight) {
  const leaf = (id, kind, extra = {}) => ({ col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id, kind, ...extra } });
  const column = {
    id: 'col', cols: [{ id: 'c0', size: null, sizeMode: 'auto' }],
    rows: [{ id: 'r0', size: 4, sizeMode: 'manual' }, { id: 'r1', size: null, sizeMode: 'auto' }],
    cells: [leaf('drawers', 'cabinet', { face: { type: 'drawer_front', size: null } }), { ...leaf('gap', 'void'), row: 1 }],
  };
  const desk = run({
    id: 'D', x: 0, width: 60, z: 4, height: 24.5, depth: 24, autoCount: false, heightMode: 'manual',
    ends: { left: { type: 'filler', width: null }, right: { type: 'end_panel', width: null, height: panelHeight } },
  });
  desk.grid = {
    id: 'D:grid', cols: [{ id: 'col:col', size: null, sizeMode: 'auto' }], rows: [{ id: 'D:row', size: null, sizeMode: 'auto' }],
    cells: [{ col: 0, row: 0, colSpan: 1, rowSpan: 1, node: column }],
  };
  const stored = room({ walls: [wall({ id: 'A', x2: 60, runs: [desk] })] });
  stored.profile = { ...stored.profile, baseKind: 'furniture_base' };
  const synced = syncRoom(stored, settings);
  const view = resolveWall(synced, synced.walls[0], 'front');
  const current = view.runs[0];
  return runBands(synced, view, current, settings, runScene(synced, view, current, settings));
}

describe('DR5 no floor base under end pieces that stop above the floor', () => {
  it('drops the base under a matching filler and end panel over a void', () => {
    expect(floatingDesk('cabinets').furnitureBases).toEqual([]);
  });

  it('keeps it under a full-height end panel only', () => {
    const bases = floatingDesk('full').furnitureBases;
    expect(bases).toHaveLength(1);
    expect(bases[0].x).toBeGreaterThan(55);
  });
});
