import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { gridFromItems } from '../grid.js';
import { splitRun } from '../splitRun.js';

const S = DEFAULT_SETTINGS;
const BEADED = { thickness: 0.8125, drop: 0, bead: 0.25 };

function run(width, ends, count, extra = {}) {
  const items = Array.from({ length: count }, (_, index) => ({ id: `c${index + 1}`, kind: 'cabinet', width: null }));
  return {
    id: 'R', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width, z: 4, height: 30.5, depth: 24,
    ends: { left: { type: ends[0], width: null }, right: { type: ends[1], width: null } },
    autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
    anchors: { left: false, right: false }, grid: gridFromItems('R', items),
    _seamGap: 0.5, _frame: BEADED, ...extra,
  };
}
const JOINED_LEFT = { anchors: { left: { to: 'joint', jointId: 'J', offset: 0 }, right: false } };
const shown = ({ pieces }) => pieces.map(({ kind, x, width }) => [kind, x, width]);

describe('SPEC-38.3 face frame ends', () => {
  it('gives a beaded run equal boxes and a bead gap each end; a free end adds the overhang to its gap', () => {
    // Joined left: a bead gap each end; the boxes take the rest (SPEC-42.1), 29 1/4 each.
    expect(shown(splitRun(run(90, ['none', 'end_panel'], 3, JOINED_LEFT), S))).toEqual([
      ['cabinet', 0.25, 29.25], ['cabinet', 30, 29.25], ['cabinet', 59.75, 29.25], ['end_panel', 89.25, 0.75],
    ]);
    // Free left (None, not joined): bead + 3/4 overhang, no leftover. The box isn't narrowed.
    expect(shown(splitRun(run(90, ['none', 'end_panel'], 3), S))).toEqual([
      ['cabinet', 1, 29], ['cabinet', 30.5, 29], ['cabinet', 60, 29], ['end_panel', 89.25, 0.75],
    ]);
  });

  it('SPEC-42.1 keeps the stiles standard: the boxes take the leftover, the last one the odd sixteenth', () => {
    expect(shown(splitRun(run(65.1875, ['none', 'end_panel'], 2, JOINED_LEFT), S))).toEqual([
      ['cabinet', 0.25, 31.75], ['cabinet', 32.5, 31.6875], ['end_panel', 64.4375, 0.75],
    ]);
  });

  it('keeps a corner filler taking the leftover, with a bead gap before and after the boxes', () => {
    const wall2 = splitRun(run(59.1875, ['filler', 'end_panel'], 2), S, { endMinWidths: { left: 0.75, right: 1.5 } });
    expect(shown(wall2)).toEqual([
      ['filler', 0, 1.4375], ['cabinet', 1.6875, 28], ['cabinet', 30.1875, 28], ['end_panel', 58.4375, 0.75],
    ]);
    // Kyle's G2 base: joined to the tall on the left, corner filler on the right.
    const base = splitRun(run(65.1875, ['none', 'filler'], 2, JOINED_LEFT), S, { endMinWidths: { left: 0, right: 0.5 } });
    expect(shown(base)).toEqual([
      ['cabinet', 0.25, 31.5], ['cabinet', 32.25, 31.5], ['filler', 64, 1.1875],
    ]);
  });

  it('gives an unbeaded inset run no bead gap and a free end its overhang; the boxes take the rest', () => {
    const plain = run(60, ['none', 'end_panel'], 2, { _seamGap: 0, _frame: { ...BEADED, bead: 0 } });
    expect(shown(splitRun(plain, S))).toEqual([
      ['cabinet', 0.75, 29.25], ['cabinet', 30, 29.25], ['end_panel', 59.25, 0.75],
    ]);
  });

  it('leaves a European run as it was: sixteenths, the last box takes the remainder', () => {
    const euro = run(65.1875, ['none', 'end_panel'], 2, { _seamGap: undefined, _frame: undefined });
    expect(shown(splitRun(euro, S))).toEqual([
      ['cabinet', 0, 32.25], ['cabinet', 32.25, 32.1875], ['end_panel', 64.4375, 0.75],
    ]);
  });
});
