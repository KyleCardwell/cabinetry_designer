import { describe, expect, it } from 'vitest';
import { findLeaf } from '../../elevation/model/cellTree.js';
import { notchedFrameRoom, notchedFrameSettings } from '../../elevation/model/__tests__/fixtures/notchedFrame.js';
import { room8Upper, settings } from '../../elevation/model/__tests__/helpers/room8Upper.js';
import { gridFromItems, rootItems } from '../../elevation/model/grid.js';
import { syncRoom } from '../../elevation/model/roomSync.js';
import { frameStepReturnNotes } from '../frameNotes.js';
import { shippingList } from '../shippingList.js';

const frameRows = (room) => shippingList(room, settings).rows.filter(({ kind }) => kind === 'frame');

describe('IE1 step f frame return notes', () => {
  it('puts Room 8 default and typed returns on each cabinet region frame only', () => {
    for (const [width, expected] of [[undefined, '6"'], [4, '4"'], [4.375, '4 3/8"']]) {
      const { room, scene } = room8Upper((run, source) => {
        source.style = { cabinetStyleId: 14 };
        findLeaf(run.grid, 'a').insideEnds = { right: { type: 'return', width } };
        findLeaf(run.grid, 'c').insideEnds = { left: { type: 'return' } };
      });
      const before = structuredClone(room);
      const frames = frameRows(room);
      expect(frames.map(({ key }) => key)).toEqual(['frame:a', 'frame:c']);
      expect(frames[0].notes.at(-1)).toBe(`${expected} right return`);
      expect(frames[1].notes.at(-1)).toBe('6" left return');
      const rows = shippingList(room, settings).rows;
      expect(rows.filter(({ kind }) => kind !== 'frame')
        .flatMap(({ notes }) => notes).some((note) => note.includes('return'))).toBe(false);
      expect(scene.cells.pieces.some(({ inside }) => inside)).toBe(false);
      expect(room).toEqual(before);
    }
  });

  it('prints two returns left first after stile and rail notes, including nested leaves', () => {
    for (const nested of [false, true]) {
      const { room } = room8Upper((run, source) => {
        source.style = { cabinetStyleId: 15 };
        if (!nested) run.grid = gridFromItems('r', ['a', 'b', 'c'].map((id) => ({
          id, kind: 'cabinet', width: null, face: { type: 'door', size: null },
        })));
        findLeaf(run.grid, 'a').kind = 'void';
        findLeaf(run.grid, 'c').kind = 'void';
        const leaf = findLeaf(run.grid, 'b');
        Object.assign(leaf, { kind: 'cabinet', depth: 24,
          insideEnds: { right: { type: 'return', width: 4 }, left: { type: 'return' } } });
      });
      expect(frameRows(room)).toHaveLength(1);
      const notes = frameRows(room)[0].notes;
      expect(notes[0]).toMatch(/^beaded face frame/);
      expect(notes.slice(-2)).toEqual(['6" left return', '4" right return']);
    }
  });

  it('ignores closed-side and Euro returns as well as None and auto choices', () => {
    for (const cabinetStyleId of [13, 14]) {
      for (const choice of [undefined, 'none', { type: 'return' }]) {
        const { room } = room8Upper((run, source) => {
          source.style = { cabinetStyleId };
          findLeaf(run.grid, 'a').insideEnds = {
            left: { type: 'return', width: 9 }, right: choice,
          };
          findLeaf(run.grid, 'c').insideEnds = { right: { type: 'return', width: 8 } };
          if (choice?.type === 'return') findLeaf(run.grid, 'n5').kind = 'cabinet';
        });
        expect(shippingList(room, settings).rows.flatMap(({ notes }) => notes)
          .some((note) => note.includes('return'))).toBe(false);
      }
    }
  });
});

describe('ST3 step c frame step return notes', () => {
  const stepFrameNotes = (room) => shippingList(syncRoom(room, notchedFrameSettings), notchedFrameSettings)
    .rows.filter(({ kind }) => kind === 'frame').map(({ notes }) => notes);

  it('anchors 1 and 2: prints top returns after the notch, left to right, with default or custom width', () => {
    for (const width of [undefined, 4]) {
      const room = notchedFrameRoom();
      if (width) findLeaf(room.walls[0].runs[0].grid, 'A').stepEnds = { right: { type: 'return', width } };
      const before = structuredClone(room);
      expect(stepFrameNotes(room)).toEqual([[
        '2" notch @ #2',
        `${width ?? 6}" right return, 2" tall above cabinet #2`,
        '6" left return, 2" tall above cabinet #2',
      ]]);
      expect(room).toEqual(before);
    }
  });

  it('anchor 2b: mirrors the notes below the shorter cabinet for a bottom step', () => {
    expect(stepFrameNotes(notchedFrameRoom({ bottom: { value: 3, source: 'manual' } }))).toEqual([[
      '3" notch @ #2',
      '6" right return, 3" tall below cabinet #2',
      '6" left return, 3" tall below cabinet #2',
    ]]);
  });

  it('anchor 3: omits None and panel choices', () => {
    const room = notchedFrameRoom();
    const run = room.walls[0].runs[0];
    findLeaf(run.grid, 'A').stepEnds = { right: 'none' };
    findLeaf(run.grid, 'C').stepEnds = { left: { type: 'panel' } };
    expect(stepFrameNotes(room)).toEqual([['2" notch @ #2']]);
  });

  it('numbers split-column neighbours lowest first and orders top before bottom after inside returns', () => {
    const room = notchedFrameRoom({
      top: { value: 2, source: 'manual' }, bottom: { value: 3, source: 'manual' },
    });
    const run = room.walls[0].runs[0];
    run.grid = gridFromItems(run.id, [
      { id: 'V', kind: 'void', width: 6 },
      ...rootItems(run.grid),
    ]);
    run.grid.cells[2].node = {
      id: 'B', cols: [{ id: 'B:c', size: null, sizeMode: 'auto' }],
      rows: [{ id: 'B:t', size: 6, sizeMode: 'manual' }, { id: 'B:b', size: null, sizeMode: 'auto' }],
      cells: ['B-top', 'B-bottom'].map((id, row) => ({
        col: 0, row, colSpan: 1, rowSpan: 1, node: { id, kind: 'cabinet' },
      })),
    };
    findLeaf(run.grid, 'A').insideEnds = { left: { type: 'return' } };
    const notes = stepFrameNotes(room)[0];
    expect(notes.slice(-4)).toEqual([
      '6" right return, 2" tall above cabinet #2/#3',
      '6" right return, 3" tall below cabinet #2/#3',
      '6" left return, 2" tall above cabinet #2/#3',
      '6" left return, 3" tall below cabinet #2/#3',
    ]);
    expect(notes).toContain('6" left return');
    expect(notes.indexOf('6" left return')).toBeLessThan(notes.length - 4);
  });

  it('uses gap reach, filters frame ownership, sorts without mutation, and handles absent steps', () => {
    const region = { cabinetIds: ['A', 'B', 'C'] };
    const cells = { pieces: [
      { id: 'A', kind: 'cabinet', x: 0, width: 30, z: 4, height: 30.5 },
      { id: 'B', kind: 'cabinet', x: 30.25, width: 30, z: 4, height: 28.5 },
      { id: 'C', kind: 'cabinet', x: 60.5, width: 30, z: 4, height: 30.5 },
    ], gaps: [{ width: 0.25, height: 30.5 }] };
    const run = { _stepEnds: ['C', 'A', 'elsewhere'].map((leafId) => ({
      leafId, side: leafId === 'A' ? 'right' : 'left', edge: 'top', height: 2, choice: 'return',
    })) };
    const before = structuredClone({ run, cells });
    const numberOf = (id) => ({ A: 1, B: 2, C: 3 }[id]);
    expect(frameStepReturnNotes(run, region, cells, numberOf)).toEqual([
      '6" right return, 2" tall above cabinet #2', '6" left return, 2" tall above cabinet #2',
    ]);
    expect({ run, cells }).toEqual(before);
    expect(frameStepReturnNotes(run, region, { ...cells, gaps: [] }, numberOf)).toEqual([]);
    expect(frameStepReturnNotes({}, region, cells, numberOf)).toEqual([]);
    expect(frameStepReturnNotes(run, null, cells, numberOf)).toEqual([]);
  });
});
