import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cornerReserveParts } from '../corners.js';
import {
  centerlineMarkers,
  horizontalChains,
  nearerEdge,
  openingChain,
  pickColumnRuns,
  verticalChains,
  verticalOpeningChain,
  wallRow,
} from '../dimensions.js';
import { gridFromItems } from '../grid.js';
import { syncRoom } from '../room.js';
import { wallSideView } from '../wallSides.js';

function makeWall(id, x1, y1, x2, y2, overrides = {}) {
  return {
    id,
    name: '',
    numberOverride: null,
    elevationForced: false,
    x1,
    y1,
    x2,
    y2,
    height: 108,
    thickness: 4.5,
    flipped: false,
    connections: { start: null, end: null },
    profile: {},
    openings: [],
    joints: [],
    runs: [],
    endPanels: { start: null, end: null },
    landings: { start: null, end: null },
    soffits: [],
    ...overrides,
  };
}

const run = (id, cabinetTypeId, depth, overrides = {}) => ({
  id,
  cabinetTypeId,
  x: 0,
  width: 30,
  z: 0,
  height: 30,
  depth,
  ends: {
    left: { type: 'end_panel', width: null },
    right: { type: 'end_panel', width: null },
  },
  autoCount: true,
  maxCabinetWidth: null,
  items: [],
  heightMode: 'auto',
  overrides: {},
  anchors: { left: false, right: false },
  wallSide: 'front',
  ...overrides,
});

const base = (id, overrides = {}) => run(id, CABINET_TYPE_IDS.BASE, 24, {
  z: 4,
  height: 30.5,
  heightMode: 'manual',
  ...overrides,
});

const straightRoom = ({ wallA = {}, wallB = {} } = {}) => syncRoom({
  id: 'S',
  name: 'Room S',
  profile: { ...DEFAULT_SETTINGS.defaultProfile },
  wallOrder: ['A', 'B'],
  walls: [
    makeWall('A', 0, 0, 120, 0, {
      height: 96,
      connections: { start: null, end: { wallId: 'B', endpoint: 'start' } },
      ...wallA,
    }),
    makeWall('B', 120, 0, 240, 0, {
      height: 96,
      connections: { start: { wallId: 'A', endpoint: 'end' }, end: null },
      ...wallB,
    }),
  ],
}, { ...DEFAULT_SETTINGS, runFlex: 0 }); // Neighbour geometry, independent of box rounding.

function view(room, wallId) {
  return wallSideView(room.walls.find(({ id }) => id === wallId), 'front');
}

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
        openings: [],
        joints: [],
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
        openings: [],
        joints: [],
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

describe('FL2.1 step b lapped corner dimensions', () => {
  function fixture({ angle = 90, upper = false, frame = false, mode } = {}) {
    const type = upper ? CABINET_TYPE_IDS.UPPER : CABINET_TYPE_IDS.BASE;
    const makeRun = (id, side) => cabinetRun(id, type, {
      anchors: { left: true, right: true },
      autoCount: false,
      items: undefined,
      grid: gridFromItems(id, [{ id: `${id}-cab`, kind: 'cabinet', width: 45 }]),
      ...(mode ? { endFiller: { [side]: { cornerLap: mode } } } : {}),
    });
    const direction = (180 - angle) * Math.PI / 180;
    const a = makeRun('a', 'right');
    const b = makeRun('b', 'left');
    if (frame) a.style = { cabinetStyleId: 14 };
    if (mode === 'panel') {
      delete a.endFiller;
      delete b.endFiller;
      b.ends.left.type = 'end_panel';
    }
    return roomR({
      wallA: { x2: 84.875, runs: [a] },
      wallB: {
        x1: 84.875,
        x2: 84.875 + 120.875 * Math.cos(direction),
        y2: 120.875 * Math.sin(direction),
        runs: [b],
      },
    });
  }

  function chains(room, upper = false) {
    return room.walls.map((wall) => horizontalChains(room, wall, upper ? 'upper' : 'lower', DEFAULT_SETTINGS));
  }

  function checkLapped(options, expectedGap, expectedLap) {
    const raw = fixture(options);
    const off = structuredClone(raw);
    off.walls[0].runs[0].endFiller = { right: { cornerLap: 'into' } };
    off.walls[1].runs[0].endFiller = { left: { cornerLap: 'into' } };
    const room = syncRoom(raw, DEFAULT_SETTINGS);
    const before = chains(syncRoom(off, DEFAULT_SETTINGS), options.upper);
    const after = chains(room, options.upper);
    const [wall] = room.walls;
    const [run] = wall.runs;
    const gapIndex = after[0].inner.findIndex(({ kind }) => kind === 'corner-gap');
    const segment = after[0].inner[gapIndex - 1];
    const gap = after[0].inner[gapIndex];
    const beforeSegment = before[0].inner[before[0].inner.findIndex(({ kind }) => kind === 'corner-gap') - 1];
    expect(gap.kind).toBe('corner-gap');
    expect(gap.end - gap.start).toBeCloseTo(expectedGap, 3);
    expect(segment.end).toBeCloseTo(run.x + run.width - expectedLap, 8);
    expect(segment.end).toBeCloseTo(gap.start, 8);
    expect(segment.end - segment.start).toBeCloseTo(beforeSegment.end - beforeSegment.start, 8);
    expect(segment).toEqual({ ...beforeSegment, start: segment.start, end: segment.end });
    expect(segment).toMatchObject({ kind: options.frame ? 'frame' : 'piece', runId: 'a' });
    expect(after[0].outer).toEqual(before[0].outer);
    expect(after[1]).toEqual(before[1]);
    expectContiguous(after[0].inner.filter(({ kind }) => kind !== 'neighbor'), 84.875);
    return { room, after };
  }

  it('D1–D2: measures the laps-off filler and 24 7/8 corner gap, leaving the die-in chain unchanged', () => {
    const { after } = checkLapped({}, 24.875, 0.8125);
    expect(after[1].inner[0]).toEqual({ start: 0, end: 24.875, kind: 'corner-gap' });
    expect(after[0].inner.at(-2).pieceId).toBeDefined();
  });

  it('D3: applies the same boundary to the upper chain', () => {
    checkLapped({ upper: true }, 12.875, 0.8125);
  });

  it('D4: shortens the corner frame stile while preserving its kind and metadata', () => {
    checkLapped({ frame: true }, 24.875, 0.8125);
  });

  it('D5: uses the lap scaled by the sine of a 135-degree corner', () => {
    // Exact resolved geometry isolates this chain from resolveHorizontal's existing 1/16 rounding.
    const room = fixture({ angle: 135 });
    for (const [index, wall] of room.walls.entries()) {
      const run = wall.runs[0];
      const reserve = cornerReserveParts(room, wall, index === 0 ? 'right' : 'left', run, DEFAULT_SETTINGS);
      run.x = index === 0 ? 0 : reserve.total;
      run.width = (index === 0 ? 84.875 : 120.875) - reserve.total;
    }
    const { inner } = chains(room)[0];
    const gapIndex = inner.findIndex(({ kind }) => kind === 'corner-gap');
    const gap = inner[gapIndex];
    const segment = inner[gapIndex - 1];
    const run = room.walls[0].runs[0];
    const lap = 0.8125 / Math.sin(135 * Math.PI / 180);
    expect(gap.end - gap.start).toBeCloseTo(35.1786, 3);
    expect(gap.end - gap.start).toBeCloseTo(24.875 / Math.sin(135 * Math.PI / 180), 8);
    expect(run.x + run.width - segment.end).toBeCloseTo(lap, 8);
    expect(segment.end).toBe(gap.start);
    expect(segment).toMatchObject({ kind: 'piece', runId: 'a', pieceId: 'a:right' });
    expectContiguous(inner.filter(({ kind }) => kind !== 'neighbor'), 84.875);
  });

  it('D6–D7: keeps non-lapped ends unchanged and adjusts both sides of an over conflict', () => {
    for (const mode of ['panel', 'into', 'over']) {
      const room = syncRoom(fixture({ mode }), DEFAULT_SETTINGS);
      const result = chains(room);
      room.walls.forEach((wall, index) => {
        const run = wall.runs[0];
        const side = index === 0 ? 'right' : 'left';
        const inner = result[index].inner;
        const gap = index === 0 ? inner.at(-1) : inner[0];
        const segment = index === 0 ? inner.at(-2) : inner[1];
        const lap = mode === 'over' ? 0.8125 : 0;
        expect(cornerReserveParts(room, wall, side, run, DEFAULT_SETTINGS).lap).toBe(lap);
        expect(gap.end - gap.start).toBe(24.875);
        if (index === 0) {
          expect(segment.end).toBe(run.x + run.width - lap);
          expect(gap.start).toBe(segment.end);
        } else {
          expect(segment.start).toBe(run.x + lap);
          expect(gap.end).toBe(segment.start);
        }
        expect(segment.kind).toBe('piece');
        expectContiguous(inner, index === 0 ? 84.875 : 120.875);
        expect(result[index].outer).toEqual([
          { start: 0, end: index === 0 ? 84.875 : 120.875, kind: 'run', runId: run.id, runIds: [run.id] },
        ]);
      });
    }
  });
});

describe('horizontalChains', () => {
  it('SPEC-10 4. keeps the full lower wall row when the wall has no runs', () => {
    const room = roomR();
    const wall = room.walls.find(({ id }) => id === 'A');

    expect(horizontalChains(room, wall, 'lower', DEFAULT_SETTINGS)).toEqual({
      inner: [],
      outer: [{ start: 0, end: 120, kind: 'wall' }],
    });
  });

  it('2. lays out A inner pieces and its corner gap, without the open gap (DM3)', () => {
    const room = cornerRunRoom();
    const wall = room.walls.find(({ id }) => id === 'A');
    const { inner } = horizontalChains(room, wall, 'lower', DEFAULT_SETTINGS);

    expect(inner.map(({ kind }) => kind)).toEqual([
      'piece',
      'piece',
      'piece',
      'piece',
      'corner-gap',
    ]);
    expectNumbersClose(lengths(inner), [1.5, 28.5, 28.5, 1.5, 24.875]);
  });

  it('3. expands A outer run across the right corner gap', () => {
    const room = cornerRunRoom();
    const wall = room.walls.find(({ id }) => id === 'A');
    const chains = horizontalChains(room, wall, 'lower', DEFAULT_SETTINGS);

    expect(chains.outer).toEqual([
      { start: 0, end: 35.125, kind: 'open' },
      { start: 35.125, end: 120, kind: 'run', runId: 'A-base', runIds: ['A-base'] },
    ]);
    expectContiguous(chains.inner, 35.125, 120);
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
      runIds: ['B-base'],
    });
  });

  it('DM3: leaves the wall length to the wall row below when only base runs exist', () => {
    const room = roomR({
      wallA: { runs: [cabinetRun('base', CABINET_TYPE_IDS.BASE)] },
    });
    const wall = room.walls.find(({ id }) => id === 'A');
    expect(horizontalChains(room, wall, 'upper', DEFAULT_SETTINGS)).toEqual({
      inner: [],
      outer: [],
    });
    expect(wallRow(room, wall, DEFAULT_SETTINGS)).toEqual([{ start: 0, end: 120, kind: 'wall' }]);
  });

  it('SPEC-10 6. omits the wall row for a zero-length wall', () => {
    const room = roomR({ wallA: { x2: 0, y2: 0 } });
    const wall = room.walls.find(({ id }) => id === 'A');

    expect(horizontalChains(room, wall, 'lower', DEFAULT_SETTINGS)).toEqual({
      inner: [],
      outer: [],
    });
  });

  it('6. keeps the tall span on the upper piece row', () => {
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
    // DM3: the open spaces either side leave the piece row.
    expect(inner[tallIndex - 1]).toMatchObject({ end: 30, kind: 'piece' });
    expect(inner.some(({ kind }) => kind === 'open')).toBe(false);
    expect(inner).toHaveLength(tallIndex + 1);
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
    expectContiguous(chains.inner, -6, 54);
    expectContiguous(chains.outer, -6, 120);
  });

  it('228. adds a base neighbour to both lower chains', () => {
    const room = straightRoom({
      wallA: { runs: [base('A1', { x: 90 })] },
      wallB: { runs: [base('B1')] },
    });
    const wallA = horizontalChains(room, view(room, 'A'), 'lower', DEFAULT_SETTINGS);
    const wallB = horizontalChains(room, view(room, 'B'), 'lower', DEFAULT_SETTINGS);
    const rightNeighbor = {
      start: 120,
      end: 150,
      kind: 'neighbor',
      wallId: 'B',
      neighborRunId: 'B1',
    };
    const leftNeighbor = {
      start: -30,
      end: 0,
      kind: 'neighbor',
      wallId: 'A',
      neighborRunId: 'A1',
    };

    expect(wallA.inner.at(-1)).toEqual(rightNeighbor);
    expect(wallA.outer.at(-1)).toEqual(rightNeighbor);
    expect([...wallA.inner, ...wallA.outer].some(({ runId }) => runId === 'B1')).toBe(false);
    expect(wallB.inner[0]).toEqual(leftNeighbor);
    expect(wallB.outer[0]).toEqual(leftNeighbor);
    expectContiguous(wallA.inner, 90, 150);
    expectContiguous(wallA.outer, 0, 150);
    expectContiguous(wallB.inner, -30, 30);
    expectContiguous(wallB.outer, -30, 120);
  });

  it('229. adds an upper neighbour only to the upper chains', () => {
    const room = straightRoom({
      wallA: { runs: [base('A1', { x: 90 })] },
      wallB: { runs: [run('U1', CABINET_TYPE_IDS.UPPER, 12, {
        x: 0, width: 30, z: 54, height: 36, heightMode: 'auto',
      })] },
    });
    const wall = view(room, 'A');
    const lower = horizontalChains(room, wall, 'lower', DEFAULT_SETTINGS);
    const upper = horizontalChains(room, wall, 'upper', DEFAULT_SETTINGS);

    expect(lower.inner.some(({ kind }) => kind === 'neighbor')).toBe(false);
    expect(lower.outer.some(({ kind }) => kind === 'neighbor')).toBe(false);
    expect(lower.inner.at(-1).end).toBe(120);
    expect(lower.outer.at(-1).end).toBe(120);
    expect(upper).toEqual({
      inner: [{
        start: 120,
        end: 150,
        kind: 'neighbor',
        wallId: 'B',
        neighborRunId: 'U1',
      }],
      outer: [
        {
          start: 120,
          end: 150,
          kind: 'neighbor',
          wallId: 'B',
          neighborRunId: 'U1',
        },
      ],
    });
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
  return syncRoom(roomR({ wallA: { height, profile: { wallHeight: height }, runs } }), DEFAULT_SETTINGS);
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
      anchor: 'center',
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
      anchor: 'center',
    }]);
  });

  it('SPEC-38.1 measures an edge pin to that edge; nothing without a pin', () => {
    const edgePins = {
      items: [
        { id: 'left', pin: { from: 'right', value: 96, anchor: 'right' } },
        { id: 'mid', pin: { from: 'left', value: 24, anchor: 'left' } },
      ],
    };

    expect(centerlineMarkers(
      edgePins,
      pieces,
      { openings: [] },
      120,
      DEFAULT_SETTINGS,
    )).toEqual([
      {
        pieceId: 'left', x: 24, datumX: 120, z: 40, value: 96, pieceBottom: 4, pieceTop: 34.5,
        from: 'right', anchor: 'right',
      },
      {
        pieceId: 'mid', x: 24, datumX: 0, z: 40, value: 24, pieceBottom: 4, pieceTop: 34.5,
        from: 'left', anchor: 'left',
      },
    ]);
    expect(centerlineMarkers(
      { items: [] },
      pieces,
      { openings: [] },
      120,
      DEFAULT_SETTINGS,
    )).toEqual([]);
  });

  it('SPEC-39.1 puts a pin to an opening inside the opening, with a centre line down from its middle', () => {
    const sinkWindow = {
      id: 'W', kind: 'window', label: 'W1', measureMode: 'jamb', width: 36, height: 48, sillZ: 42,
      offset: 12, offsetFrom: 'right', offsetAnchor: 'edge', casing: { width: 3, thickness: 0.75 },
    };
    const run = {
      items: [
        { id: 'left', pin: null },
        { id: 'sink', pin: { from: 'opening', openingId: 'W', openingAnchor: 'center', value: 0, anchor: 'center' } },
      ],
    };
    const sinkPieces = [
      { id: 'left', role: 'item', x: 0, width: 24, z: 4, height: 30.5 },
      { id: 'sink', role: 'item', x: 78, width: 24, z: 4, height: 30.5 },
    ];

    expect(centerlineMarkers(run, sinkPieces, { openings: [sinkWindow] }, 120, DEFAULT_SETTINGS)).toEqual([{
      pieceId: 'sink',
      x: 90,
      datumX: 90,
      z: 48,
      value: 0,
      pieceBottom: 4,
      pieceTop: 34.5,
      from: 'opening',
      anchor: 'center',
      datumZ: 66,
    }]);
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
      // DM3: the piece row skips open space, so it is ordered and gapped, not contiguous.
      expect(chains.inner.some(({ kind }) => kind === 'open')).toBe(false);
      chains.inner.forEach((segment, index) => {
        expect(segment.end - segment.start).toBeGreaterThan(1e-6);
        if (index > 0) expect(segment.start).toBeGreaterThanOrEqual(chains.inner[index - 1].end - 1e-8);
      });
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
      middle: [],
      outer: [{ start: 0, end: 96, kind: 'wall' }],
    });
    expect(verticalOpeningChain(wall, doorOpening(), 120, DEFAULT_SETTINGS)).toEqual({
      inner: [
        { start: 0, end: 80, kind: 'opening' },
        { start: 80, end: 83, kind: 'casing' },
        { start: 83, end: 96, kind: 'above' },
      ],
      middle: [],
      outer: [{ start: 0, end: 96, kind: 'wall' }],
    });
  });
});

describe('SPEC-36 opening dimensions', () => {
  const wallOf = (room) => room.walls.find(({ id }) => id === 'A');
  const F = cabinetRun('F', CABINET_TYPE_IDS.BASE, {
    x: 24, width: 36, heightMode: 'manual', autoCount: false,
    ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
    items: [{ id: 'a', kind: 'cabinet', width: 18 }, { id: 'b', kind: 'cabinet', width: 18 }],
  });

  it('dimensions a face frame stile to opening, and a gap between boxes', () => {
    const inset = { ...roomR({ wallA: { runs: [F] } }), style: { cabinetStyleId: 14 } };
    expect(horizontalChains(inset, wallOf(inset), 'lower', DEFAULT_SETTINGS).inner).toEqual([
      { start: 24, end: 24.75, kind: 'frame', runId: 'F' },
      { start: 24.75, end: 41.25, kind: 'frame-opening', runId: 'F', pieceId: 'a' },
      { start: 41.25, end: 42.75, kind: 'frame', runId: 'F' },
      { start: 42.75, end: 59.25, kind: 'frame-opening', runId: 'F', pieceId: 'b' },
      { start: 59.25, end: 60, kind: 'frame', runId: 'F' },
    ]);

    const spaced = {
      ...F, width: 36.5, _seamGap: 0.5,
      items: [{ id: 'a', kind: 'cabinet', width: null }, { id: 'b', kind: 'cabinet', width: null }],
    };
    const euro = roomR({ wallA: { runs: [spaced] } });
    expect(horizontalChains(euro, wallOf(euro), 'lower', DEFAULT_SETTINGS).inner.slice(0, 3)).toEqual([
      { start: 24, end: 42, kind: 'piece', runId: 'F', pieceId: 'a' },
      { start: 42, end: 42.5, kind: 'gap', runId: 'F' },
      { start: 42.5, end: 60.5, kind: 'piece', runId: 'F', pieceId: 'b' },
    ]);
  });
});
