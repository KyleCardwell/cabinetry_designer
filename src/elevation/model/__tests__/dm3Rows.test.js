import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { horizontalChains, openingChain, wallRow } from '../dimensions.js';
import { elevationDimensions } from '../elevationDimensions.js';
import { syncRoom } from '../room.js';
import { wallSideView } from '../wallSides.js';

const S = { ...DEFAULT_SETTINGS, runFlex: 0 };

function makeWall(id, x1, y1, x2, y2, overrides = {}) {
  return {
    id,
    name: '',
    numberOverride: null,
    x1,
    y1,
    x2,
    y2,
    height: 96,
    thickness: 4.5,
    flipped: false,
    connections: { start: null, end: null },
    profile: {},
    openings: [],
    joints: [],
    runs: [],
    ...overrides,
  };
}

function cabinetRun(id, cabinetTypeId, overrides = {}) {
  const upper = cabinetTypeId === CABINET_TYPE_IDS.UPPER;
  const tall = cabinetTypeId === CABINET_TYPE_IDS.TALL;
  return {
    id,
    cabinetTypeId,
    x: 0,
    width: 30,
    z: upper ? 54 : 4,
    height: tall ? 86 : upper ? 36 : 30.5,
    depth: upper ? 12 : 24,
    ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
    autoCount: true,
    maxCabinetWidth: null,
    items: [],
    heightMode: 'auto',
    overrides: {},
    anchors: { left: false, right: false },
    wallSide: 'front',
    ...overrides,
  };
}

const windowOpening = {
  id: 'window-1',
  kind: 'window',
  label: 'W1',
  measureMode: 'casing',
  width: 24,
  height: 48,
  sillZ: 36,
  offset: 90,
  offsetFrom: 'left',
  casing: { width: 3, thickness: 0.75 },
};

/** Spec DM3 step a's wall: 156" with free ends, Euro, no top overhangs. */
function anchorRoom() {
  const room = syncRoom({
    id: 'DM3',
    name: 'DM3',
    profile: { ...DEFAULT_SETTINGS.defaultProfile },
    wallOrder: ['A'],
    walls: [makeWall('A', 0, 0, 156, 0, {
      openings: [windowOpening],
      runs: [
        cabinetRun('tall', CABINET_TYPE_IDS.TALL, { x: 0, width: 24 }),
        cabinetRun('base', CABINET_TYPE_IDS.BASE, { x: 24, width: 60 }),
        cabinetRun('base2', CABINET_TYPE_IDS.BASE, { x: 120, width: 36 }),
        cabinetRun('up1', CABINET_TYPE_IDS.UPPER, { x: 24, width: 30 }),
        cabinetRun('up2', CABINET_TYPE_IDS.UPPER, { x: 54, width: 30 }),
        cabinetRun('up3', CABINET_TYPE_IDS.UPPER, { x: 120, width: 36 }),
      ],
    })],
  }, S);
  return { room, wall: wallSideView(room.walls[0], 'front') };
}

const spans = (chain) => chain.map(({ kind, start, end, runIds }) => (
  runIds ? [kind, start, end, runIds] : [kind, start, end]
));

describe('DM3 step a elevation rows', () => {
  it('anchor 1: touching runs are one run-row segment, then the open space and the next run', () => {
    const { room, wall } = anchorRoom();
    const { outer } = horizontalChains(room, wall, 'lower', S);
    expect(spans(outer)).toEqual([
      ['run', 0, 84, ['tall', 'base']],
      ['open', 84, 120],
      ['run', 120, 156, ['base2']],
    ]);
    expect(outer[0].runId).toBe('tall');
  });

  it('anchor 2: the piece row holds the three runs\' pieces only, with nothing across 84–120', () => {
    const { room, wall } = anchorRoom();
    const { inner } = horizontalChains(room, wall, 'lower', S);
    expect(inner.length).toBeGreaterThan(3);
    expect(new Set(inner.map(({ runId }) => runId))).toEqual(new Set(['tall', 'base', 'base2']));
    expect(inner.some(({ kind }) => kind === 'open')).toBe(false);
    expect(inner.some(({ start, end }) => start < 120 - 1e-6 && end > 84 + 1e-6)).toBe(false);
    expect(inner[0].start).toBe(0);
    expect(inner.find(({ end }) => Math.abs(end - 84) < 1e-6)).toBeDefined();
    expect(inner.find(({ start }) => Math.abs(start - 120) < 1e-6)).toBeDefined();
    expect(inner.at(-1).end).toBe(156);
  });

  it('anchor 3: the upper run row keeps the tall span and merges the touching uppers', () => {
    const { room, wall } = anchorRoom();
    expect(spans(horizontalChains(room, wall, 'upper', S).outer)).toEqual([
      ['tall-span', 0, 24],
      ['run', 24, 84, ['up1', 'up2']],
      ['open', 84, 120],
      ['run', 120, 156, ['up3']],
    ]);
  });

  it('anchor 4: the wall row carries the overall; no openings row on a face with runs', () => {
    const { room, wall } = anchorRoom();
    expect(wallRow(room, wall, S)).toEqual([{ start: 0, end: 156, kind: 'wall' }]);
    expect(openingChain(room, wall, S)).toEqual([]);
    const rows = elevationDimensions(room, room.walls[0], 'front', S)
      .filter(({ row }) => ['lower.inner', 'lower.outer', 'openings', 'wall'].includes(row));
    const at = [...new Set(rows.map(({ row, at: line }) => `${row} ${line}`))];
    expect(at.map((entry) => entry.split(' ')[0])).toEqual(['lower.inner', 'lower.outer', 'wall']);
    expect(rows.filter(({ row }) => row === 'wall').map(({ start, end, text }) => [start, end, text]))
      .toEqual([[0, 156, '156']]);
  });

  it('anchor 5: a run corner to corner is the whole run row and leaves out the wall row (Wall 2)', () => {
    const link = (wallId, endpoint) => ({ wallId, endpoint });
    const room = syncRoom({
      id: 'K',
      name: 'Test kitchen',
      profile: { ...DEFAULT_SETTINGS.defaultProfile },
      wallOrder: ['W1', 'W2', 'W3'],
      walls: [
        makeWall('W1', 0, 96, 0, 0, { connections: { start: null, end: link('W2', 'start') } }),
        makeWall('W2', 0, 0, 120, 0, {
          connections: { start: link('W1', 'end'), end: link('W3', 'start') },
          runs: [cabinetRun('B', CABINET_TYPE_IDS.BASE, {
            x: 24.875, width: 70.25, anchors: { left: true, right: true },
            ends: { left: { type: 'filler', width: null }, right: { type: 'filler', width: null } },
          })],
        }),
        makeWall('W3', 120, 0, 120, 96, { connections: { start: link('W2', 'end'), end: null } }),
      ],
    }, S);
    const wall = wallSideView(room.walls[1], 'front');
    const { outer } = horizontalChains(room, wall, 'lower', S);
    expect(spans(outer)).toEqual([['run', 0, 120, ['B']]]);
    expect(wallRow(room, wall, S)).toEqual([]);
    expect(wallRow(room, wall, S, outer)).toEqual([]);
  });

  it('anchor 6: a face with no runs and a door keeps its openings row and has no wall row', () => {
    const door = {
      ...windowOpening, id: 'door-1', kind: 'door', label: 'D1', measureMode: 'jamb', width: 36, height: 80,
      sillZ: 0, offset: 24,
    };
    const room = syncRoom({
      id: 'B',
      name: 'Bare',
      profile: { ...DEFAULT_SETTINGS.defaultProfile },
      wallOrder: ['A'],
      walls: [makeWall('A', 0, 0, 120, 0, { openings: [door] })],
    }, S);
    const wall = wallSideView(room.walls[0], 'front');
    expect(spans(openingChain(room, wall, S))).toEqual([['gap', 0, 24], ['opening', 24, 60], ['gap', 60, 120]]);
    expect(wallRow(room, wall, S)).toEqual([]);
    expect(horizontalChains(room, wall, 'lower', S)).toEqual({
      inner: [],
      outer: [{ start: 0, end: 120, kind: 'wall' }],
    });
    expect(elevationDimensions(room, room.walls[0], 'front', S).some(({ row }) => row === 'wall')).toBe(false);
  });
});
