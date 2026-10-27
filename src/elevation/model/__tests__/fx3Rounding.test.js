import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { horizontalChains } from '../dimensions.js';
import { elevationDimensions } from '../elevationDimensions.js';
import { gridFromItems } from '../grid.js';
import { syncRoom } from '../room.js';
import { pickedMoldings } from './helpers/pickedMoldings.js';
import { runFlexNeeds, splitRun } from '../splitRun.js';

// Room 9's corner filler minimum is 2", the filler beside the tall run.
const S = { ...DEFAULT_SETTINGS, fillerMinWidth: 2 };
const FILLER = { type: 'filler', width: null };
const NONE = { type: 'none', width: null };
const PANEL = { type: 'end_panel', width: 1.5625 };
const track = (id, size = null) => ({ id, size, sizeMode: size === null ? 'auto' : 'manual' });
const leaf = (id, kind = 'cabinet') => ({ id, kind });

/** A column: a typed 4" row of drawer cells (tracks `cols`) over an auto void row (Room 9's desk). */
function deskColumn(cols = [null, null], id = 'C') {
  const drawers = {
    id: `${id}d`,
    cols: cols.map((size, index) => track(`${id}d${index}`, size)),
    rows: [track(`${id}dr`)],
    cells: cols.map((_, index) => ({ col: index, row: 0, colSpan: 1, rowSpan: 1, node: leaf(`${id}${index}`) })),
  };
  return {
    id,
    kind: 'cabinet',
    width: null,
    grid: {
      id,
      cols: [track(`${id}c`)],
      rows: [track(`${id}top`, 4), track(`${id}bottom`)],
      cells: [
        { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: drawers },
        { col: 0, row: 1, colSpan: 1, rowSpan: 1, node: leaf(`${id}v`, 'void') },
      ],
    },
  };
}

function deskRun(overrides = {}) {
  return {
    id: 'R', cabinetTypeId: 1, x: 18.8125, width: 60.1875, z: 4, height: 24.5, depth: 24,
    ends: { left: FILLER, right: PANEL },
    autoCount: false, maxCabinetWidth: null,
    items: [deskColumn()],
    heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
    ...overrides,
  };
}

const widths = (run) => splitRun(run, S).pieces.map(({ width }) => width);

describe('FX3 rounding sees nested auto columns', () => {
  it('Room 9 desk: two drawer cells over a void come out 28 each, the filler takes the rest', () => {
    expect(widths(deskRun())).toEqual([2.625, 56, 1.5625]);
  });

  it('three drawer cells step the column by 1 1/2"', () => {
    expect(widths(deskRun({ items: [deskColumn([null, null, null])] }))).toEqual([3.125, 55.5, 1.5625]);
  });

  it('a typed drawer cell leaves the auto cells to round', () => {
    expect(widths(deskRun({ items: [deskColumn([10, null, null])] }))).toEqual([2.625, 56, 1.5625]);
  });

  it('two auto columns share a width round for both', () => {
    const run = deskRun({
      width: 117 + 1.5625 + 1.5 - 0.875,
      items: [deskColumn(), { id: 'P', kind: 'cabinet', width: null }],
    });
    const [filler, a, b] = widths(run);
    expect([a, b]).toEqual([57, 57]);
    expect(filler).toBeCloseTo(run.width - 1.5625 - 114, 6);
  });

  it('run flex candidates use the column step, a tie grows', () => {
    const run = deskRun({ ends: { left: NONE, right: NONE }, width: 56.5 });
    expect(runFlexNeeds(run, S).map(({ candidates }) => candidates)).toEqual([[0.5, -0.5]]);
  });

  it('flex filler: the box is round under nested cells, a remembered unround box is not raised to', () => {
    const [need] = runFlexNeeds(deskRun(), S);
    expect(need.box).toBe(56);
    expect(need.raise(56.5)).toBeNull();
    expect(need.raise(57)).toBe(0.375);
  });

  it('a synced desk run with boxes 56.5 remembered still comes out 28 / 28', () => {
    const run = deskRun({ x: 50, flex: { left: 0, right: 0, x: 50, width: 60.1875, boxes: { run: 56.5 } } });
    const room = syncRoom({
      id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['A'],
      walls: [{
        id: 'A', name: '', numberOverride: null, x1: 0, y1: 0, x2: 300, y2: 0, height: 96, thickness: 4.5,
        flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
      }],
    }, S);
    const synced = room.walls[0].runs[0];
    expect(synced.width).toBe(60.1875);
    expect(widths(synced)).toEqual([2.625, 56, 1.5625]);
  });

  it('a column with only a row split rounds exactly as before', () => {
    const column = deskColumn();
    column.grid.cells[0].node = leaf('D');
    expect(widths(deskRun({ items: [column] }))).toEqual([2.125, 56.5, 1.5625]);
  });
});

it('no flex filler: an unround nested split still warns widths-not-rounded', () => {
  const run = deskRun({ ends: { left: NONE, right: NONE }, width: 56.5 });
  expect(splitRun(run, S).warnings.map(({ code }) => code)).toContain('widths-not-rounded');
  expect(splitRun({ ...run, width: 57 }, S).warnings.map(({ code }) => code)).not.toContain('widths-not-rounded');
});

const D = pickedMoldings(S);

function synced(run) {
  const withGrid = { ...run, grid: gridFromItems(run.id, run.items), items: undefined };
  delete withGrid.items;
  const room = syncRoom({
    id: 'room', name: 'Room', profile: { ...D.defaultProfile }, wallOrder: ['A'],
    walls: [{
      id: 'A', name: '', numberOverride: null, x1: 0, y1: 0, x2: 300, y2: 0, height: 96, thickness: 4.5,
      flipped: false, connections: { start: null, end: null }, profile: {}, runs: [withGrid], openings: [],
    }],
  }, D);
  return { room, wall: room.walls[0] };
}

const inner = ({ room, wall }) => horizontalChains(room, wall, 'lower', D).inner
  .filter((segment) => segment.runId === 'R')
  .map(({ kind, start, end, pieceId, trackId }) => [kind, start, end, pieceId ?? null, trackId ?? null]);

describe('FX3 cabinet row shows the cells of a column holding a void', () => {
  it('Room 9 desk: filler, two drawer cabinets (with their tracks), end panel', () => {
    expect(inner(synced(deskRun({ x: 50 })))).toEqual([
      ['piece', 50, 52.625, 'R:left', null],
      ['piece', 52.625, 80.625, 'C0', 'Cd0'],
      ['piece', 80.625, 108.625, 'C1', 'Cd1'],
      ['piece', 108.625, 110.1875, 'R:right', null],
    ]);
  });

  it('the DXF skips the drawers\' cell chain the cabinet row already shows, keeps the column\'s heights', () => {
    const { room, wall } = synced(deskRun({ x: 50 }));
    const cells = elevationDimensions(room, wall, 'front', D).filter((record) => record.row === 'cells');
    expect(cells.map(({ orientation, start, end }) => [orientation ?? 'horizontal', start, end])).toEqual([
      ['vertical', 4, 24.5],
      ['vertical', 24.5, 28.5],
    ]);
  });

  it('a column with no void stays one segment', () => {
    const column = deskColumn();
    column.grid.cells[1].node = leaf('Cdoor');
    expect(inner(synced(deskRun({ x: 50, items: [column] })))[1]).toEqual(['piece', 52.625, 108.625, 'C', null]);
  });

  it('a void beside a cabinet in one row: gap, inside panel, cabinet', () => {
    const column = {
      id: 'V', kind: 'cabinet', width: null,
      grid: {
        id: 'V', cols: [track('Va'), track('Vb')], rows: [track('Vr')],
        cells: [
          { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: leaf('Vv', 'void') },
          { col: 1, row: 0, colSpan: 1, rowSpan: 1, node: leaf('Vc') },
        ],
      },
    };
    const run = deskRun({ x: 50, width: 30, ends: { left: NONE, right: NONE }, items: [column] });
    // The cabinet's open side gets an inside end panel, shown as its own piece.
    expect(inner(synced(run)).map(([kind, start, end, pieceId]) => [kind, end - start, pieceId])).toEqual([
      ['gap', 14.59375, null],
      ['piece', 0.8125, expect.any(String)],
      ['piece', 14.59375, 'Vc'],
    ]);
  });

  it('a seam gap between the drawer cells is its own gap', () => {
    const run = deskRun({ x: 50, seamGap: 0.125 });
    const rows = inner(synced(run));
    expect(rows.map(([kind, start, end]) => [kind, end - start])).toEqual([
      ['piece', 2.5], ['piece', 28], ['gap', 0.125], ['piece', 28], ['piece', 1.5625],
    ]);
  });
});
