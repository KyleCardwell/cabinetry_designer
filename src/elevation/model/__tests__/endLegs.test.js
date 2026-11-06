import { describe, expect, it } from 'vitest';
import { endFit, endLegList, endPieceType, isEndLegs, isLeg, isLegList, runLegList } from '../index.js';
import { flipRunsForWall } from '../room.js';
import { isRoom } from '../../store/documentValidation.js';
import { room, run, wall } from '../../../test/builders.js';

const S = { shapeId: 'leg', height: 'full', x: 0, y: 0 };
const Sf = { ...S, y: 0.5 };
const E = { legs: 'both', front: Sf, back: S };
const R = run({ x: 10, width: 36,
  ends: { left: { type: 'none' }, right: { type: 'none' } } });
const R4 = { ...R, endLegs: { left: E, right: E } };
const L = { id: 'hand-leg', ...S, from: 'left', yFrom: 'front' };

describe('SH7.5 step a run end legs data', () => {
  it('anchor 1: derives four legs in corner order with default mirrors and no fills', () => {
    const before = structuredClone(R4);
    expect(endLegList(R4)).toEqual([
      { id: `${R.id}:endleg:left-front`, ...Sf, from: 'left', yFrom: 'front',
        mirror: true, end: { side: 'left', edge: 'front' } },
      { id: `${R.id}:endleg:left-back`, ...S, from: 'left', yFrom: 'back',
        mirror: true, mirrorDepth: true, end: { side: 'left', edge: 'back' } },
      { id: `${R.id}:endleg:right-front`, ...Sf, from: 'right', yFrom: 'front',
        end: { side: 'right', edge: 'front' } },
      { id: `${R.id}:endleg:right-back`, ...S, from: 'right', yFrom: 'back',
        mirrorDepth: true, end: { side: 'right', edge: 'back' } },
    ]);
    expect(R4).toEqual(before);
  });

  it('anchor 2: spec mirrors toggle side and edge defaults, omitting false keys', () => {
    const endLegs = Object.fromEntries(['left', 'right'].map((side) => [side, {
      ...E, front: { ...Sf, mirror: true, mirrorDepth: true },
      back: { ...S, mirrorDepth: true },
    }]));
    const legs = endLegList({ ...R4, endLegs });
    expect(legs[0]).not.toHaveProperty('mirror');
    expect(legs[2].mirror).toBe(true);
    expect(legs[0].mirrorDepth).toBe(true);
    expect(legs[2].mirrorDepth).toBe(true);
    expect(legs[1]).not.toHaveProperty('mirrorDepth');
    expect(legs[3]).not.toHaveProperty('mirrorDepth');
  });

  it('anchor 3: puts hand legs last and derives a single front leg', () => {
    const legs = runLegList({ ...R4, legs: [L] });
    expect(legs).toEqual([...endLegList(R4), L]);
    expect(legs).toHaveLength(5);
    expect(legs[4]).toBe(L);
    expect(endLegList({ ...R, endLegs: { left: { legs: 'front', front: Sf } } }))
      .toEqual([endLegList(R4)[0]]);
    expect(runLegList(R)).toEqual([]);
    expect(runLegList({ ...R, legs: [L] })).toEqual([L]);
  });

  it('anchor 4: activates between only with end None and fills only the front leg', () => {
    const pick = { ...R4, endLegs: { ...R4.endLegs,
      left: { ...E, fit: 'between', panel: { returns: 'both' } } } };
    const before = structuredClone(pick);
    const legs = endLegList(pick);
    expect(legs[0].fill).toEqual({ type: 'panel', returns: 'both' });
    for (const leg of legs.slice(1)) expect(leg).not.toHaveProperty('fill');
    expect(endFit(pick, 'left')).toBe('between');
    expect(endPieceType(pick, 'left')).toBe('end_panel');
    const inactive = { ...pick, ends: { ...pick.ends, left: { type: 'end_panel', width: null } } };
    expect(endLegList(inactive)[0]).not.toHaveProperty('fill');
    expect(endFit(inactive, 'left')).toBeUndefined();
    expect(endPieceType(inactive, 'left')).toBe('end_panel');
    expect(pick).toEqual(before);
    expect(endLegList({ ...R, endLegs: { left: { ...E, fit: 'between' } } })[0].fill)
      .toEqual({ type: 'panel' });
  });

  it('anchor 5: derives a filler behind the front leg while its fit is active', () => {
    const pick = { ...R, endLegs: { left: { legs: 'front', front: Sf, fit: 'behind' } } };
    expect(endLegList(pick)[0].fill).toEqual({ type: 'filler' });
    expect(endFit(pick, 'left')).toBe('behind');
    expect(endPieceType(pick, 'left')).toBe('filler');
    for (const type of ['filler', 'end_panel', 'blind']) {
      const inactive = { ...pick, ends: { ...pick.ends, left: { type, width: null } } };
      expect(endLegList(inactive)[0]).not.toHaveProperty('fill');
      expect(endFit(inactive, 'left')).toBeUndefined();
      expect(endPieceType(inactive, 'left')).toBe(type);
    }
    expect(endFit(R, 'left')).toBeUndefined();
    expect(endPieceType(R, 'left')).toBe('none');
  });

  it('anchor 6: validates exact leg presence and fit/panel combinations', () => {
    const cases = [
      [{ left: E }, true],
      [{}, false],
      [{ left: { legs: 'front', front: Sf, back: S } }, false],
      [{ left: { ...E, fit: 'behind' } }, true],
      [{ left: { legs: 'back', back: S, fit: 'behind' } }, false],
      [{ left: { legs: 'front', front: Sf, fit: 'between' } }, false],
      [{ left: { ...E, panel: { returns: 'both' } } }, false],
      [{ left: { ...E, fit: 'between', panel: { returns: 'both', returnDepth: 4 } } }, true],
    ];
    for (const [value, valid] of cases) expect(isEndLegs(value)).toBe(valid);
  });

  it('anchor 7: rejects hand-leg fields, invalid specs and unknown sides', () => {
    for (const front of [{ ...Sf, fill: { type: 'panel' } }, { ...Sf, from: 'left' },
      { ...Sf, height: 0 }, { shapeId: 'leg', square: {}, height: 'full', x: 0, y: 0 }]) {
      expect(isEndLegs({ left: { legs: 'front', front } })).toBe(false);
    }
    expect(isEndLegs({ left: E, middle: E })).toBe(false);
  });

  it('anchor 8: flips ends without changing specs and keeps the fit active', () => {
    const end = { ...E, fit: 'between' };
    const source = wall({ runs: [{ ...R, endLegs: { left: end } }] });
    const before = structuredClone(source);
    const flipped = flipRunsForWall(source);
    const pick = flipped.runs[0];
    expect(pick.endLegs).toEqual({ right: end });
    expect(pick.ends.right).toEqual({ type: 'none', width: null });
    expect(endLegList(pick)[0]).not.toHaveProperty('mirror');
    expect(endFit(pick, 'right')).toBe('between');
    expect(endLegList(pick)[0].fill).toEqual({ type: 'panel' });
    expect(flipRunsForWall(flipped).runs[0]).toEqual(source.runs[0]);
    expect(source).toEqual(before);
    const both = wall({ runs: [{ ...R4, endLegs: { left: E,
      right: { legs: 'back', back: { ...S, mirror: true } } } }] });
    expect(flipRunsForWall(both).runs[0].endLegs).toEqual({
      left: both.runs[0].endLegs.right, right: E,
    });
  });

  it('anchor 9: room validation accepts R4, rejects empty end legs and keeps the field optional', () => {
    const source = room({ walls: [wall({ runs: [R4] })], wallOrder: ['wall-1'] });
    expect(isRoom(source)).toBe(true);
    for (const endLegs of [{}, null, { left: { ...E, front: { ...Sf, height: 0 } } }]) {
      const invalid = room({ walls: [wall({ runs: [{ ...R, endLegs }] })], wallOrder: ['wall-1'] });
      expect(isRoom(invalid)).toBe(false);
    }
    expect(isRoom(room({ walls: [wall({ runs: [R] })], wallOrder: ['wall-1'] }))).toBe(true);
  });

  it('validates plain objects, square specs, required coordinates and panel settings', () => {
    const square = { square: { w: 3, d: 4 }, height: 'feet', x: -2, y: 0.5,
      sitsOn: 'base', takesRoom: false, mirror: true, mirrorDepth: true };
    expect(isEndLegs({ right: { legs: 'back', back: square } })).toBe(true);
    expect(isEndLegs({ right: { legs: 'front', front: { ...square, square: {}, height: 12,
      sitsOn: 'countertop' }, fit: 'behind' } })).toBe(true);
    for (const value of [undefined, null, [], new Date(), { left: [] }, { left: null },
      { left: { ...E, extra: true } }, { left: { ...E, legs: 'all' } },
      { left: { legs: 'front', front: Sf, back: undefined } },
      { left: { legs: 'both', front: Sf } }, { left: { ...E, fit: undefined } },
      { left: { ...E, fit: 'panel' } }]) expect(isEndLegs(value)).toBe(false);
    for (const front of [null, [], ...['id', 'yFrom', 'end', 'extra'].map((key) => ({ ...Sf, [key]: 'x' })),
      ...['height', 'x', 'y'].map((key) => ({ ...Sf, [key]: undefined })),
      { ...Sf, x: Infinity }, { ...Sf, mirror: false }, { ...Sf, takesRoom: true },
      { ...square, square: { w: 0 } }]) {
      expect(isEndLegs({ left: { legs: 'front', front } })).toBe(false);
    }
    const panel = { inset: 0.25, top: 0, bottom: 0, past: true, returns: 'both', returnDepth: 4.5 };
    expect(isEndLegs({ left: { ...E, fit: 'between', panel } })).toBe(true);
    for (const invalid of [null, [], { type: 'panel' }, { type: 'filler' }, { inset: -1 },
      { top: Infinity }, { bottom: -1 }, { past: false }, { returns: 'side' },
      { returnDepth: 4 }, { returns: 'both', returnDepth: 0 }, { extra: true }]) {
      expect(isEndLegs({ left: { ...E, fit: 'between', panel: invalid } })).toBe(false);
    }
  });

  it('preserves the per-leg validation and list uniqueness, including existing hand-leg fills', () => {
    const withFill = { ...L, fill: { type: 'panel', returns: 'both', returnDepth: 4 } };
    expect(isLeg(withFill)).toBe(true);
    expect(isLegList([withFill])).toBe(true);
    expect(isLegList([L, L])).toBe(false);
    expect(isLegList([])).toBe(false);
    expect(isLegList(new Array(1))).toBe(false);
    expect(isLeg({ ...L, fill: { type: 'filler' } })).toBe(true);
    expect(isLeg({ ...L, fill: { type: 'filler', returns: 'both' } })).toBe(false);
    expect(isLeg({ ...L, extra: true })).toBe(true);
    expect(isLeg(null)).toBe(false);
  });
});
