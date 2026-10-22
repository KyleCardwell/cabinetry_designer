import { describe, expect, it } from 'vitest';
import { findLeaf } from '../../elevation/model/cellTree.js';
import { room8Upper, settings } from '../../elevation/model/__tests__/helpers/room8Upper.js';
import { gridFromItems } from '../../elevation/model/grid.js';
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
