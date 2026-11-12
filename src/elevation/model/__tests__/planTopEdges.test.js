import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { normalizeCornerEnd } from '../cornerEnd.js';
import { planParts, planSolidParts } from '../planParts.js';
import { elevationToPlan } from '../geometry.js';
import { planTopEdges } from '../planTops.js';
import { wallSideFrame } from '../wallSides.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';
import { connectWallStops } from './helpers/wallStops.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };

// A wall's front-face (u, v) points in plan inches, y up (the frame planParts maps run pieces with).
function planTopPoints(subject, stored, points) {
  const frame = wallSideFrame(subject, stored, 'front');
  return points.map(([u, v]) => {
    const { x, y } = elevationToPlan(frame, u, v);
    return [x + 0, 0 - y];
  });
}
const noEnds = { left: { type: 'none' }, right: { type: 'none' } };
const corner = room({ walls: [wall({ id: 'w', x2: 96, thickness: 4.5, runs: [
  run({ id: 'base', top: 'wood', autoCount: false, ends: noEnds, width: 96,
    anchors: { left: true, right: true }, items: [auto('C')] }),
] })] });
connectWallStops(corner, corner.walls[0]);
corner.walls[1].runs = [run({ id: 'return', top: 'wood', autoCount: false, ends: noEnds,
  x: 84, width: 36, anchors: { right: true }, items: [auto('R')] })];

const stored9b = JSON.parse(readFileSync(new URL('./fixtures/room9b.json', import.meta.url), 'utf8'));
const settings9b = { ...DEFAULT_SETTINGS, ...stored9b.settingsOverrides };
const golden = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);

// Compare the measured vertices within 1e-3, accepting either walk direction and,
// for a closed loop, any starting vertex. Metadata and chain order remain exact.
function expectChains(actual, expected) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach(({ points, ...metadata }, i) => {
    expect(actual[i]).toEqual({ ...metadata, points: actual[i].points });
    expect(actual[i].points).toHaveLength(points.length);
    const directions = [points, [...points].reverse()];
    const candidates = metadata.closed
      ? directions.flatMap((direction) => direction.map((_, start) =>
        [...direction.slice(start), ...direction.slice(0, start)])) : directions;
    const errors = candidates.map((candidate) => Math.max(...candidate.flatMap((point, j) =>
      point.map((value, axis) => Math.abs(value - actual[i].points[j][axis])))));
    expect(Math.min(...errors), `vertices of ${metadata.id}: ${JSON.stringify(actual[i].points)}`)
      .toBeLessThanOrEqual(1e-3);
  });
}

describe('PT2 step b exposed plan top edges', () => {
  it.each([
    ['1: wood miter', 'wood', 'miter', [[0, 0], [25.625, 25.625]]],
    ['2: wood butt', 'wood', 'butt', [[25.625, 0], [25.625, 25.625]]],
    ['3: stone', undefined, 'miter', null],
  ])('measured case %s fills the corner and draws each joint once', (_, top, woodTopCorner, joint) => {
    const subject = structuredClone(corner);
    subject.walls.forEach(({ runs }) => runs.forEach((run) => {
      if (top === undefined) delete run.top;
      else run.top = top;
    }));
    const using = { ...settings, woodTopCorner };
    const inPlan = (points) => planTopPoints(subject, subject.walls[0], points);
    const expected = [{ id: 'top:0:0', kind: 'edge', closed: false,
      points: inPlan([[0, 36.75], [25.625, 36.75], [25.625, 25.625], [96, 25.625]]) }];
    if (joint) expected.push({ id: 'top-joint:0:0', kind: 'joint', closed: false, points: inPlan(joint) });
    expectChains(planTopEdges(subject, using, planSolidParts(subject, using, { bottoms: true })), expected);
  });

  it('measured case 4: leaves only the front edge when the return run is removed', () => {
    const subject = structuredClone(corner);
    subject.walls[1].runs = [];
    expectChains(planTopEdges(subject, settings, planSolidParts(subject, settings, { bottoms: true })), [
      { id: 'top:0:0', kind: 'edge', closed: false,
        points: planTopPoints(subject, subject.walls[0], [[0, 25.625], [96, 25.625]]) },
    ]);
  });

  it('measured case 5: bridges Room 9b’s island, with the tall frame covering its near end', () => {
    const subject = syncRoom(structuredClone(stored9b), settings9b);
    expectChains(planTopEdges(subject, settings9b, planSolidParts(subject, settings9b, { bottoms: true })), [
      { id: 'top:0:0', kind: 'edge', closed: false,
        points: [[-18.625, 20.688], [-18.625, -40.25], [8.563, -40.25], [8.563, 20.688]] },
    ]);
  });

  it.each([
    ['6: golden G1', 'G1 Euro kitchen', [
      { id: 'top:0:0', kind: 'edge', closed: false,
        points: [[-34.375, -54], [-34.375, 58.375], [60, 58.375]] },
      { id: 'top:0:1', kind: 'edge', closed: true,
        points: [[8.75, -17.5], [101.75, -17.5], [101.75, 21.75], [8.75, 21.75]] },
    ]],
    ['7: golden G2', 'G2 Face frame kitchen', [
      { id: 'top:0:0', kind: 'edge', closed: false,
        points: [[-9.5, -10.562], [60.438, -10.562], [60.438, -64.25],
          [87.5, -64.25], [87.5, 15.75], [86, 15.75]] },
    ]],
    ['8: golden G6', 'G6 Stacked runs', [
      { id: 'top:0:0', kind: 'edge', closed: false,
        points: [[-111.5, 0.875], [-9.75, 0.875], [-9.75, 26.5]] },
      { id: 'top:0:1', kind: 'edge', closed: false,
        points: [[88.5, 18.5], [16.25, 18.5], [16.25, -7.125], [88.5, -7.125]] },
    ]],
  ])('measured case %s', (_, name, expected) => {
    const subject = syncRoom(structuredClone(golden.rooms.find((candidate) => candidate.name === name)), golden.settings);
    expectChains(planTopEdges(subject, golden.settings,
      planSolidParts(subject, golden.settings, { bottoms: true })), expected);
  });

  it.each([
    [12, [[0, 25.625], [60, 25.625], [60, 12.875]]],
    [26, [[0, 25.625], [60, 25.625]]],
  ])('step b tall case: a %s-inch-deep tall hides only the end edge it covers', (depth, points) => {
    const subject = room({ walls: [wall({ id: 'w', x2: 96, thickness: 4.5, runs: [
      run({ id: 'base', autoCount: false, ends: noEnds, width: 60,
        anchors: { left: true }, items: [auto('B')] }),
      run({ id: 'tall', cabinetTypeId: CABINET_TYPE_IDS.TALL, top: 'none', autoCount: false,
        // The exposed tall side runs to the face front (box + 7/8), closing the bumper gap.
        ends: { left: { type: 'end_panel', width: 0.75 }, right: { type: 'none' } },
        x: 60, width: 36, z: 0, height: 84, depth, items: [auto('T')] }),
    ] })] });
    connectWallStops(subject, subject.walls[0]);
    expectChains(planTopEdges(subject, settings, planSolidParts(subject, settings, { bottoms: true })), [
      { id: 'top:0:0', kind: 'edge', closed: false, points: planTopPoints(subject, subject.walls[0], points) },
    ]);
  });

  it('keeps every base top edge when a deeper upper hangs above it', () => {
    const subject = room({ walls: [wall({ id: 'w', x2: 96, thickness: 4.5, runs: [
      run({ id: 'base', autoCount: false, ends: noEnds, width: 96,
        anchors: { left: true, right: true }, items: [auto('B')] }),
    ] })] });
    connectWallStops(subject, subject.walls[0]);
    const expected = [{ id: 'top:0:0', kind: 'edge', closed: false,
      points: planTopPoints(subject, subject.walls[0], [[0, 25.625], [96, 25.625]]) }];
    expectChains(planTopEdges(subject, settings, planSolidParts(subject, settings, { bottoms: true })), expected);
    subject.walls[0].runs.push(run({ id: 'upper', cabinetTypeId: CABINET_TYPE_IDS.UPPER,
      top: 'none', autoCount: false, ends: noEnds, width: 96, z: 54, height: 30, depth: 30,
      items: [auto('U')] }));
    const solids = planSolidParts(subject, settings, { bottoms: true });
    const upperSolids = solids.filter(({ runId }) => runId === 'upper');
    expect(upperSolids.length).toBeGreaterThan(0);
    upperSolids.forEach((part) => expect(part).toMatchObject({ bottom: 54, top: 84 }));
    expectChains(planTopEdges(subject, settings, solids), expected);
  });

  it('preserves the planParts solids and omits bottom unless explicitly requested', () => {
    for (const stored of golden.rooms) {
      const subject = syncRoom(structuredClone(stored), golden.settings);
      const solids = planSolidParts(subject, golden.settings);
      expect(solids).toEqual(planParts(subject, golden.settings).filter(({ kind }) => kind !== 'countertop'));
      solids.forEach((part) => expect(part).not.toHaveProperty('bottom'));
      expect(planSolidParts(subject, golden.settings, { bottoms: false })).toEqual(solids);
      const withBottoms = planSolidParts(subject, golden.settings, { bottoms: true });
      expect(withBottoms.map((part) => {
        const plain = { ...part };
        delete plain.bottom;
        return plain;
      })).toEqual(solids);
      withBottoms.filter(({ runId, kind }) => runId || kind === 'wall_end_panel')
        .forEach((part) => expect(part.bottom).toEqual(expect.any(Number)));
      withBottoms.filter(({ runId, kind }) => !runId && kind !== 'wall_end_panel')
        .forEach((part) => expect(part).not.toHaveProperty('bottom'));
    }
  });

  it('returns no edges or joints for empty rooms and rooms without tops', () => {
    expect(planTopEdges(room(), settings)).toEqual([]);
    const subject = room({ walls: [wall({ runs: [run({ top: 'none', items: [auto('C')] })] })] });
    expect(planTopEdges(subject, settings, planSolidParts(subject, settings, { bottoms: true }))).toEqual([]);
  });
});

describe('PT2 step c top edges in the plan payload', () => {
  it('anchor 1: the corner room carries its edge chain and mitered joint as countertop parts', () => {
    const tops = planParts(corner, settings).filter(({ kind }) => kind === 'countertop');
    const inPlan = (points) => planTopPoints(corner, corner.walls[0], points);
    expectChains(tops, [
      { id: 'top:0:0', kind: 'countertop', closed: false,
        points: inPlan([[0, 36.75], [25.625, 36.75], [25.625, 25.625], [96, 25.625]]) },
      { id: 'top-joint:0:0', kind: 'countertop', closed: false, points: inPlan([[0, 0], [25.625, 25.625]]) },
    ]);
    tops.forEach((part) => {
      expect(part).not.toHaveProperty('top');
      expect(part).not.toHaveProperty('runId');
    });
    expect(planParts(corner, settings).some((part) => 'bottom' in part)).toBe(false);
  });
});

describe('CC7 step e corner countertop pieces in plan', () => {
  let owner, ownerWall, returnWall;

  beforeEach(() => {
    owner = run({ autoCount: false, items: [fixed('cc', 36), auto('a')],
      anchors: { left: true, right: false },
      ends: { left: normalizeCornerEnd({ corner: { kind: 90 } }), right: { type: 'none' } },
    });
    ownerWall = wall({ runs: [owner],
      connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null },
    });
    returnWall = wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0, runs: [],
      connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
    });
  });

  it.each([
    ['1: E90R', 90, true, null, false, [
      [0, -132.75], [25.625, -132.75], [25.625, -25.625], [120.75, -25.625], [120.75, 0],
    ]],
    ['2: E90', 90, false, null, false, [
      [0, -37.5625], [25.625, -37.5625], [25.625, -25.625], [120.75, -25.625], [120.75, 0],
    ]],
    ['3: E45', 45, false, null, false, [
      [0, -37.5625], [25.625, -37.5625], [25.625, -36.3732], [36.3732, -25.625],
      [120.75, -25.625], [120.75, 0],
    ]],
    ['4: E45R', 45, true, null, false, [
      [0, -132.75], [25.625, -132.75], [25.625, -36.3732], [36.3732, -25.625],
      [120.75, -25.625], [120.75, 0],
    ]],
    ['5: E45u', 45, false, 15, false, [
      [0, -37.5625], [16.625, -37.5625], [16.625, -36.5038], [36.2069, -25.625],
      [120.75, -25.625], [120.75, 0],
    ]],
    ['6: E45R wood', 45, true, null, true, [
      [0, -132.75], [25.625, -132.75], [25.625, -36.3732], [36.3732, -25.625],
      [120.75, -25.625], [120.75, 0],
    ]],
  ])('anchor %s', (_, kind, joined, depthB, wood, points) => {
    Object.assign(owner.ends.left.corner, { kind, depthB });
    if (wood) owner.top = 'wood';
    if (joined) {
      returnWall.runs = [run({ id: 'run-2', x: 0, width: 96,
        anchors: { left: false, right: true }, items: [auto('r')], ends: noEnds,
        ...(wood ? { top: 'wood' } : {}),
      })];
    }
    const subject = syncRoom(room({ walls: [ownerWall, returnWall] }), settings);
    const expected = [{ id: 'top:0:0', kind: 'edge', closed: false, points }];
    if (wood) expected.push({ id: 'top-joint:0:0', kind: 'joint', closed: false,
      points: [[0, -36.3732], [25.625, -36.3732]] });
    expectChains(planTopEdges(subject, settings, planSolidParts(subject, settings, { bottoms: true })), expected);
    if (wood) {
      const butt = { ...settings, woodTopCorner: 'butt' };
      expectChains(planTopEdges(subject, butt, planSolidParts(subject, butt, { bottoms: true })), expected);
    }
  });

  it.each(['right', 'back'])('maps a free wood 45 leg and fill on the %s owner face', (orientation) => {
    owner.top = 'wood';
    owner.ends.left.corner.kind = 45;
    if (orientation === 'right') {
      ownerWall.runs = [run({ ...owner, items: [auto('a'), fixed('cc', 36)],
        anchors: { left: false, right: true },
        ends: { left: { type: 'none' }, right: owner.ends.left },
      })];
      ownerWall.connections = { start: null, end: { wallId: 'wall-2', endpoint: 'start' } };
      Object.assign(returnWall, { x1: 144, y1: 0, x2: 144, y2: 144,
        connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null } });
    } else {
      owner.wallSide = 'back';
      Object.assign(ownerWall, { flipped: true, thickness: 4.5, y1: -4.5, y2: -4.5 });
    }
    const subject = syncRoom(room({ walls: [ownerWall, returnWall] }), settings);
    const points = [[0, -37.5625], [25.625, -37.5625], [25.625, -36.3732], [36.3732, -25.625],
      [120.75, -25.625], [120.75, 0]];
    expectChains(planTopEdges(subject, settings, planSolidParts(subject, settings, { bottoms: true })), [
      { id: 'top:0:0', kind: 'edge', closed: false,
        points: orientation === 'right' ? points.map(([x, y]) => [144 - x, y]) : points },
    ]);
  });
});
