import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { runFaceLayouts } from '../faceLayouts.js';
import { gridFromItems, rootItems, updateRootItem } from '../grid.js';
import { columnSteps } from '../index.js';
import { syncRoom } from '../roomSync.js';
import { splitRun } from '../splitRun.js';

const manual = (value) => ({ value, source: 'manual' });
const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };

function makeRun(offsets = {}) {
  return {
    id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 90, z: 4, height: 30.5, depth: 24,
    top: 'stone', style: { cabinetStyleId: 13 },
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
    anchors: { left: false, right: false },
    grid: gridFromItems('r', ['A', 'B', 'C'].map((id) => ({
      id, kind: 'cabinet', width: 30, face: { type: 'door' }, ...(id === 'B' ? offsets : {}),
    }))),
  };
}

function makeRoom(run) {
  return {
    id: 'room', name: 'Room', profile: {}, wallOrder: ['w'],
    walls: [{ id: 'w', name: '', numberOverride: null, x1: 0, y1: 0, x2: 120, y2: 0,
      height: 96, thickness: 4.5, flipped: false, connections: { start: null, end: null },
      profile: {}, runs: [run], openings: [] }],
  };
}

function nestedRun(offsets = { top: manual(2) }) {
  const run = makeRun(offsets);
  run.grid.cells[1].node = {
    id: 'B', cols: [{ id: 'B:c', size: null, sizeMode: 'auto' }],
    rows: [{ id: 'B:top', size: 6, sizeMode: 'manual' }, { id: 'B:bottom', size: null, sizeMode: 'auto' }],
    cells: ['B-top', 'B-bottom'].map((id, row) => ({
      col: 0, row, colSpan: 1, rowSpan: 1, node: { id, kind: 'cabinet', face: { type: 'door' } },
    })),
  };
  return run;
}

const piecesOf = (run, opts) => splitRun(run, settings, opts).pieces;
const pieceB = (run, opts) => piecesOf(run, opts).find(({ id }) => id === 'B');
const pin = { anchor: 'left', from: 'left', openingId: null, openingAnchor: 'center', value: 0 };

describe('ST1 step b column steps', () => {
  it('anchor 1: drops B by 2 without changing A, C, x, widths, or the stored run', () => {
    const run = makeRun({ top: manual(2) });
    const before = structuredClone(run);
    const layout = splitRun(run, settings);
    expect(layout.pieces.map(({ id, x, z, width, height }) => ({ id, x, z, width, height }))).toEqual([
      { id: 'A', x: 0, z: 4, width: 30, height: 30.5 },
      { id: 'B', x: 30, z: 4, width: 30, height: 28.5 },
      { id: 'C', x: 60, z: 4, width: 30, height: 30.5 },
    ]);
    expect(layout.warnings).toEqual([]);
    expect(layout.errors).toEqual([]);
    expect(run).toEqual(before);
  });

  it('anchor 2: raises B bottom by 3', () => {
    expect(pieceB(makeRun({ bottom: manual(3) }))).toMatchObject({ x: 30, width: 30, z: 7, height: 27.5 });
  });

  it('anchor 3: combines B top 2 and bottom 3', () => {
    expect(pieceB(makeRun({ top: manual(2), bottom: manual(3) })))
      .toMatchObject({ x: 30, width: 30, z: 7, height: 25.5 });
  });

  it('anchor 4: keeps a manual top row at 6 and shrinks the auto bottom row to 22.5', () => {
    const run = nestedRun();
    const cells = cellPieces(run, splitRun(run, settings));
    expect(cells.pieces.find(({ id }) => id === 'B-top')).toMatchObject({ z: 26.5, height: 6 });
    expect(cells.pieces.find(({ id }) => id === 'B-bottom')).toMatchObject({ z: 4, height: 22.5 });
    expect(cells.pieces).toHaveLength(4);
    expect(cells.warnings).toEqual([]);
  });

  it('anchor 5: ignores a top drop of 29.75 and warns on B', () => {
    const layout = splitRun(makeRun({ top: manual(29.75) }), settings);
    expect(layout.pieces[1]).toMatchObject({ z: 4, height: 30.5 });
    expect(layout.warnings).toEqual([{
      code: 'column-step-too-big', pieceId: 'B',
      message: 'Top drop and bottom up leave less than 1 inch of box.',
    }]);
    expect(layout.errors).toEqual([]);
  });

  it('anchor 6: keeps the stone-top reveal at 0.25 on B and A', () => {
    const run = makeRun({ top: manual(2) });
    const room = makeRoom(run);
    const faces = runFaceLayouts(room, room.walls[0], run, settings);
    for (const id of ['A', 'B']) {
      expect(faces.get(id).reveals.values.top).toBe(0.25);
      expect(faces.get(id).reveals.sources.top).toBe('rule:stone-top');
    }
    expect(faces.get('B').box).toMatchObject({ z: 4, height: 28.5 });
  });

  it('anchor 7: leaves the step empty and derives no inside ends through syncRoom', () => {
    const room = syncRoom(makeRoom(makeRun({ top: manual(2) })), settings);
    const run = room.walls[0].runs[0];
    expect(run).not.toHaveProperty('_insideEnds');
    expect(cellPieces(run, splitRun(run, settings)).pieces.map(({ id, kind }) => ({ id, kind })))
      .toEqual(['A', 'B', 'C'].map((id) => ({ id, kind: 'cabinet' })));
    expect(pieceB(run)).toMatchObject({ z: 4, height: 28.5 });
    expect(syncRoom(room, settings)).toEqual(room);
  });

  it('anchor 8: drops B on the pinned path with A pinned', () => {
    const run = makeRun({ top: manual(2) });
    run.grid = updateRootItem(run.grid, 'A', { pin });
    const layout = splitRun(run, settings, { pinTargets: { A: 0 } });
    expect(layout.pieces[1]).toMatchObject({ id: 'B', x: 30, width: 30, z: 4, height: 28.5 });
    expect(layout.warnings).toEqual([]);
    expect(layout.errors).toEqual([]);
  });

  it('resolves only finite positive manual offsets on cabinet and nested-grid columns, including legacy items', () => {
    const run = nestedRun({ top: manual(2), bottom: manual(3) });
    expect(columnSteps(run)).toEqual(new Map([['B', { top: manual(2), bottom: manual(3) }]]));
    const { grid, ...legacy } = run;
    const items = rootItems(grid);
    expect(columnSteps({ ...legacy, items })).toEqual(columnSteps(run));
    expect(pieceB({ ...legacy, items })).toMatchObject({ z: 7, height: 25.5 });
    for (const kind of ['panel', 'void', 'shelves', 'filler']) {
      const other = makeRun({ top: manual(2), bottom: manual(3) });
      other.grid.cells[1].node.kind = kind;
      expect(columnSteps(other)).toEqual(new Map());
      expect(pieceB(other)).toMatchObject({ z: 4, height: 30.5 });
    }
    for (const offset of [undefined, null, manual(0), manual(-1), manual(NaN), manual(Infinity), manual('2'),
      { value: 2, source: 'segment' }, { value: 2 }, { value: 2, source: 'other' }]) {
      expect(columnSteps(makeRun({ top: offset, bottom: offset }))).toEqual(new Map());
    }
  });

  it('accepts exactly one inch and rejects a combined excess once on either layout path', () => {
    for (const pinned of [false, true]) {
      for (const bottom of [26.5, 26.75]) {
        const run = makeRun({ top: manual(3), bottom: manual(bottom) });
        if (pinned) run.grid = updateRootItem(run.grid, 'B', { pin });
        const layout = splitRun(run, settings, pinned ? { pinTargets: { B: 30 } } : undefined);
        const piece = layout.pieces.find(({ id }) => id === 'B');
        expect(piece).toMatchObject(bottom === 26.5 ? { z: 30.5, height: 1 } : { z: 4, height: 30.5 });
        expect(layout.warnings.map(({ code, pieceId }) => ({ code, pieceId })))
          .toEqual(bottom === 26.5 ? [] : [{ code: 'column-step-too-big', pieceId: 'B' }]);
      }
    }
  });

  it('uses the stepped column edges for reveals on the highest and lowest nested cabinets', () => {
    const run = nestedRun({ top: manual(2), bottom: manual(3) });
    run.bottom = [{ id: 'rail', kind: 'light_rail', height: 2, doors: 'flush' }];
    const room = makeRoom(run);
    const faces = runFaceLayouts(room, room.walls[0], run, settings);
    expect(faces.get('B-top').reveals.sources).toMatchObject({ top: 'rule:stone-top', bottom: 'rule:stacked-seam' });
    expect(faces.get('B-top').reveals.values.top).toBe(0.25);
    expect(faces.get('B-bottom').reveals.sources).toMatchObject({ top: 'rule:stacked-seam', bottom: 'rule:below-run' });
    expect(faces.get('B-bottom').reveals.values.bottom).toBe(settings.belowRunFlushReveal);
  });

  it('applies offsets once to pinned, outer-segment, and interior-segment pieces', () => {
    for (const pinnedIds of [['B'], ['A', 'C']]) {
      const run = makeRun();
      const targets = {};
      for (const [index, id] of ['A', 'B', 'C'].entries()) {
        run.grid = updateRootItem(run.grid, id, {
          top: manual(2), bottom: manual(3), ...(pinnedIds.includes(id) ? { pin } : {}),
        });
        if (pinnedIds.includes(id)) targets[id] = index * 30;
      }
      expect(piecesOf(run, { pinTargets: targets }).map(({ id, x, z, width, height }) => ({ id, x, z, width, height })))
        .toEqual(['A', 'B', 'C'].map((id, index) => ({ id, x: index * 30, z: 7, width: 30, height: 25.5 })));
    }
  });
});
