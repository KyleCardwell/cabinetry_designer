import { describe, expect, it } from 'vitest';
import { absorberIndexes, splitLine } from '../splitLine.js';

describe('splitLine', () => {
  it.each([
    {
      behavior: 'shares remaining length between auto children',
      children: [{ size: null }, { size: 12 }, { size: null }],
      length: 40,
      options: { gaps: [0.5, 0.5], short: 'share' },
      expected: {
        sizes: [13.5, 12, 13.5], starts: [0, 14, 26.5],
        autoCount: 2, remainder: 27, autoSize: 13.5,
      },
    },
    {
      behavior: 'assigns leftover length to the last typed child',
      children: [{ size: 10 }, { size: 10 }, { size: 10 }],
      length: 36,
      options: {},
      expected: {
        sizes: [10, 10, 16], starts: [0, 10, 20],
        autoCount: 0, remainder: 6, autoSize: 16,
      },
    },
    {
      behavior: 'allows negative auto shares',
      children: [{ size: null }, { size: 30 }],
      length: 24,
      options: { gaps: [1], short: 'share' },
      expected: {
        sizes: [-7, 30], starts: [0, -6],
        autoCount: 1, remainder: -7, autoSize: -7,
      },
    },
    {
      behavior: 'shares positive remainder with undefined auto sizes',
      children: [{}, { size: 8 }, {}],
      length: 30,
      options: { gaps: [3, 3], short: 'lastTyped' },
      expected: {
        sizes: [8, 8, 8], starts: [0, 11, 22],
        autoCount: 2, remainder: 16, autoSize: 8,
      },
    },
    {
      behavior: 'shrinks the last typed child when overfull',
      children: [{ size: 10 }, {}, { size: 10 }],
      length: 20,
      options: { gaps: [2, 2], short: 'lastTyped' },
      expected: {
        sizes: [10, 0, 6], starts: [0, 12, 14],
        autoCount: 1, remainder: -4, autoSize: 0,
      },
    },
    {
      behavior: 'gives auto children zero when no remainder is available',
      children: [{ size: 18 }, {}],
      length: 20,
      options: { gaps: [2], short: 'lastTyped' },
      expected: {
        sizes: [18, 0], starts: [0, 20],
        autoCount: 1, remainder: 0, autoSize: 0,
      },
    },
    {
      behavior: 'adds fit extras to auto shares',
      children: [{ size: null, extra: 0.125 }, { size: null, extra: 0.125 }],
      length: 20,
      options: { gaps: [0.5], short: 'share' },
      expected: {
        sizes: [9.75, 9.75], starts: [0, 10.25],
        autoCount: 2, remainder: 19.25, autoSize: 9.625,
      },
    },
  ])('$behavior (E1)', ({ children, length, options, expected }) => {
    expect(splitLine(children, length, options)).toEqual(expected);
  });

  it('identifies auto absorbers or the last typed child (E1)', () => {
    expect(absorberIndexes([{ size: null }, { size: 5 }, { size: null }])).toEqual([0, 2]);
    expect(absorberIndexes([{ size: 5 }, { size: 5 }])).toEqual([1]);
  });
});
