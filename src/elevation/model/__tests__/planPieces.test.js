import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { gridFromItems } from '../grid.js';
import { planRunPieces, topFaces } from '../planPieces.js';
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
  autoCount: false,
  maxCabinetWidth: null,
  items: [],
  heightMode: 'manual',
  overrides: {},
  anchors: { left: false, right: false },
  wallSide: 'front',
  ...overrides,
});

const base = (id, overrides = {}) => run(id, CABINET_TYPE_IDS.BASE, 24, {
  z: 4,
  height: 30.5,
  ...overrides,
});

const cornerRoom = (hostRun, neighborRuns) => syncRoom({
  id: 'K',
  name: 'Room K',
  profile: { ...DEFAULT_SETTINGS.defaultProfile },
  partNumberStart: 1,
  partNumberOverrides: {},
  wallOrder: ['K1', 'K2'],
  walls: [
    makeWall('K1', 0, 0, 120, 0, {
      connections: { start: { wallId: 'K2', endpoint: 'start' }, end: null },
      runs: [hostRun],
    }),
    makeWall('K2', 0, 0, 0, 96, {
      connections: { start: { wallId: 'K1', endpoint: 'start' }, end: null },
      runs: neighborRuns,
    }),
  ],
}, DEFAULT_SETTINGS);

const neighborBase = () => base('N', { anchors: { left: false, right: true } });
const neighborUpper = () => run('U', CABINET_TYPE_IDS.UPPER, 12, {
  z: 54, height: 36, heightMode: 'manual', anchors: { left: false, right: true },
});

const tallBlind = () => run('T', CABINET_TYPE_IDS.TALL, 24, {
  x: 25, width: 24, z: 4, height: 86, heightMode: 'manual',
  ends: { left: { type: 'blind', width: 3 }, right: { type: 'none', width: null } },
  autoCount: false,
  items: [{ id: 't1', kind: 'cabinet', width: 21 }],
  blind: { left: 42, right: null },
});

function fixture(overrides = {}) {
  const sourceRun = base('P', {
    x: 0,
    width: 30,
    ends: {
      left: { type: 'filler', width: 3 },
      right: { type: 'none', width: null },
    },
    items: [{ id: 'c1', kind: 'cabinet', width: 27 }],
    ...overrides,
  });
  const room = syncRoom({
    id: 'P',
    name: 'Room P',
    profile: { ...DEFAULT_SETTINGS.defaultProfile },
    partNumberStart: 1,
    partNumberOverrides: {},
    wallOrder: ['P1'],
    walls: [makeWall('P1', 0, 0, 120, 0, { runs: [sourceRun] })],
  }, DEFAULT_SETTINGS);
  const wall = wallSideView(room.walls[0], 'front');
  const resolvedRun = wall.runs[0];
  const layout = layoutRun(room, wall, resolvedRun, DEFAULT_SETTINGS);
  const faceLayouts = runFaceLayouts(
    room,
    wall,
    resolvedRun,
    DEFAULT_SETTINGS,
    layout,
  );
  return { room, wall, run: resolvedRun, layout, faceLayouts };
}

function blindFixture(overrides = {}) {
  const sourceRun = base('P', {
    x: 12,
    width: 24,
    ends: {
      left: { type: 'blind', width: 3 },
      right: { type: 'none', width: null },
    },
    autoCount: false,
    items: [{ id: 'w1', kind: 'cabinet', width: 21 }],
    blind: { left: 42, right: null },
    ...overrides,
  });
  const room = syncRoom({
    id: 'P',
    name: 'Room P',
    profile: { ...DEFAULT_SETTINGS.defaultProfile },
    partNumberStart: 1,
    partNumberOverrides: {},
    wallOrder: ['P1'],
    walls: [makeWall('P1', 0, 0, 120, 0, { runs: [sourceRun] })],
  }, DEFAULT_SETTINGS);
  const wall = wallSideView(room.walls[0], 'front');
  const resolvedRun = wall.runs[0];
  const layout = layoutRun(room, wall, resolvedRun, DEFAULT_SETTINGS);
  const faceLayouts = runFaceLayouts(
    room,
    wall,
    resolvedRun,
    DEFAULT_SETTINGS,
    layout,
  );
  return { room, wall, run: resolvedRun, layout, faceLayouts };
}

describe('plan box and face geometry', () => {
  it('217. builds the box, faces, and cabinet-side filler return', () => {
    const input = fixture();
    const result = planRunPieces(
      input.room,
      input.wall,
      input.run,
      DEFAULT_SETTINGS,
      input.layout,
      input.faceLayouts,
    );

    expect(result.boxes).toEqual([{
      key: 'c1', start: 3, end: 30, back: 0, front: 24,
    }]);
    expect(result.faces.filter(({ kind }) => kind === 'filler')).toEqual([{
      key: 'P:left',
      kind: 'filler',
      start: 0,
      end: 3,
      back: 24.0625,
      front: 24.875,
    }]);
    expect(result.faces.every(({ back, front }) => (
      back === 24.0625 && front === 24.875
    ))).toBe(true);
    const cabinetFaces = result.faces.filter(({ kind }) => kind === 'face');
    expect(cabinetFaces).toHaveLength(2);
    expect(cabinetFaces.every(({ start, end }) => start >= 3 && end <= 30)).toBe(true);
    expect(result.returns).toEqual([{
      key: 'P:left:right',
      start: 2.25,
      end: 3,
      back: 21.5625,
      front: 24.0625,
    }]);
  });

  it('218. grows an ordered end filler away from the cabinet', () => {
    const input = fixture({
      endFiller: { left: { width: 6, returnDepth: 4 }, right: null },
    });
    const result = planRunPieces(
      input.room,
      input.wall,
      input.run,
      DEFAULT_SETTINGS,
      input.layout,
      input.faceLayouts,
    );

    expect(result.faces.filter(({ kind }) => kind === 'filler')).toEqual([{
      key: 'P:left',
      kind: 'filler',
      start: -3,
      end: 3,
      back: 24.0625,
      front: 24.875,
    }]);
    expect(result.returns).toEqual([{
      key: 'P:left:right',
      start: 2.25,
      end: 3,
      back: 20.0625,
      front: 24.0625,
    }]);
    expect(result.boxes).toEqual([{
      key: 'c1', start: 3, end: 30, back: 0, front: 24,
    }]);
  });

  it('219. keeps only the highest face in each horizontal span', () => {
    const drawers = [
      { x: 0, z: 0, width: 20, height: 8 },
      { x: 0, z: 9, width: 20, height: 8 },
      { x: 0, z: 18, width: 20, height: 8 },
    ];
    expect(topFaces(drawers)).toEqual([drawers[2]]);

    const pair = [
      { x: 0, z: 0, width: 10, height: 30 },
      { x: 10, z: 0, width: 10, height: 30 },
    ];
    expect(topFaces(pair)).toEqual(pair);

    const columns = [
      { x: 0, z: 0, width: 10, height: 8 },
      { x: 0, z: 9, width: 10, height: 20 },
      { x: 12, z: 0, width: 10, height: 8 },
      { x: 12, z: 9, width: 10, height: 20 },
    ];
    expect(topFaces(columns)).toEqual([columns[1], columns[3]]);
    expect(topFaces([])).toEqual([]);
  });

  it('224. uses blind filler width and return defaults without storing them', () => {
    const defaults = blindFixture();
    const defaultResult = planRunPieces(
      defaults.room,
      defaults.wall,
      defaults.run,
      DEFAULT_SETTINGS,
      defaults.layout,
      defaults.faceLayouts,
    );
    expect(defaultResult.faces.filter(({ kind }) => kind === 'filler')).toEqual([{
      key: 'P:left',
      kind: 'filler',
      start: 9,
      end: 15,
      back: 24.0625,
      front: 24.875,
    }]);
    expect(defaultResult.returns).toEqual([]);

    const returned = blindFixture({
      endFiller: { left: { returnDepth: 2.5 }, right: null },
    });
    const returnedResult = planRunPieces(
      returned.room,
      returned.wall,
      returned.run,
      DEFAULT_SETTINGS,
      returned.layout,
      returned.faceLayouts,
    );
    expect(returnedResult.returns).toEqual([{
      key: 'P:left:right',
      start: 14.25,
      end: 15,
      back: 21.5625,
      front: 24.0625,
    }]);
    expect(returnedResult.faces.filter(({ kind }) => kind === 'filler')).toEqual([
      expect.objectContaining({ start: 9, end: 15 }),
    ]);

    const ordered = blindFixture({
      endFiller: { left: { width: 3 }, right: null },
    });
    const orderedResult = planRunPieces(
      ordered.room,
      ordered.wall,
      ordered.run,
      DEFAULT_SETTINGS,
      ordered.layout,
      ordered.faceLayouts,
    );
    expect(orderedResult.faces.filter(({ kind }) => kind === 'filler')).toEqual([
      expect.objectContaining({ start: 12, end: 15 }),
    ]);
  });

  it('226. draws cabinet boxes and an end panel at their true sizes', () => {
    const input = fixture({
      x: 0,
      width: 30,
      ends: {
        left: { type: 'end_panel', width: null },
        right: { type: 'none', width: null },
      },
      autoCount: false,
      items: [{ id: 'c1', kind: 'cabinet', width: 29.25 }],
    });
    const result = planRunPieces(
      input.room,
      input.wall,
      input.run,
      DEFAULT_SETTINGS,
      input.layout,
      input.faceLayouts,
    );

    expect(result.boxes).toEqual([{
      key: 'c1', start: 0.75, end: 30, back: 0, front: 24,
    }]);
    expect(result.faces.filter(({ kind }) => kind === 'end_panel')).toEqual([{
      key: 'P:left',
      kind: 'end_panel',
      start: 0,
      end: 0.75,
      back: 0,
      front: 24.875,
    }]);
    expect(result.faces.filter(({ kind }) => kind === 'face').every(({ back, front }) => (
      back === 24.0625 && front === 24.875
    ))).toBe(true);
    expect(result.span).toEqual({ start: 0, end: 30 });
  });

  it('227. uses one ordered-width box for a blind cabinet', () => {
    const input = blindFixture();
    const result = planRunPieces(
      input.room,
      input.wall,
      input.run,
      DEFAULT_SETTINGS,
      input.layout,
      input.faceLayouts,
    );

    expect(result.boxes).toEqual([{
      key: 'w1', start: -6, end: 36, back: 0, front: 24,
    }]);
    expect(result.span).toEqual({ start: -6, end: 36 });
    expect(result.boxes.some(({ key }) => key === 'P:left')).toBe(false);

    const twoCabinet = fixture({
      items: [
        { id: 'c1', kind: 'cabinet', width: 13.5 },
        { id: 'c2', kind: 'cabinet', width: 13.5 },
      ],
    });
    const twoCabinetResult = planRunPieces(
      twoCabinet.room,
      twoCabinet.wall,
      twoCabinet.run,
      DEFAULT_SETTINGS,
      twoCabinet.layout,
      twoCabinet.faceLayouts,
    );
    expect(twoCabinetResult.boxes).toEqual([
      { key: 'c1', start: 3, end: 16.5, back: 0, front: 24 },
      { key: 'c2', start: 16.5, end: 30, back: 0, front: 24 },
    ]);
  });

  it('232. draws the blind panel as a face entry at the face plane', () => {
    const room = cornerRoom(tallBlind(), [neighborBase(), neighborUpper()]);
    const wall = wallSideView(room.walls[0], 'front');
    const resolvedRun = wall.runs[0];
    const layout = layoutRun(room, wall, resolvedRun, DEFAULT_SETTINGS);
    const faceLayouts = runFaceLayouts(
      room,
      wall,
      resolvedRun,
      DEFAULT_SETTINGS,
      layout,
    );
    const result = planRunPieces(
      room,
      wall,
      resolvedRun,
      DEFAULT_SETTINGS,
      layout,
      faceLayouts,
    );

    expect(result.faces.filter(({ kind }) => kind === 'panel')).toEqual([{
      key: 'T:left',
      kind: 'panel',
      start: 0,
      end: 27.875,
      back: 24.0625,
      front: 24.875,
    }]);
    expect(result.faces.some(({ kind }) => kind === 'filler')).toBe(false);
    expect(result.returns).toEqual([]);
    expect(result.boxes).toEqual([{
      key: 't1', start: 7, end: 49, back: 0, front: 24,
    }]);
    expect(result.span).toEqual({ start: 0, end: 49 });
  });
});

describe('SPEC-34.2 plan from cells', () => {
  const planOf = (overrides) => {
    const input = fixture({
      x: 0, width: 30,
      ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
      ...overrides,
    });
    return planRunPieces(input.room, input.wall, input.run, DEFAULT_SETTINGS, input.layout, input.faceLayouts);
  };

  it('draws a top-level side panel at the door face, or box depth when covered', () => {
    const items = (doors) => [
      { id: 'c1', kind: 'cabinet', width: 14.25 },
      { id: 'p', kind: 'panel', width: 0.75, ...(doors ? { doors } : {}) },
      { id: 'c2', kind: 'cabinet', width: 15 },
    ];
    const flush = planOf({ items: items() });
    expect(flush.boxes).toEqual([
      { key: 'c1', start: 0, end: 14.25, back: 0, front: 24 },
      { key: 'c2', start: 15, end: 30, back: 0, front: 24 },
    ]);
    expect(flush.faces.filter(({ kind }) => kind === 'panel')).toEqual([
      { key: 'p', kind: 'panel', start: 14.25, end: 15, back: 0, front: 24.875 },
    ]);
    expect(planOf({ items: items('cover') }).faces.filter(({ kind }) => kind === 'panel')).toEqual([
      { key: 'p', kind: 'panel', start: 14.25, end: 15, back: 0, front: 24 },
    ]);
  });

  it('draws a split column\'s cells, not one cabinet', () => {
    const stack = {
      id: 'g', cols: [{ id: 'g:c', size: null, sizeMode: 'auto' }],
      rows: [
        { id: 'g:r0', size: null, sizeMode: 'auto' },
        { id: 'g:r1', size: 10, sizeMode: 'manual' },
        { id: 'g:r2', size: 6, sizeMode: 'manual' },
      ],
      cells: [
        { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'sh', kind: 'shelves', shelves: { count: 2, back: false } } },
        { col: 0, row: 1, colSpan: 1, rowSpan: 1, node: { id: 'ov', kind: 'cabinet', depth: 21, align: 'back' } },
        { col: 0, row: 2, colSpan: 1, rowSpan: 1, node: { id: 'op', kind: 'void' } },
      ],
    };
    const plan = planOf({
      items: undefined,
      grid: gridFromItems('P', [{ id: 'g', kind: 'cabinet', width: null, grid: stack }]),
    });
    expect(plan.boxes).toEqual([
      { key: 'ov', start: 0, end: 30, back: 0, front: 21 },
      { key: 'sh', start: 0, end: 30, back: 0, front: 24, dashed: true },
    ]);
    const faces = plan.faces.filter(({ kind }) => kind === 'face');
    expect(faces).toHaveLength(2);
    expect(faces.every(({ key, back, front }) => (
      key.startsWith('ov:') && back === 21.0625 && front === 21.875
    ))).toBe(true);
  });
});
