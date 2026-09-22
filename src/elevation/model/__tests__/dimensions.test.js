import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import {
  centerlineMarkers,
  horizontalChains,
  nearerEdge,
  openingChain,
  pickColumnRuns,
  verticalChains,
  verticalOpeningChain,
} from '../dimensions.js';
import { syncRoom } from '../room.js';

function cabinetRun(id, cabinetTypeId, overrides = {}) {
  return {
    id,
    cabinetTypeId,
    x: 0,
    width: 48,
    z: cabinetTypeId === CABINET_TYPE_IDS.UPPER ? 54 : 4,
    height: cabinetTypeId === CABINET_TYPE_IDS.TALL
      ? 86
      : cabinetTypeId === CABINET_TYPE_IDS.UPPER ? 36 : 30.5,
    depth: cabinetTypeId === CABINET_TYPE_IDS.UPPER ? 12 : 24,
    ends: {
      left: { type: 'filler', width: null },
      right: { type: 'filler', width: null },
    },
    autoCount: true,
    maxCabinetWidth: null,
    items: [],
    heightMode: 'auto',
    overrides: {},
    anchors: { left: false, right: false },
    ...overrides,
  };
}

function roomR({ wallA = {}, wallB = {} } = {}) {
  return {
    id: 'R',
    name: 'Room R',
    profile: { ...DEFAULT_SETTINGS.defaultProfile },
    wallOrder: ['A', 'B'],
    walls: [
      {
        id: 'A',
        name: '',
        numberOverride: null,
        x1: 0,
        y1: 0,
        x2: 120,
        y2: 0,
        height: 96,
        thickness: 4.5,
        flipped: false,
        connections: { start: null, end: { wallId: 'B', endpoint: 'start' } },
        profile: {},
        runs: [],
        ...wallA,
      },
      {
        id: 'B',
        name: '',
        numberOverride: null,
        x1: 120,
        y1: 0,
        x2: 120,
        y2: 96,
        height: 96,
        thickness: 4.5,
        flipped: false,
        connections: { start: { wallId: 'A', endpoint: 'end' }, end: null },
        profile: {},
        runs: [],
        ...wallB,
      },
    ],
  };
}

function cornerRunRoom() {
  return syncRoom(roomR({
    wallA: {
      runs: [cabinetRun('A-base', CABINET_TYPE_IDS.BASE, {
        width: 60,
        anchors: { left: false, right: true },
      })],
    },
    wallB: {
      runs: [cabinetRun('B-base', CABINET_TYPE_IDS.BASE, {
        width: 48,
        anchors: { left: true, right: false },
      })],
    },
  }), DEFAULT_SETTINGS);
}

function lengths(segments) {
  return segments.map((segment) => segment.end - segment.start);
}

function expectNumbersClose(actual, expected) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 8));
}

function expectContiguous(chain, startOrLength, end) {
  const start = end === undefined ? 0 : startOrLength;
  const finish = end === undefined ? startOrLength : end;
  expect(chain.length).toBeGreaterThan(0);
  expect(chain[0].start).toBeCloseTo(start, 8);
  chain.forEach((segment, index) => {
    expect(segment.end - segment.start).toBeGreaterThan(1e-6);
    if (index > 0) expect(segment.start).toBeCloseTo(chain[index - 1].end, 8);
  });
  expect(chain.at(-1).end).toBeCloseTo(finish, 8);
  expect(lengths(chain).reduce((sum, value) => sum + value, 0))
    .toBeCloseTo(finish - start, 8);
}

describe('horizontalChains', () => {
  it('SPEC-10 4. keeps the full lower wall row when the wall has no runs', () => {
    const room = roomR();
    const wall = room.walls.find(({ id }) => id === 'A');

    expect(horizontalChains(room, wall, 'lower', DEFAULT_SETTINGS)).toEqual({
      inner: [],
      outer: [{ start: 0, end: 120, kind: 'wall' }],
    });
  });

  it('2. lays out A inner pieces between its open and corner gaps', () => {
    const room = cornerRunRoom();
    const wall = room.walls.find(({ id }) => id === 'A');
    const { inner } = horizontalChains(room, wall, 'lower', DEFAULT_SETTINGS);

    expect(inner.map(({ kind }) => kind)).toEqual([
      'open',
      'piece',
      'piece',
      'piece',
      'piece',
      'corner-gap',
    ]);
    expectNumbersClose(lengths(inner), [35.125, 1.5, 28.5, 28.5, 1.5, 24.875]);
  });

  it('3. expands A outer run across the right corner gap', () => {
    const room = cornerRunRoom();
    const wall = room.walls.find(({ id }) => id === 'A');
    const chains = horizontalChains(room, wall, 'lower', DEFAULT_SETTINGS);

    expect(chains.outer).toEqual([
      { start: 0, end: 35.125, kind: 'open' },
      { start: 35.125, end: 120, kind: 'run', runId: 'A-base' },
    ]);
    expectContiguous(chains.inner, 120);
    expectContiguous(chains.outer, 120);
  });

  it('4. represents B left corner reserve in its inner and outer chains', () => {
    const room = cornerRunRoom();
    const wall = room.walls.find(({ id }) => id === 'B');
    const chains = horizontalChains(room, wall, 'lower', DEFAULT_SETTINGS);

    expect(chains.inner[0]).toEqual({ start: 0, end: 24.875, kind: 'corner-gap' });
    expect(chains.outer[0]).toEqual({
      start: 0,
      end: 72.875,
      kind: 'run',
      runId: 'B-base',
    });
  });

  it('SPEC-10 5. keeps the full upper wall row when only base runs exist', () => {
    const room = roomR({
      wallA: { runs: [cabinetRun('base', CABINET_TYPE_IDS.BASE)] },
    });
    const wall = room.walls.find(({ id }) => id === 'A');
    expect(horizontalChains(room, wall, 'upper', DEFAULT_SETTINGS)).toEqual({
      inner: [],
      outer: [{ start: 0, end: 120, kind: 'wall' }],
    });
  });

  it('SPEC-10 6. omits the wall row for a zero-length wall', () => {
    const room = roomR({ wallA: { x2: 0, y2: 0 } });
    const wall = room.walls.find(({ id }) => id === 'A');

    expect(horizontalChains(room, wall, 'lower', DEFAULT_SETTINGS)).toEqual({
      inner: [],
      outer: [],
    });
  });

  it('6. splits upper open space where a tall run spans the wall', () => {
    const room = syncRoom(roomR({
      wallA: {
        runs: [
          cabinetRun('upper', CABINET_TYPE_IDS.UPPER, { width: 30 }),
          cabinetRun('tall', CABINET_TYPE_IDS.TALL, { x: 60, width: 24 }),
        ],
      },
    }), DEFAULT_SETTINGS);
    const wall = room.walls.find(({ id }) => id === 'A');
    const { inner } = horizontalChains(room, wall, 'upper', DEFAULT_SETTINGS);
    const tallIndex = inner.findIndex(({ kind }) => kind === 'tall-span');

    expect(inner[tallIndex]).toEqual({
      start: 60,
      end: 84,
      kind: 'tall-span',
      runId: 'tall',
    });
    expect(inner[tallIndex - 1]).toMatchObject({ start: 30, end: 60, kind: 'open' });
    expect(inner[tallIndex + 1]).toMatchObject({ start: 84, end: 120, kind: 'open' });
  });

  it('13. extends both chains across a left-overhanging run', () => {
    const room = syncRoom(roomR({
      wallA: {
        runs: [cabinetRun('overhang', CABINET_TYPE_IDS.BASE, {
          x: -6,
          width: 60,
        })],
      },
    }), DEFAULT_SETTINGS);
    const wall = room.walls.find(({ id }) => id === 'A');
    const chains = horizontalChains(room, wall, 'lower', DEFAULT_SETTINGS);

    expect(chains.inner[0].start).toBe(-6);
    expect(chains.outer[0]).toMatchObject({ start: -6, end: 54, kind: 'run' });
    expectContiguous(chains.inner, -6, 120);
    expectContiguous(chains.outer, -6, 120);
  });
});

function verticalRoom({ height = 96, baseOverrides = {}, tall = false } = {}) {
  const lower = cabinetRun(
    tall ? 'tall' : 'base',
    tall ? CABINET_TYPE_IDS.TALL : CABINET_TYPE_IDS.BASE,
    { width: 60, ...baseOverrides },
  );
  const runs = tall
    ? [lower]
    : [lower, cabinetRun('upper', CABINET_TYPE_IDS.UPPER, { width: 60 })];
  return syncRoom(roomR({ wallA: { height, runs } }), DEFAULT_SETTINGS);
}

function selectedColumn(room, lowerId, upperId = null) {
  const wall = room.walls.find(({ id }) => id === 'A');
  return {
    wall,
    lowerRun: wall.runs.find(({ id }) => id === lowerId) ?? null,
    upperRun: wall.runs.find(({ id }) => id === upperId) ?? null,
  };
}

describe('verticalChains', () => {
  it('7. lays out the default base and upper stack to a 96-inch wall', () => {
    const room = verticalRoom();
    const { wall, lowerRun, upperRun } = selectedColumn(room, 'base', 'upper');
    const chains = verticalChains(room, wall, { lowerRun, upperRun }, DEFAULT_SETTINGS);

    expect(chains.inner.map(({ kind }) => kind)).toEqual([
      'toe-kick',
      'box',
      'countertop',
      'clearance',
      'box',
      'molding',
    ]);
    expectNumbersClose(lengths(chains.inner), [4, 30.5, 1.5, 18, 36, 6]);
    expect(chains.outer).toEqual([{ start: 0, end: 96, kind: 'wall' }]);
  });

  it('8. appends open space above the same stack on a 100-inch wall', () => {
    const room = verticalRoom({ height: 100 });
    const { wall, lowerRun, upperRun } = selectedColumn(room, 'base', 'upper');
    const { inner } = verticalChains(
      room,
      wall,
      { lowerRun, upperRun },
      DEFAULT_SETTINGS,
    );

    expect(inner.at(-1).kind).toBe('open');
    expect(inner.at(-1).end - inner.at(-1).start).toBe(4);
  });

  it('9. resolves countertop overrides and the resulting upper geometry', () => {
    const room = verticalRoom({
      baseOverrides: { overrides: { countertopThickness: 3 } },
    });
    const { wall, lowerRun, upperRun } = selectedColumn(room, 'base', 'upper');
    const { inner } = verticalChains(
      room,
      wall,
      { lowerRun, upperRun },
      DEFAULT_SETTINGS,
    );

    const byKind = Object.fromEntries(inner.map((segment) => [segment.kind, segment]));
    expect(byKind.countertop.end - byKind.countertop.start).toBe(3);
    expect(byKind.clearance.end - byKind.clearance.start).toBe(18);
    const boxes = inner.filter(({ kind }) => kind === 'box');
    expect(boxes[1].end - boxes[1].start).toBe(34.5);
  });

  it('10. lays out an automatic tall run with molding', () => {
    const room = verticalRoom({ tall: true });
    const { wall, lowerRun } = selectedColumn(room, 'tall');
    const { inner } = verticalChains(
      room,
      wall,
      { lowerRun, upperRun: null },
      DEFAULT_SETTINGS,
    );

    expect(inner.map(({ kind }) => kind)).toEqual(['toe-kick', 'box', 'molding']);
    expectNumbersClose(lengths(inner), [4, 86, 6]);
  });
});

describe('pickColumnRuns', () => {
  it('11. picks the selected column or the leftmost runs by default', () => {
    const room = syncRoom(roomR({
      wallA: {
        runs: [
          cabinetRun('base-right', CABINET_TYPE_IDS.BASE, { x: 60, width: 30 }),
          cabinetRun('upper-right', CABINET_TYPE_IDS.UPPER, { x: 65, width: 20 }),
          cabinetRun('base-left', CABINET_TYPE_IDS.BASE, { x: 0, width: 30 }),
          cabinetRun('upper-left', CABINET_TYPE_IDS.UPPER, { x: 5, width: 20 }),
        ],
      },
    }), DEFAULT_SETTINGS);
    const wall = room.walls.find(({ id }) => id === 'A');

    expect(pickColumnRuns(wall, 'upper-right', 'right')).toMatchObject({
      lowerRun: { id: 'base-right' },
      upperRun: { id: 'upper-right' },
    });
    expect(pickColumnRuns(wall, null)).toMatchObject({
      lowerRun: { id: 'base-left' },
      upperRun: { id: 'upper-left' },
    });
  });

  it('192. picks the default pair for each edge', () => {
    const room = syncRoom(roomR({
      wallA: {
        runs: [
          cabinetRun('base-right', CABINET_TYPE_IDS.BASE, { x: 60, width: 30 }),
          cabinetRun('upper-right', CABINET_TYPE_IDS.UPPER, { x: 65, width: 20 }),
          cabinetRun('base-left', CABINET_TYPE_IDS.BASE, { x: 0, width: 30 }),
          cabinetRun('upper-left', CABINET_TYPE_IDS.UPPER, { x: 5, width: 20 }),
        ],
      },
    }), DEFAULT_SETTINGS);
    const wall = room.walls.find(({ id }) => id === 'A');

    expect(pickColumnRuns(wall, null, 'right')).toMatchObject({
      lowerRun: { id: 'base-right' },
      upperRun: { id: 'upper-right' },
    });
    expect(pickColumnRuns(wall, 'upper-right', 'left')).toMatchObject({
      lowerRun: { id: 'base-left' },
      upperRun: { id: 'upper-left' },
    });
    expect(pickColumnRuns(wall, 'upper-left', 'right')).toMatchObject({
      lowerRun: { id: 'base-right' },
      upperRun: { id: 'upper-right' },
    });
    expect(nearerEdge(60, 120)).toBe('left');
    expect(nearerEdge(60.1, 120)).toBe('right');
  });
});

describe('centerlineMarkers', () => {
  const pieces = [
    { id: 'left', role: 'item', x: 0, width: 24, z: 4, height: 30.5 },
    { id: 'mid', role: 'item', x: 24, width: 24, z: 4, height: 30.5 },
  ];

  it('SPEC-12 9. returns a dimension from the left wall end', () => {
    const run = {
      items: [
        { id: 'left', pin: null },
        { id: 'mid', pin: { from: 'left', value: 36, anchor: 'center' } },
      ],
    };

    expect(centerlineMarkers(
      run,
      pieces,
      { openings: [] },
      120,
      DEFAULT_SETTINGS,
    )).toEqual([{
      pieceId: 'mid',
      x: 36,
      datumX: 0,
      z: 40,
      value: 36,
      pieceBottom: 4,
      pieceTop: 34.5,
      from: 'left',
    }]);
  });

  it('SPEC-12 10. measures a right-hand datum from the wall length', () => {
    const run = {
      items: [
        { id: 'left', pin: null },
        { id: 'mid', pin: { from: 'right', value: 84, anchor: 'center' } },
      ],
    };

    expect(centerlineMarkers(
      run,
      pieces,
      { openings: [] },
      120,
      DEFAULT_SETTINGS,
    )).toEqual([{
      pieceId: 'mid',
      x: 36,
      datumX: 120,
      z: 40,
      value: 84,
      pieceBottom: 4,
      pieceTop: 34.5,
      from: 'right',
    }]);
  });

  it('SPEC-12 11. returns nothing for edge-anchored pins and pinless runs', () => {
    const edgeAnchoredRun = {
      items: [
        { id: 'left', pin: null },
        { id: 'mid', pin: { from: 'left', value: 24, anchor: 'left' } },
      ],
    };

    expect(centerlineMarkers(
      edgeAnchoredRun,
      pieces,
      { openings: [] },
      120,
      DEFAULT_SETTINGS,
    )).toEqual([]);
    expect(centerlineMarkers(
      { items: [] },
      pieces,
      { openings: [] },
      120,
      DEFAULT_SETTINGS,
    )).toEqual([]);
  });
});

function fixedRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function randomBandRuns(random, type, prefix, length) {
  const count = 1 + Math.floor(random() * 3);
  const slot = length / count;
  return Array.from({ length: count }, (_, index) => {
    const x = index * slot + random() * 4;
    const maxWidth = Math.min(36, slot - 8);
    const width = 12 + random() * (maxWidth - 12);
    return cabinetRun(`${prefix}-${index}`, type, { x, width });
  });
}

it('keeps fixed-seed valid horizontal chains contiguous and full length', () => {
  const random = fixedRandom(0x16D1A);
  for (let roomIndex = 0; roomIndex < 12; roomIndex += 1) {
    const length = 120 + random() * 60;
    const wall = {
      id: `wall-${roomIndex}`,
      name: '',
      numberOverride: null,
      x1: 0,
      y1: 0,
      x2: length,
      y2: 0,
      height: 96,
      thickness: 4.5,
      flipped: false,
      connections: { start: null, end: null },
      profile: {},
      runs: [
        ...randomBandRuns(random, CABINET_TYPE_IDS.BASE, `base-${roomIndex}`, length),
        ...randomBandRuns(random, CABINET_TYPE_IDS.UPPER, `upper-${roomIndex}`, length),
      ],
    };
    const room = syncRoom({
      id: `room-${roomIndex}`,
      name: `Room ${roomIndex}`,
      profile: { ...DEFAULT_SETTINGS.defaultProfile },
      wallOrder: [wall.id],
      walls: [wall],
    }, DEFAULT_SETTINGS);
    const syncedWall = room.walls[0];

    for (const band of ['lower', 'upper']) {
      const chains = horizontalChains(room, syncedWall, band, DEFAULT_SETTINGS);
      expectContiguous(chains.inner, length);
      expectContiguous(chains.outer, length);
    }
  }
});

function doorOpening(overrides = {}) {
  return {
    id: 'door-1',
    kind: 'door',
    label: 'D1',
    measureMode: 'jamb',
    width: 36,
    height: 80,
    sillZ: 0,
    offset: 24,
    offsetFrom: 'left',
    casing: { width: 3, thickness: 0.75 },
    ...overrides,
  };
}

function windowOpening(overrides = {}) {
  return {
    id: 'window-1',
    kind: 'window',
    label: 'W1',
    measureMode: 'jamb',
    width: 36,
    height: 48,
    sillZ: 36,
    offset: 12,
    offsetFrom: 'right',
    casing: { width: 3, thickness: 0.75 },
    ...overrides,
  };
}

describe('opening dimensions', () => {
  it('21. builds a contiguous jamb-reference chain across the wall', () => {
    const room = roomR({
      wallA: { openings: [doorOpening(), windowOpening()] },
    });
    const wall = room.walls[0];
    const chain = openingChain(room, wall, DEFAULT_SETTINGS);

    expect(chain).toEqual([
      { start: 0, end: 24, kind: 'gap' },
      { start: 24, end: 60, kind: 'opening', openingId: 'door-1', label: 'D1' },
      { start: 60, end: 72, kind: 'gap' },
      { start: 72, end: 108, kind: 'opening', openingId: 'window-1', label: 'W1' },
      { start: 108, end: 120, kind: 'gap' },
    ]);
    expectContiguous(chain, 120);
  });

  it('22. uses casing reference edges and keeps the chain contiguous', () => {
    const room = roomR({
      wallA: {
        openings: [
          doorOpening({ measureMode: 'casing', width: 42, height: 83, offset: 21 }),
          windowOpening(),
        ],
      },
    });
    const chain = openingChain(room, room.walls[0], DEFAULT_SETTINGS);

    expect(chain[1]).toEqual({
      start: 21,
      end: 63,
      kind: 'opening',
      openingId: 'door-1',
      label: 'D1',
    });
    expectContiguous(chain, 120);
  });

  it('23. builds window and door vertical opening chains', () => {
    const wall = roomR().walls[0];
    expect(verticalOpeningChain(wall, windowOpening(), 120, DEFAULT_SETTINGS)).toEqual({
      inner: [
        { start: 0, end: 33, kind: 'sill-below' },
        { start: 33, end: 36, kind: 'casing' },
        { start: 36, end: 84, kind: 'opening' },
        { start: 84, end: 87, kind: 'casing' },
        { start: 87, end: 96, kind: 'above' },
      ],
      outer: [{ start: 0, end: 96, kind: 'wall' }],
    });
    expect(verticalOpeningChain(wall, doorOpening(), 120, DEFAULT_SETTINGS)).toEqual({
      inner: [
        { start: 0, end: 80, kind: 'opening' },
        { start: 80, end: 83, kind: 'casing' },
        { start: 83, end: 96, kind: 'above' },
      ],
      outer: [{ start: 0, end: 96, kind: 'wall' }],
    });
  });
});
