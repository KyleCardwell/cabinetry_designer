import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auto, fixed, line, room, run, wall } from '../../../test/builders.js';
import { isRoom } from '../../store/documentValidation.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { runItems } from '../grid.js';
import { splitOptionsForRun } from '../placement.js';
import { syncRoom } from '../room.js';
import { splitRun, syncAutoItems } from '../splitRun.js';

const S = { ...DEFAULT_SETTINGS, runFlex: 0 };
const F = { direction: 'vertical', size: null, children: [
  { type: 'drawer_front', size: null },
  { type: 'drawer_front', size: null },
  { type: 'drawer_front', size: null },
] };
const placed = { ...fixed('c', 42), attach: { lineId: 'L1', at: 'center', offset: 0 } };
const ends = { left: { type: 'none' }, right: { type: 'none' } };

describe('auto count per segment', () => {
  it.each([
    { name: 'copies the drawer face before a typed cabinet', width: 96,
      items: [{ ...auto('a'), face: F }, fixed('f', 24)],
      ids: ['a', 'new', 'f'], widths: [36, 36, 24] },
    { name: 'adds two drawer banks before a typed cabinet', width: 120,
      items: [{ ...auto('a'), face: F }, fixed('f', 24)],
      ids: ['a', 'new', 'new', 'f'], widths: [32, 32, 32, 24] },
    { name: 'seeds the empty stretch and counts right of a placed column', width: 120,
      items: [fixed('l', 24), placed, auto('r')],
      ids: ['l', 'new', 'c', 'r', 'new'], widths: [24, 15, 42, 19.5, 19.5] },
    { name: 'leaves a gap below minimum beside a placed column', width: 120,
      items: [fixed('l', 33), placed, auto('r')],
      ids: ['l', 'c', 'r', 'new'], widths: [33, 42, 19.5, 19.5] },
    { name: 'shrinks by removing the last auto-added cabinet', width: 108,
      items: [auto('a')], ids: ['a', 'new', 'new'], widths: [36, 36, 36], shrink: 72 },
    { name: 'keeps both user cabinets above the target count', width: 30,
      items: [auto('a'), auto('u')], ids: ['a', 'u'], widths: [15, 15] },
  ])('$name (AC1)', ({ width, items, ids, widths, shrink }) => {
    const initial = run({ width, items, ends, anchors: { left: false, right: false } });
    const w = wall({ runs: [initial], lines: [line('L1', 60)] });
    const synced = syncRoom(room({ walls: [w] }), S);
    expect(isRoom(synced)).toBe(true);
    const resolvedWall = synced.walls[0];
    const resolved = resolvedWall.runs[0];
    const roots = runItems(resolved);
    const existing = new Set(items.map(({ id }) => id));
    expect(roots.map(({ id }) => existing.has(id) ? id : 'new')).toEqual(ids);
    expect(new Set(roots.map(({ id }) => id)).size).toBe(roots.length);
    const layout = splitRun(resolved, S, splitOptionsForRun(synced, resolvedWall, resolved, S));
    expect(roots.map(({ id }) => layout.pieces.find((piece) => piece.id === id).width)).toEqual(widths);
    for (const [index, item] of roots.entries()) {
      if (existing.has(item.id)) continue;
      expect(item.autoAdded).toBe(true);
      expect(resolved.grid.cols[index].autoAdded).toBe(true);
      expect(resolved.grid.cells[index].node).not.toHaveProperty('autoAdded');
      if (items[0].face) {
        expect(item.face).toEqual(F);
        expect(item.face).not.toBe(roots[0].face);
        expect(item.face.children[0]).not.toBe(roots[0].face.children[0]);
      } else {
        expect(item).toEqual({ id: item.id, kind: 'cabinet', width: null, autoAdded: true });
      }
    }
    if (shrink) {
      const smaller = syncAutoItems({ ...resolved, width: shrink }, S);
      expect(runItems(smaller).map(({ id }) => id)).toEqual(roots.slice(0, 2).map(({ id }) => id));
      expect(splitRun(smaller, S).pieces.map(({ width }) => width)).toEqual([36, 36]);
    }
    expect(syncAutoItems(resolved, S, splitOptionsForRun(synced, resolvedWall, resolved, S))).toBe(resolved);
    if (!ids.includes('new')) expect(syncAutoItems(initial, S)).toBe(initial);
  });

  it('splits the Room 8 drawer bank into matching 26 1/2-inch cabinets (AC1)', () => {
    const source = JSON.parse(readFileSync(new URL('./fixtures/room8cc.json', import.meta.url), 'utf8'));
    const sourceWall = source.walls.find(({ name }) => name === 'Wall 3');
    const base = sourceWall.runs.find(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.BASE);
    base.autoCount = true;
    const original = runItems(base).find((item) => item.width === null);
    const synced = syncRoom(source, S);
    const resolvedWall = synced.walls.find(({ id }) => id === sourceWall.id);
    const resolved = resolvedWall.runs.find(({ id }) => id === base.id);
    const banks = runItems(resolved).filter((item) => item.width === null);
    expect(banks).toHaveLength(2);
    expect(banks.map(({ face }) => face)).toEqual([original.face, original.face]);
    expect(banks[1].autoAdded).toBe(true);
    expect(banks[1].face).not.toBe(banks[0].face);
    expect(banks[1]).not.toHaveProperty('insideEnds');
    const layout = splitRun(resolved, S, splitOptionsForRun(synced, resolvedWall, resolved, S));
    expect(banks.map(({ id }) => layout.pieces.find((piece) => piece.id === id).width)).toEqual([26.5, 26.5]);
  });
});
