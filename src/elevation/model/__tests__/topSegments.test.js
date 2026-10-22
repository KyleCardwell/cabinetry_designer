import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { runFaceLayouts } from '../faceLayouts.js';
import { gridFromItems, updateRootItem } from '../grid.js';
import { columnSteps, resolveTopSegments, topSegmentRange } from '../index.js';
import { roomDiagnostics } from '../roomSync.js';
import { splitRun } from '../splitRun.js';
import { columnOverlaps } from '../topSegments.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const segment = { id: 's', from: 'B', to: 'B', kind: 'wood', drop: 2, mode: 'box' };
const manual = (value) => ({ value, source: 'manual' });

function makeRun(segments = [segment]) {
  return {
    id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 90, z: 4, height: 30.5, depth: 24,
    top: 'stone', style: { cabinetStyleId: 13 },
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    autoCount: false, heightMode: 'manual', overrides: {}, anchors: {},
    grid: gridFromItems('r', ['A', 'B', 'C'].map((id) => ({
      id, kind: 'cabinet', width: 30, face: { type: 'door' },
    }))),
    topSegments: segments,
  };
}

function makeRoom(run) {
  return {
    id: 'room', name: 'Room', profile: {}, wallOrder: ['w'],
    walls: [{ id: 'w', x1: 0, y1: 0, x2: 120, y2: 0, height: 96, thickness: 4.5,
      flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [] }],
  };
}

function facesFor(run) {
  const room = makeRoom(run);
  return runFaceLayouts(room, room.walls[0], run, settings);
}

const heights = (run) => splitRun(run, settings).pieces.map(({ height }) => height);
const warnings = (run) => roomDiagnostics(makeRoom(run), settings).r.warnings
  .filter(({ code }) => code.startsWith('top-segment-'));

describe('ST4 step b top segments', () => {
  it('anchor 1: derives a two-inch drop for B without storing it on the column', () => {
    const run = makeRun();
    const before = structuredClone(run);
    expect(splitRun(run, settings).pieces.map(({ id, x, z, width, height }) => ({ id, x, z, width, height })))
      .toEqual([
        { id: 'A', x: 0, z: 4, width: 30, height: 30.5 },
        { id: 'B', x: 30, z: 4, width: 30, height: 28.5 },
        { id: 'C', x: 60, z: 4, width: 30, height: 30.5 },
      ]);
    expect(columnSteps(run).get('B').top).toEqual({ value: 2, source: 'segment', segmentId: 's' });
    expect(run.grid.cols[1]).not.toHaveProperty('top');
    expect(run).toEqual(before);
  });

  it('anchor 2: wins over a stored manual top while preserving it and the manual bottom', () => {
    const run = makeRun();
    run.grid = updateRootItem(run.grid, 'B', { top: manual(1) });
    expect(heights(run)).toEqual([30.5, 28.5, 30.5]);
    expect(run.grid.cols[1].top).toEqual(manual(1));
    run.grid = updateRootItem(run.grid, 'B', { bottom: manual(3) });
    expect(columnSteps(run).get('B')).toEqual({
      top: { value: 2, source: 'segment', segmentId: 's' }, bottom: manual(3),
    });
    expect(splitRun(run, settings).pieces[1]).toMatchObject({ z: 7, height: 25.5 });
    expect(heights({ ...run, topSegments: [] })).toEqual([30.5, 26.5, 30.5]);
  });

  it('anchor 3: uses the wood reveal on B and the run stone reveal on A', () => {
    const faces = facesFor(makeRun());
    expect(faces.get('B').reveals.values.top).toBe(0.125);
    expect(faces.get('B').reveals.sources.top).toBe('rule:wood-top');
    expect(faces.get('A').reveals.values.top).toBe(0.25);
    expect(faces.get('A').reveals.sources.top).toBe('rule:stone-top');
  });

  it('anchor 4: resolves C to A inclusively in run order', () => {
    const run = makeRun([{ ...segment, from: 'C', to: 'A', kind: 'stone', drop: 1 }]);
    expect(topSegmentRange(run, run.topSegments[0]).map(({ id }) => id)).toEqual(['A', 'B', 'C']);
    expect(heights(run)).toEqual([29.5, 29.5, 29.5]);
  });

  it('anchor 5: warns about either missing endpoint and leaves boxes and reveals unchanged', () => {
    for (const endpoints of [{ from: 'gone' }, { to: 'gone' }]) {
      const run = makeRun([{ ...segment, ...endpoints }]);
      expect(heights(run)).toEqual([30.5, 30.5, 30.5]);
      expect(facesFor(run).get('B').reveals.sources.top).toBe('rule:stone-top');
      expect(warnings(run)).toEqual([{
        code: 'top-segment-orphaned', segmentId: 's', message: 'A selected cabinet is missing.',
      }]);
    }
  });

  it('anchor 6: ignores the entire later overlapping segment and keeps A full height', () => {
    const run = makeRun([{ ...segment, to: 'C' }, { ...segment, id: 'later', from: 'A' }]);
    expect(heights(run)).toEqual([30.5, 28.5, 28.5]);
    expect(resolveTopSegments(run).segments.map(({ id }) => id)).toEqual(['s']);
    expect(warnings(run)).toEqual([{
      code: 'top-segment-overlap', segmentId: 'later', message: 'Overlaps another top segment.',
    }]);
  });

  it('anchor 7: ignores segments on runs without a countertop', () => {
    for (const top of ['none', 'crown', 'topMold']) {
      const run = { ...makeRun(), top };
      expect(heights(run)).toEqual([30.5, 30.5, 30.5]);
      expect(warnings(run)).toEqual([{
        code: 'top-segment-no-countertop', segmentId: 's', message: 'This run has no countertop.',
      }]);
    }
  });

  it('anchor 8: accepts overlap mode without dropping boxes or overriding manual offsets', () => {
    const run = makeRun([{ ...segment, mode: 'overlap' }]);
    expect(heights(run)).toEqual([30.5, 30.5, 30.5]);
    expect(columnSteps(run).size).toBe(0);
    expect(resolveTopSegments(run).segments).toHaveLength(1);
    expect(warnings(run)).toEqual([]);
    run.grid = updateRootItem(run.grid, 'B', { top: manual(1) });
    expect(columnSteps(run).get('B').top).toEqual(manual(1));
    expect(heights(run)).toEqual([30.5, 29.5, 30.5]);
  });

  it('retains the ST1 minimum-height rule for segment drops combined with manual bottoms', () => {
    for (const bottom of [27.5, 27.75]) {
      const run = makeRun();
      run.grid = updateRootItem(run.grid, 'B', { top: manual(1), bottom: manual(bottom) });
      const layout = splitRun(run, settings);
      expect(layout.pieces[1]).toMatchObject(bottom === 27.5 ? { z: 31.5, height: 1 } : { z: 4, height: 30.5 });
      expect(layout.warnings).toEqual(bottom === 27.5 ? [] : [{
        code: 'column-step-too-big', pieceId: 'B',
        message: 'Top drop and bottom up leave less than 1 inch of box.',
      }]);
    }
  });

  it('uses nested root ids, applies drops once on the pinned path, and reveals only at the column top', () => {
    const run = makeRun();
    run.grid.cells[1].node = {
      id: 'B', cols: [{ id: 'B:c', size: null, sizeMode: 'auto' }],
      rows: [{ id: 'upper', size: 6, sizeMode: 'manual' }, { id: 'lower', size: null, sizeMode: 'auto' }],
      cells: ['B-upper', 'B-lower'].map((id, row) => ({
        col: 0, row, colSpan: 1, rowSpan: 1, node: { id, kind: 'cabinet', face: { type: 'door' } },
      })),
    };
    run.grid = updateRootItem(run.grid, 'B', {
      pin: { anchor: 'left', from: 'left', openingId: null, openingAnchor: 'center', value: 30 },
    });
    expect(splitRun(run, settings, { pinTargets: { B: 30 } }).pieces[1])
      .toMatchObject({ id: 'B', x: 30, z: 4, height: 28.5 });
    const faces = facesFor(run);
    expect(faces.get('B-upper').box).toMatchObject({ z: 26.5, height: 6 });
    expect(faces.get('B-upper').reveals.sources.top).toBe('rule:wood-top');
    expect(faces.get('B-lower').box).toMatchObject({ z: 4, height: 22.5 });
    expect(faces.get('B-lower').reveals.sources.top).toBe('rule:stacked-seam');
    const orphaned = { ...run, topSegments: [{ ...segment, from: 'B-upper' }] };
    expect(resolveTopSegments(orphaned).warnings[0].code).toBe('top-segment-orphaned');
  });

  it('handles default stone, stone segments on wood, legacy items, and manual reveal precedence', () => {
    const run = makeRun();
    delete run.top;
    expect(heights(run)).toEqual([30.5, 28.5, 30.5]);
    const stacked = { ...run, stack: { above: 'upper' } };
    expect(heights(stacked)).toEqual([30.5, 30.5, 30.5]);
    expect(resolveTopSegments(stacked).warnings[0].code).toBe('top-segment-no-countertop');
    const wood = { ...run, top: 'wood', topSegments: [{ ...segment, kind: 'stone' }] };
    expect(facesFor(wood).get('B').reveals.sources.top).toBe('rule:stone-top');
    expect(facesFor(wood).get('A').reveals.sources.top).toBe('rule:wood-top');
    wood.grid = updateRootItem(wood.grid, 'B', { reveals: { top: 0.375 } });
    const revealed = facesFor(wood).get('B').reveals;
    expect(revealed.values.top).toBe(0.375);
    expect(revealed.sources.top).toBe('manual');
    const items = ['A', 'B', 'C'].map((id) => ({ id, kind: 'cabinet', width: 30 }));
    expect(heights({ ...run, grid: undefined, items })).toEqual([30.5, 28.5, 30.5]);
  });
});

describe('ST5 step a top overlap reveals', () => {
  const overlap = { ...segment, kind: 'stone', drop: 1, mode: 'overlap' };
  const overlapRun = () => makeRun([overlap]);
  const insetRun = (cabinetStyleId) => ({
    ...overlapRun(), style: { cabinetStyleId, beadWidth: 0.25 },
    seamGap: 0, _frame: { thickness: 0.8125, drop: 0, bead: cabinetStyleId === 15 ? 0.25 : 0 },
    grid: gridFromItems('r', ['A', 'B', 'C'].map((id) => ({
      id, kind: 'cabinet', width: null, face: { type: 'door' },
    }))),
  });

  it('anchor 1: preserves the Euro box and adds the stone overlap only to B', () => {
    const run = overlapRun();
    const before = structuredClone(run);
    expect(columnOverlaps(run)).toEqual(new Map([['B', { value: 1, segmentId: 's' }]]));
    expect(columnSteps(run).size).toBe(0);
    expect(splitRun(run, settings).pieces[1]).toMatchObject({ id: 'B', z: 4, height: 30.5 });
    const faces = facesFor(run);
    expect(faces.get('B').reveals).toMatchObject({
      values: { top: 1.25 }, sources: { top: 'rule:top-overlap' },
    });
    expect(faces.get('A').reveals.values.top).toBe(0.25);
    expect(run).toEqual(before);
    expect(columnOverlaps(makeRun()).size).toBe(0);
    expect(columnOverlaps({ ...run, top: 'none' }).size).toBe(0);
    expect(columnOverlaps({ ...run, topSegments: [{ ...overlap, from: 'gone' }] }).size).toBe(0);
    expect(columnOverlaps({ ...run, topSegments: [overlap, { ...overlap, id: 'later', from: 'A' }] }))
      .toEqual(new Map([['B', { value: 1, segmentId: 's' }]]));
  });

  it('anchor 2: adds the overlap to the segment wood reveal', () => {
    const run = makeRun([{ ...overlap, kind: 'wood' }]);
    expect(facesFor(run).get('B').reveals).toMatchObject({
      values: { top: 1.125 }, sources: { top: 'rule:top-overlap' },
    });
  });

  it('anchor 3: keeps a manual top reveal above the overlap rule', () => {
    const run = overlapRun();
    run.grid = updateRootItem(run.grid, 'B', { reveals: { top: 0.5 } });
    expect(facesFor(run).get('B').reveals).toMatchObject({
      values: { top: 0.5 }, sources: { top: 'manual' },
    });
  });

  it('anchor 4: adds the overlap to the plain inset rail and lowers the opening top to 32', () => {
    const layout = facesFor(insetRun(14)).get('B');
    expect(layout.reveals).toMatchObject({ values: { top: 2.5 }, sources: { top: 'rule:top-overlap' } });
    expect(layout.openings[0]).toMatchObject({ x: 31, width: 28 });
    expect(layout.openings[0].z + layout.openings[0].height).toBe(32);
  });

  it('anchor 5: includes the quarter-inch bead in the overlap reveal', () => {
    expect(facesFor(insetRun(15)).get('B').reveals).toMatchObject({
      values: { top: 2.75 }, sources: { top: 'rule:top-overlap' },
    });
  });

  it('anchor 6: applies overlap only to the top drawer of a nested drawer-over-door column', () => {
    const run = overlapRun();
    run.grid.cells[1].node = {
      id: 'B', cols: [{ id: 'B:c', size: null, sizeMode: 'auto' }],
      rows: [{ id: 'upper', size: 6, sizeMode: 'manual' }, { id: 'lower', size: null, sizeMode: 'auto' }],
      cells: ['B-drawer', 'B-door'].map((id, row) => ({
        col: 0, row, colSpan: 1, rowSpan: 1,
        node: { id, kind: 'cabinet', face: { type: row === 0 ? 'drawer_front' : 'door' } },
      })),
    };
    const faces = facesFor(run);
    expect(faces.get('B-drawer').box).toMatchObject({ z: 28.5, height: 6 });
    expect(faces.get('B-drawer').reveals).toMatchObject({
      values: { top: 1.25 }, sources: { top: 'rule:top-overlap' },
    });
    expect(faces.get('B-door').box).toMatchObject({ z: 4, height: 24.5 });
    expect(faces.get('B-door').reveals).toMatchObject({
      values: { top: 0.125 }, sources: { top: 'rule:stacked-seam' },
    });
  });
});
