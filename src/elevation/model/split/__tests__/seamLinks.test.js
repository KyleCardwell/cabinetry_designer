import { describe, expect, it } from 'vitest';
import { isSeamKey, pairHalves, pairKey, pairSeam, parseSeam, rankedPosition, seamKey } from '../seamLinks.js';

describe('seam links', () => {
  it.each([
    ['group seam', () => seamKey('r.1', 2), 'r.1:2'],
    ['pair seam', () => pairKey('r.0'), 'r.0:pair'],
  ])('builds a %s key (E5)', (_, build, expected) => {
    expect(build()).toBe(expected);
  });

  it.each([
    ['r:0', { path: 'r', index: 0 }],
    ['r.1.2:3', { path: 'r.1.2', index: 3 }],
    ['r.1:pair', { path: 'r.1', pair: true }],
    ['r.01:00', { path: 'r.01', index: 0 }],
    ['x:0', null],
    ['r:', null],
    ['r:1:2', null],
    ['r:-1', null],
    [null, null],
    [3, null],
  ])('parses %s into a seam reference or null (E5)', (seam, expected) => {
    expect(parseSeam(seam)).toEqual(expected);
  });

  it.each([
    ['r:pair', 'horizontal', true],
    ['r:pair', 'vertical', false],
    ['r:1', 'vertical', true],
    [undefined, 'vertical', false],
  ])('validates %s for %s dividers (E5)', (seam, direction, expected) => {
    expect(isSeamKey(seam, direction)).toBe(expected);
  });

  const left = { type: 'pair_door', path: 'r', half: 'left', x: 2, width: 10 };
  const right = { type: 'pair_door', path: 'r', half: 'right', x: 12.125, width: 10 };

  it.each([
    ['matching paths', [left, right], 12.0625, { left, right }],
    ['different paths', [left, { ...right, path: 'r.1' }], null, null],
    ['no faces', [], null, null],
  ])('finds pair halves and the gap centre with %s (E5)', (_, faces, position, halves) => {
    expect(pairSeam(faces)).toBe(position);
    expect(pairHalves(faces)).toEqual(halves);
  });

  it.each([
    [5, 9, { at: 5, source: 'typed' }],
    [null, 9, { at: 9, source: 'reference' }],
    [null, null, { at: null, source: 'auto' }],
    [0, 9, { at: 0, source: 'typed' }],
    [null, 0, { at: 0, source: 'reference' }],
  ])('ranks typed %s above reference %s and auto (E5)', (typed, reference, expected) => {
    expect(rankedPosition(typed, reference)).toEqual(expected);
  });
});
