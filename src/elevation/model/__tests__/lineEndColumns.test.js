import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { attach, auto, line, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun } from '../faceLayouts.js';
import { resolveWall, syncRoom } from '../room.js';
import { lineEndColumns } from '../runPins.js';

// LL4.1 b: a cabinet on a line at a free run end sets that run edge (line + end piece); the run then lays
// out by the normal rules, as if its width were typed. Inside a run, the odd amount goes to the filler.

const K = JSON.parse(readFileSync(new URL('./fixtures/room10c.json', import.meta.url), 'utf8'));
const WALL2 = '2641fa48-3200-43ec-8a5f-ab8e6a514e00';
const A = '0e14e4ca-d2a8-4817-87eb-34e22fbb100a';
const B = '5ea196ac-4752-42e5-bf15-608401c0c086';
const kyle = { ...DEFAULT_SETTINGS, cornerFillerMinWidth: 2, roundTo: 0.5 };

function layout(stored, settings) {
  const synced = syncRoom(stored, settings);
  const wall = synced.walls.find(({ id }) => id === WALL2) ?? synced.walls[0];
  const view = resolveWall(synced, wall, 'front');
  const current = view.runs[0];
  const result = layoutRun(synced, view, current, settings);
  return { synced, run: current, pieces: result.pieces.map(({ id, kind, x, width }) => ({ id, kind, x, width })), result };
}

function withoutLine(stored) {
  const copy = structuredClone(stored);
  const target = copy.walls.find(({ id }) => id === WALL2);
  delete target.runs[0].grid.cols[1].attach;
  target.lines = [];
  return copy;
}

const piece = (pieces, id) => pieces.find((candidate) => candidate.id === id);

describe('LL4.1 b end columns follow the normal run rules', () => {
  it('b1. Kyle\'s Room 10 at 1/2" rounding: filler 2 1/2, two 37" cabinets, same as without the line', () => {
    const { run: laid, pieces } = layout(K, kyle);
    expect(pieces[0]).toMatchObject({ kind: 'filler', x: 0, width: 2.5 });
    expect(piece(pieces, A)).toMatchObject({ x: 2.5, width: 37 });
    expect(piece(pieces, B)).toMatchObject({ x: 39.5, width: 37 });
    expect(pieces.at(-1)).toMatchObject({ kind: 'end_panel', x: 76.5 });
    expect(laid).toMatchObject({ x: 0, width: 77 + 5 / 16 });
    expect(pieces).toEqual(layout(withoutLine(K), kyle).pieces);
  });

  it('b2. at 1/4" rounding both cabinets are 37 1/4 and B ends on the line', () => {
    const { pieces } = layout(K, { ...kyle, roundTo: 0.25 });
    expect(pieces[0]).toMatchObject({ width: 2 });
    expect(piece(pieces, A).width).toBe(37.25);
    expect(piece(pieces, B)).toMatchObject({ width: 37.25 });
    expect(piece(pieces, B).x + piece(pieces, B).width).toBe(76.5);
  });

  it('b3. a 3/4 end panel shortens the run; the cabinets and the line edge stay', () => {
    const copy = structuredClone(K);
    copy.walls.find(({ id }) => id === WALL2).runs[0].ends.right = { type: 'end_panel', width: 0.75 };
    const { run: laid, pieces } = layout(copy, kyle);
    expect(laid.width).toBe(77.25);
    expect(pieces.slice(0, 3)).toEqual(layout(K, kyle).pieces.slice(0, 3));
    expect(piece(pieces, B).x + piece(pieces, B).width).toBe(76.5);
  });

  it('b4. run flex never moves the end the line sets', () => {
    for (const runFlex of [0.25, 0]) {
      const { run: laid, pieces } = layout(K, { ...kyle, runFlex });
      expect(laid.x + laid.width).toBe(77 + 5 / 16);
      expect(pieces).toEqual(layout(K, kyle).pieces);
    }
  });

  const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
  const build = ({ items, ends, value, anchors = { left: true, right: false } }) => room({ walls: [wall({
    x2: 120, lines: [line('L1', value)],
    runs: [run({ width: 80, autoCount: false, anchors, ends, items })],
  })] });
  const filler = { type: 'filler', width: null };
  const none = { type: 'none', width: null };

  it('b7. inside the run the odd half inch goes to the share side\'s filler', () => {
    const stored = build({
      value: 77, ends: { left: filler, right: none },
      items: [auto('A'), { ...auto('B'), attach: attach('L1', 'right') }, auto('C')],
    });
    const { run: laid, pieces } = layout(stored, settings);
    expect(pieces[0]).toMatchObject({ kind: 'filler', width: 2 });
    expect(piece(pieces, 'A').width).toBe(37.5);
    expect(piece(pieces, 'B')).toMatchObject({ x: 39.5, width: 37.5 });
    expect(laid._pinWidths).toEqual({ B: 37.5 });
    const twice = syncRoom(layout(stored, settings).synced, settings);
    expect(twice).toEqual(layout(stored, settings).synced);
  });

  it('b8. with no filler A absorbs, never B', () => {
    const { pieces } = layout(build({
      value: 76.75, ends: { left: none, right: none },
      items: [auto('A'), { ...auto('B'), attach: attach('L1', 'right') }, auto('C')],
    }), settings);
    expect(piece(pieces, 'A').width).toBe(38.75);
    expect(piece(pieces, 'B').width).toBe(38);
  });

  it('b9. synced twice equals once; an end column keeps no remembered width', () => {
    const once = layout(K, kyle).synced;
    expect(syncRoom(once, kyle)).toEqual(once);
    expect(once.walls.find(({ id }) => id === WALL2).runs[0]._pinWidths).toBeUndefined();
  });

  it('b10. lineEndColumns: right end, inside, left end', () => {
    const at = (stored, s) => {
      const synced = syncRoom(stored, s);
      const w = synced.walls.find(({ id }) => id === WALL2) ?? synced.walls[0];
      const r = w.runs[0];
      const targets = Object.fromEntries(r.grid.cols.filter((col) => col.attach).map((col) => [col.id.replace(':col', ''), 1]));
      return lineEndColumns(r, targets);
    };
    expect(at(K, kyle)).toEqual({ right: B });
    expect(at(build({
      value: 77, ends: { left: filler, right: none },
      items: [auto('A'), { ...auto('B'), attach: attach('L1', 'right') }, auto('C')],
    }), settings)).toEqual({});
    expect(at(build({
      value: 39, ends: { left: none, right: none }, anchors: { left: false, right: true },
      items: [{ ...auto('B'), attach: attach('L1', 'left') }, auto('C'), auto('D')],
    }), settings)).toEqual({ left: 'B' });
  });
});
