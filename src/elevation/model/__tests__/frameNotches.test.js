import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { frameMembers, frameRegions, regionOpenings } from '../frames.js';
import { gridFromItems, updateRootItem } from '../grid.js';

const S = { ...DEFAULT_SETTINGS, runFlex: 0 };
const manual = (value) => ({ value, source: 'manual' });
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });
const makeRun = (offsets = {}) => ({
  id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 90, z: 4, height: 30.5, depth: 24,
  style: { cabinetStyleId: 14 }, seamGap: 0, _frame: { thickness: 0.8125, drop: 0, bead: 0 },
  ends: { left: { type: 'none' }, right: { type: 'none' } },
  autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
  anchors: { left: false, right: false },
  grid: gridFromItems('r', ['A', 'B', 'C'].map((id) => ({
    id, kind: 'cabinet', width: null, face: { type: 'door' }, ...(id === 'B' ? offsets : {}),
  }))),
});

function framed(run, suppliedFaces) {
  const wall = { id: 'w', x1: 0, y1: 0, x2: 120, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [] };
  const room = { id: 'room', profile: {}, walls: [wall], wallOrder: ['w'] };
  const layout = layoutRun(room, wall, run, S);
  const cells = cellPieces(run, layout);
  const frames = frameRegions(room, run, cells, S, suppliedFaces);
  const region = frames.regions[0];
  const faces = runFaceLayouts(room, wall, run, S, layout);
  return { frames, region, faces, cells, members: frameMembers(region, regionOpenings(region, faces)) };
}

const topNotch = { columnId: 'B', edge: 'top', x: 31, z: 32.5, width: 28, height: 2 };

describe('ST2 step a notched frame regions', () => {
  it('works from a plain run layout with no gaps (the properties panel passes one)', () => {
    const run = makeRun({ top: manual(2) });
    const wall = { id: 'w', x1: 0, y1: 0, x2: 120, y2: 0, height: 96, thickness: 4.5,
      flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [] };
    const room = { id: 'room', profile: {}, walls: [wall], wallOrder: ['w'] };
    const layout = layoutRun(room, wall, run, S);
    expect(layout.gaps).toBeUndefined();
    const frames = frameRegions(room, run, layout, S);
    expect(frames.regions[0].notches).toEqual([topNotch]);
  });

  it('anchor 1: cuts the lowered B opening span from one unchanged bounding rectangle without warning', () => {
    const run = makeRun({ top: manual(2) });
    const before = structuredClone(run);
    const { frames, region, cells } = framed(run);
    expect(frames.regions).toHaveLength(1);
    expect(region).toMatchObject({ x: 0, z: 4, width: 90, height: 30.5, notches: [topNotch] });
    expect(cells.pieces.map(({ x, width }) => [x, x + width])).toEqual([
      [0.75, 30.25], [30.25, 59.75], [59.75, 89.25],
    ]);
    expect(frames.warnings).toEqual([]);
    expect(run).toEqual(before);
    expect(framed(makeRun()).region).not.toHaveProperty('notches');
  });

  it('anchor 2: keeps four full-height stiles and lowers only B top rail, leaving the notch empty', () => {
    const { members } = framed(makeRun({ top: manual(2) }));
    expect(members.filter(({ kind }) => kind === 'stile')).toEqual(
      [0, 29.5, 59, 88.5].map((x) => ({ kind: 'stile', x, z: 4, width: 1.5, height: 30.5 })),
    );
    expect(members.filter(({ kind }) => kind === 'rail')).toEqual([
      { kind: 'rail', x: 1.5, z: 4, width: 28, height: 1.5 },
      { kind: 'rail', x: 1.5, z: 33, width: 28, height: 1.5 },
      { kind: 'rail', x: 31, z: 4, width: 28, height: 1.5 },
      { kind: 'rail', x: 31, z: 31, width: 28, height: 1.5 },
      { kind: 'rail', x: 60.5, z: 4, width: 28, height: 1.5 },
      { kind: 'rail', x: 60.5, z: 33, width: 28, height: 1.5 },
    ]);
    expect(members.some((m) => m.x < 59 && m.x + m.width > 31 && m.z + m.height > 32.5)).toBe(false);
  });

  it('anchor 3: raises B bottom rail above its three-inch bottom notch', () => {
    const { region, members, frames } = framed(makeRun({ bottom: manual(3) }));
    expect(region.notches).toEqual([{ columnId: 'B', edge: 'bottom', x: 31, z: 4, width: 28, height: 3 }]);
    expect(members).toContainEqual({ kind: 'rail', x: 31, z: 7, width: 28, height: 1.5 });
    expect(frames.warnings).toEqual([]);
  });

  it('anchor 4: still warns for an unstepped nested void between unequal-height framed cabinets', () => {
    const run = makeRun();
    run.grid.cells[1].node = {
      id: 'B', cols: [{ id: 'B:c', size: null, sizeMode: 'auto' }],
      rows: [{ id: 'B:t', size: 10, sizeMode: 'manual' }, { id: 'B:v', size: 5, sizeMode: 'manual' },
        { id: 'B:b', size: null, sizeMode: 'auto' }],
      cells: [cell(0, 0, { id: 'B-top', kind: 'cabinet' }), cell(0, 1, { id: 'void', kind: 'void' }),
        cell(0, 2, { id: 'B-bottom', kind: 'cabinet' })],
    };
    const { frames, region } = framed(run);
    expect(region).not.toHaveProperty('notches');
    expect(frames.warnings.map(({ code }) => code)).toEqual(['frame-not-rectangle']);
    run.grid = updateRootItem(run.grid, 'B', { top: manual(2) });
    expect(framed(run).frames.warnings.map(({ code }) => code)).toEqual(['frame-not-rectangle']);
  });

  it('uses root ids and all nested openings, sorting top before bottom and then by x', () => {
    const run = makeRun({ top: manual(2), bottom: manual(3) });
    run.grid.cells[1].node = {
      id: 'B',
      cols: [{ id: 'B:c', size: null, sizeMode: 'auto' }],
      rows: [{ id: 'B:t', size: 6, sizeMode: 'manual' }, { id: 'B:b', size: null, sizeMode: 'auto' }],
      cells: [cell(0, 0, { id: 'B-top', kind: 'cabinet', reveals: { left: 2 } }),
        cell(0, 1, { id: 'B-bottom', kind: 'cabinet', reveals: { right: 2 } })],
    };
    run.grid = updateRootItem(run.grid, 'A', { top: manual(1), bottom: manual(1) });
    const { region, frames } = framed(run);
    expect(region.notches).toEqual([
      { columnId: 'A', edge: 'top', x: 1.5, z: 33.5, width: 28, height: 1 },
      topNotch,
      { columnId: 'A', edge: 'bottom', x: 1.5, z: 4, width: 28, height: 1 },
      { columnId: 'B', edge: 'bottom', x: 31, z: 4, width: 28, height: 3 },
    ]);
    expect(frames.warnings).toEqual([]);

    const beaded = { ...makeRun({ top: manual(2) }),
      style: { cabinetStyleId: 15, beadWidth: 0.125 }, seamGap: 0.25,
      _frame: { thickness: 0.8125, drop: 0, bead: 0.125 } };
    const { region: beadRegion, faces } = framed(beaded);
    const [opening] = faces.get('B').openings;
    expect(beadRegion.notches).toEqual([{ columnId: 'B', edge: 'top',
      x: opening.x, z: 32.5, width: opening.width, height: 2 }]);
  });

  it('subtracts the upper frame drop from each raised column bottom', () => {
    const run = { ...makeRun({ bottom: manual(3) }), cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30 };
    const { region, frames, members } = framed(run);
    expect(region).toMatchObject({ z: 53.25, height: 30.75 });
    expect(region.notches).toEqual([{ columnId: 'B', edge: 'bottom', x: 31, z: 53.25, width: 28, height: 3 }]);
    expect(members).toContainEqual({ kind: 'rail', x: 31, z: 56.25, width: 28, height: 1.5 });
    expect(frames.warnings).toEqual([]);
  });

  it('falls back to the box span, narrowed only beside framed boxes, when a column has no openings', () => {
    const run = makeRun({ top: manual(2) });
    run.grid = updateRootItem(run.grid, 'A', { top: manual(1) });
    const { region, frames } = framed(run, new Map());
    expect(region.notches).toEqual([
      { columnId: 'A', edge: 'top', x: 0.75, z: 33.5, width: 28.75, height: 1 },
      { columnId: 'B', edge: 'top', x: 31, z: 32.5, width: 28, height: 2 },
    ]);
    expect(frames.warnings).toEqual([]);
  });
});
