import { describe, expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { cellPieces } from '../cells.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { layoutFaces } from '../faceLayouts.js';
import { updateRootItem } from '../grid.js';
import { endHeightMode } from '../index.js';
import { roomParts } from '../parts.js';
import { cloneRun } from '../roomClone.js';
import { flipRunsForWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { splitRun } from '../splitRun.js';
import { endPieceBottom, resolveStyle } from '../styles.js';
import elevationReducer, { setRunEnd } from '../../store/elevationSlice.js';
import { ELEVATION_SCHEMA_VERSION, isRoom, roomFromDocument, toRoomDocument } from '../../store/persistence.js';
import { shippingList } from '../../../reports/shippingList.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };

function setup({ plain = false, flipped = false } = {}) {
  const source = run({
    width: 64.5, height: 24.5, autoCount: false, style: { cabinetStyleId: 13 },
    ends: { left: { type: 'filler', width: null }, right: { type: 'end_panel', width: 0.75 } },
    items: [auto('column')],
  });
  if (!plain) source.grid.cells[0].node = {
    id: 'column',
    cols: [{ id: 'col', size: null, sizeMode: 'auto' }],
    rows: [
      { id: 'top', size: flipped ? 10 : 4, sizeMode: 'manual' },
      { id: 'bottom', size: null, sizeMode: 'auto' },
    ],
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: flipped ? { id: 'void', kind: 'void' } : {
        id: 'drawers',
        cols: [{ id: 'd1', size: null, sizeMode: 'auto' }, { id: 'd2', size: null, sizeMode: 'auto' }],
        rows: [{ id: 'drawer-row', size: null, sizeMode: 'auto' }],
        cells: [0, 1].map((col) => ({ col, row: 0, colSpan: 1, rowSpan: 1,
          node: { id: `drawer-${col}`, kind: 'cabinet', face: { type: 'drawer_front', size: null } } })),
      } },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1,
        node: { id: 'lower', kind: flipped ? 'cabinet' : 'void' } },
    ],
  };
  return source;
}

const cellsOf = (source) => cellPieces(source, splitRun(source, settings));
const at = (cells, side = 'left') => cells.pieces.find((piece) => piece.role === `end-${side}`);
const roomOf = (source) => room({ walls: [wall({ runs: [source] })], wallOrder: ['wall-1'] });

describe('DR2 step a run end heights', () => {
  it('anchor 1: defaults the filler to the drawer span and the end panel to full height', () => {
    const source = setup();
    const before = structuredClone(source);
    const layout = splitRun(source, settings);
    const original = structuredClone(layout);
    const cells = cellPieces(source, layout);
    expect(at(cells)).toMatchObject({ z: 24.5, height: 4 });
    expect(at(cells, 'right')).toMatchObject({ z: 4, height: 24.5 });
    expect(source).toEqual(before);
    expect(layout).toEqual(original);
  });

  it('anchor 2: honors full height on the filler', () => {
    const source = setup();
    source.ends.left.height = 'full';
    expect(at(cellsOf(source))).toMatchObject({ z: 4, height: 24.5 });
  });

  it('anchor 3: matches the right end panel to the drawer span', () => {
    const source = setup();
    source.ends.right.height = 'cabinets';
    expect(at(cellsOf(source), 'right')).toMatchObject({ z: 24.5, height: 4 });
  });

  it('anchor 4: keeps a plain cabinet filler at the full cabinet height', () => {
    const source = setup({ plain: true });
    const layout = splitRun(source, settings);
    const cells = cellPieces(source, layout);
    expect(at(cells)).toMatchObject({ z: 4, height: 24.5 });
    expect(cells.pieces).toBe(layout.pieces);
  });

  it('anchor 5: follows the end column bottom up by 6, and its top drop', () => {
    const source = setup({ plain: true });
    source.grid = updateRootItem(source.grid, 'column', { bottom: { value: 6, source: 'manual' } });
    expect(at(cellsOf(source))).toMatchObject({ z: 10, height: 18.5 });
    source.grid = updateRootItem(source.grid, 'column', { top: { value: 2, source: 'manual' } });
    expect(at(cellsOf(source))).toMatchObject({ z: 10, height: 16.5 });
  });

  it('anchor 6: ignores the ten-inch void above an auto cabinet', () => {
    expect(at(cellsOf(setup({ flipped: true })))).toMatchObject({ z: 4, height: 14.5 });
  });

  it('anchor 7: clears stored height on type changes and keeps it on width edits', () => {
    const source = setup();
    source.ends.left.height = 'cabinets';
    const state = { settings, rooms: [roomOf(source)], selection: {} };
    const payload = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1', side: 'left' };
    const resized = elevationReducer(state, setRunEnd({ ...payload, end: { type: 'filler', width: 2 } }));
    expect(resized.rooms[0].walls[0].runs[0].ends.left.height).toBe('cabinets');
    const next = elevationReducer(state, setRunEnd({ ...payload, end: { type: 'end_panel', width: 0.75 } }));
    const changed = next.rooms[0].walls[0].runs[0];
    expect(changed.ends.left).not.toHaveProperty('height');
    expect(at(cellsOf(changed))).toMatchObject({ z: 4, height: 24.5 });
  });

  it('anchor 8: carries the four-inch filler through the part and shipping lists and door drop', () => {
    const resolved = syncRoom(roomOf(setup()), settings);
    const w = resolved.walls[0];
    const r = w.runs[0];
    expect(roomParts(resolved, settings).find((part) => part.key === 'run-1:left'))
      .toMatchObject({ z: 24.5, height: 4 });
    const scene = runScene(resolved, w, r, settings);
    const { drop } = endPieceBottom(r, resolveStyle(settings, resolved, r), settings);
    expect(scene.drawnPieces.find((piece) => piece.id === 'run-1:left'))
      .toMatchObject({ z: 24.5 - drop, height: 4 + drop });
    expect(shippingList(resolved, settings).rows.find((row) => row.key === 'run-1:left').size)
      .toContain(' x 4');
  });

  it('resolves defaults, ignoring height on Blind and None', () => {
    expect(endHeightMode()).toBe('full');
    expect(endHeightMode({ type: 'filler' })).toBe('cabinets');
    expect(endHeightMode({ type: 'end_panel' })).toBe('full');
    for (const type of ['blind', 'none']) {
      expect(endHeightMode({ type, height: 'cabinets' })).toBe('full');
    }
    const source = setup();
    source.ends.left = { type: 'blind', width: 3, height: 'cabinets' };
    expect(at(cellsOf(source))).toMatchObject({ z: 4, height: 24.5 });
  });

  it('uses matched end heights when checking face capture from another run', () => {
    const source = setup();
    const neighbor = run({ id: 'neighbor', x: 64.5, width: 30, height: 10, autoCount: false,
      style: { cabinetStyleId: 13 }, items: [{ ...auto('box'), face: { type: 'door', size: null } }],
      ends: { left: { type: 'none', width: null }, right: { type: 'filler', width: 2 } } });
    const w = wall({ runs: [source, neighbor] });
    const r = room({ walls: [w] });
    const reveals = () => layoutFaces(r, w, neighbor, settings, splitRun(neighbor, settings))
      .get('box').reveals.sources.left;
    expect(reveals()).toBe('rule:captured-single');
    source.ends.right.height = 'cabinets';
    expect(reveals()).not.toBe('rule:captured-single');
  });

  it('falls back for noncabinet root columns and all-void grids, without skipping to another column', () => {
    for (const kind of ['void', 'panel', 'shelves']) {
      const source = setup({ plain: true });
      source.grid.cells[0].node.kind = kind;
      expect(at(cellsOf(source))).toMatchObject({ z: 4, height: 24.5 });
    }
    const source = setup({ flipped: true });
    source.grid.cells[0].node.cells[1].node.kind = 'void';
    expect(at(cellsOf(source))).toMatchObject({ z: 4, height: 24.5 });
    const multiple = setup({ plain: true });
    multiple.grid = run({ items: [{ ...auto('open'), kind: 'void' }, auto('cabinet')] }).grid;
    multiple.grid = updateRootItem(multiple.grid, 'cabinet', { bottom: { value: 6, source: 'manual' } });
    multiple.ends.right.height = 'cabinets';
    expect(at(cellsOf(multiple))).toMatchObject({ z: 4, height: 24.5 });
    expect(at(cellsOf(multiple), 'right')).toMatchObject({ z: 10, height: 18.5 });
    multiple.grid = run({ items: [] }).grid;
    expect(at(cellsOf(multiple))).toMatchObject({ z: 4, height: 24.5 });
  });

  it('spans across a middle void using all nonvoid leaves', () => {
    const source = setup({ flipped: true });
    const grid = source.grid.cells[0].node;
    grid.rows = [{ id: 'a', size: 4 }, { id: 'b', size: 10 }, { id: 'c', size: null }];
    grid.cells = ['cabinet', 'void', 'panel'].map((kind, row) => ({
      col: 0, row, colSpan: 1, rowSpan: 1, node: { id: `leaf-${row}`, kind },
    }));
    expect(at(cellsOf(source))).toMatchObject({ z: 4, height: 24.5 });
  });

  it('validates, round-trips, clones and mirrors stored choices', () => {
    const source = setup();
    source.ends.left.height = 'full';
    source.ends.right.height = 'cabinets';
    const original = roomOf(source);
    expect(isRoom(original)).toBe(true);
    const loaded = roomFromDocument(toRoomDocument(syncRoom(original, settings)), ELEVATION_SCHEMA_VERSION, settings);
    expect(loaded.ok).toBe(true);
    expect(loaded.room.walls[0].runs[0].ends).toEqual(source.ends);
    expect(cloneRun(source).ends).toEqual(source.ends);
    const mirrored = flipRunsForWall(original.walls[0]).runs[0];
    expect(mirrored.ends).toEqual({ left: source.ends.right, right: source.ends.left });
    expect(at(cellsOf(mirrored))).toMatchObject({ z: 24.5, height: 4 });
    for (const height of [null, true, 4, '', 'auto', {}, []]) {
      source.ends.left.height = height;
      expect(isRoom(roomOf(source))).toBe(false);
    }
  });

  it('extends from the matched edge, including down to the floor', () => {
    for (const [down, z, height] of [[{ to: 'floor' }, 0, 28.5], [{ to: 'by', amount: 2 }, 22.5, 6]]) {
      const source = setup();
      source.ends.left.extend = { down };
      const w = wall({ runs: [source] });
      const scene = runScene(room({ walls: [w] }), w, source, settings);
      const { drop } = scene.endBottom;
      expect(scene.drawnPieces.find((piece) => piece.id === 'run-1:left'))
        .toMatchObject({ z: down.to === 'floor' ? z : z - drop,
          height: down.to === 'floor' ? height : height + drop });
    }
  });
});
