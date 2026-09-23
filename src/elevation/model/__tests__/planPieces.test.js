import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
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

    expect(result.box).toEqual({ start: 0, end: 30, back: 0, front: 24 });
    expect(result.divisions).toEqual([]);
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
    expect(result.box).toEqual({ start: 0, end: 30, back: 0, front: 24 });
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
});
