import { beforeEach, describe, expect, it } from 'vitest';
import { attach, auto, fixed, line, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun } from '../faceLayouts.js';
import { splitOptionsForRun } from '../placement.js';
import { syncRoom } from '../room.js';
import { lineSharedWidths, splitRun } from '../splitRun.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
let r;
let w;
let stored;

beforeEach(() => {
  r = run({
    width: 80, autoCount: false, anchors: { left: true, right: false },
    ends: { left: { type: 'filler', width: null }, right: { type: 'none', width: null } },
    items: [auto('A'), { ...auto('B'), attach: attach('L1', 'right') }],
  });
  w = wall({ x2: 120, lines: [line('L1', 76.5)], runs: [r] });
  stored = room({ walls: [w] });
});

function result(source = stored) {
  const synced = syncRoom(source, settings);
  const currentWall = synced.walls[0];
  const currentRun = currentWall.runs[0];
  return { synced, currentRun, ...layoutRun(synced, currentWall, currentRun, settings) };
}

function direct() {
  return splitRun(r, settings, splitOptionsForRun(stored, w, r, settings));
}

describe('LL4.1 line-attached auto columns share width', () => {
  it('anchor 1: Kyle’s two autos share 75 inches beside the minimum filler', () => {
    expect(direct().pieces).toMatchObject([
      { role: 'end-left', width: 1.5 }, { id: 'A', x: 1.5, width: 37.5 },
      { id: 'B', x: 39, width: 37.5 },
    ]);
    const actual = result();
    expect(actual.currentRun.width).toBe(76.5);
    expect(actual.pieces).toMatchObject(direct().pieces);
    expect(actual.errors).toEqual([]);
  });

  it('anchor 2: mirrors sharing to an anchored right boundary', () => {
    w.runs = [run({
      width: 120, autoCount: false, anchors: { left: false, right: true },
      ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
      items: [{ ...auto('B'), attach: attach('L1', 'left') }, auto('C'), auto('D')],
    })];
    w.lines[0].value = 39;
    expect(result().pieces).toMatchObject([
      { id: 'B', x: 39, width: 27 }, { id: 'C', width: 27 }, { id: 'D', width: 27 },
    ]);
  });

  it('anchor 3: centre attachments retain their remembered width', () => {
    r.grid.cols[1].attach.at = 'center';
    w.lines[0].value = 57.75;
    r._pinWidths = { B: 39 };
    const actual = result();
    expect(actual.pieces.find(({ id }) => id === 'B')).toMatchObject({ x: 38.25, width: 39 });
    expect(actual.currentRun._pinWidths).toEqual({ B: 39 });
  });

  it('anchor 4: a free far end retains LL4 d growth and remembered width', () => {
    r.anchors.left = false;
    r._pinWidths = { B: 39 };
    const actual = result();
    expect(actual.currentRun).toMatchObject({ x: 0, width: 76.5, _pinWidths: { B: 39 } });
    expect(actual.pieces).toMatchObject([
      { width: 1.5 }, { id: 'A', x: 1.5, width: 36 }, { id: 'B', x: 37.5, width: 39 },
    ]);
  });

  it('anchor 5: a typed or locked width stays 30', () => {
    for (const sizeMode of ['manual', 'solved']) {
      r.grid.cols[1].size = 30;
      r.grid.cols[1].sizeMode = sizeMode;
      expect(result().pieces).toMatchObject([
        { width: 1.5 }, { id: 'A', width: 45 }, { id: 'B', x: 46.5, width: 30 },
      ]);
    }
  });

  it('anchor 6: three autos each get 25 inches', () => {
    w.runs = [run({ ...r, items: [auto('A'), auto('B'), { ...auto('C'), attach: attach('L1', 'right') }] })];
    expect(result().pieces).toMatchObject([
      { width: 1.5 }, { id: 'A', width: 25 }, { id: 'B', width: 25 }, { id: 'C', x: 51.5, width: 25 },
    ]);
  });

  it('anchor 7: A absorbs the odd half inch, B stays 37½', () => {
    w.lines[0].value = 77;
    expect(result().pieces).toMatchObject([
      { width: 1.5 }, { id: 'A', x: 1.5, width: 38 }, { id: 'B', x: 39.5, width: 37.5 },
    ]);
  });

  it('anchor 8: sync is stable and stored widths agree, ignoring old remembered widths', () => {
    r._pinWidths = { B: 10 };
    const once = result();
    const twice = result(once.synced);
    expect(twice.synced).toEqual(once.synced);
    expect(once.currentRun._pinWidths).toEqual({ B: 37.5 });
    expect(twice.pieces).toEqual(once.pieces);
  });

  it('gives a marked attached absorber the odd half inch', () => {
    w.lines[0].value = 77;
    r.grid.cols[1].absorb = true;
    expect(result().pieces).toMatchObject([
      { width: 1.5 }, { id: 'A', width: 37.5 }, { id: 'B', width: 38 },
    ]);
  });

  it('keeps a three-auto remainder with the last other auto, including the later split', () => {
    w.lines[0].value = 77;
    w.runs = [run({ ...r, items: [auto('A'), auto('B'), { ...auto('C'), attach: attach('L1', 'right') }] })];
    expect(result().pieces).toMatchObject([
      { width: 1.5 }, { id: 'A', width: 25 }, { id: 'B', width: 25.5 }, { id: 'C', width: 25 },
    ]);
  });

  it('shares against the previous placed column’s right edge and gap', () => {
    w.runs = [run({
      ...r, anchors: { left: false, right: false },
      items: [{ ...fixed('P', 20), gap: 2, attach: attach('L2', 'left') },
        auto('A'), { ...auto('B'), attach: attach('L1', 'right') }],
    })];
    w.lines = [line('L2', 10), line('L1', 82)];
    expect(result().pieces.filter(({ role }) => role === 'item')).toMatchObject([
      { id: 'P', x: 10, width: 20 }, { id: 'A', x: 32, width: 25 }, { id: 'B', x: 57, width: 25 },
    ]);
  });

  it('retains both widths when two attached autos point into the same segment', () => {
    r = run({
      ...r, _pinWidths: { P: 20, B: 22 },
      items: [{ ...auto('P'), attach: attach('L2', 'left') }, auto('A'),
        { ...auto('B'), attach: attach('L1', 'right') }],
    });
    w.runs = [r];
    w.lines = [line('L2', 10), line('L1', 82)];
    expect(lineSharedWidths(r, settings, { pinTargets: { P: 10, B: 82 } })).toEqual({});
    expect(result().pieces.filter(({ role }) => role === 'item')).toMatchObject([
      { id: 'P', width: 20 }, { id: 'A', width: 30 }, { id: 'B', width: 22 },
    ]);
  });

  it('keeps return-pin widths and placement unchanged', () => {
    delete r.grid.cols[1].attach;
    r.grid.cols[1].pin = { from: 'return', anchor: 'right', edge: 'right' };
    r._pinWidths = { B: 39 };
    const opts = { pinTargets: { B: 76.5 } };
    expect(lineSharedWidths(r, settings, opts)).toEqual({});
    expect(splitRun(r, settings, opts).pieces).toMatchObject([
      { width: 1.5 }, { id: 'A', width: 36 }, { id: 'B', x: 37.5, width: 39 },
    ]);
  });

  it('mirrors the boundary at the next placed column, including a seam and odd remainder', () => {
    w.runs = [run({
      ...r, anchors: { left: false, right: false }, seamGap: 1,
      items: [{ ...auto('B'), attach: attach('L1', 'left') }, auto('C'),
        { ...fixed('P', 20), attach: attach('L2', 'left') }],
    })];
    w.lines = [line('L1', 10), line('L2', 62.5)];
    expect(result().pieces.filter(({ role }) => role === 'item')).toMatchObject([
      { id: 'B', x: 10, width: 25 }, { id: 'C', x: 36, width: 25.5 }, { id: 'P', x: 62.5, width: 20 },
    ]);
  });

  it('does not share when the bounded side has no other auto', () => {
    r.grid.cols[0].size = 20;
    expect(lineSharedWidths(r, settings, { pinTargets: { B: 76.5 } })).toEqual({});
  });

  it('retains the attached nested grid’s rounding constraints in the later split', () => {
    for (const boundedByColumn of [false, true]) {
      const nested = { ...run({ id: 'nested', items: ['N1', 'N2', 'N3', 'N4'].map(auto) }).grid, id: 'C' };
      w.runs = [run({
        ...r,
        items: [
          ...(boundedByColumn ? [{ ...fixed('P', 20), attach: attach('L2', 'left') }] : []),
          auto('A'), auto('B'), { ...auto('C'), grid: nested, attach: attach('L1', 'right') },
        ],
      })];
      w.lines = [line('L2', 1.5), line('L1', boundedByColumn ? 97 : 77)];
      expect(result().pieces.filter(({ role, id }) => role === 'item' && id !== 'P')).toMatchObject([
        { id: 'A', width: 24 }, { id: 'B', width: 27.5 }, { id: 'C', width: 24 },
      ]);
    }
  });

  it('includes seams and nested-grid rounding when sharing', () => {
    w.runs = [run({
      ...r, seamGap: 1,
      items: [auto('A'), { ...auto('B'), attach: attach('L1', 'right'),
        grid: { ...run({ id: 'nested', items: [auto('B1'), auto('B2')] }).grid, id: 'B' } }],
    })];
    w.lines[0].value = 77.5;
    const actual = result();
    expect(actual.pieces.filter(({ role }) => role === 'item')).toMatchObject([
      { id: 'A', x: 1.5, width: 38 }, { id: 'B', x: 40.5, width: 37 },
    ]);
  });
});
