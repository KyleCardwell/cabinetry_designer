import { expect, it } from 'vitest';
import { menuPosition } from './menuPosition.js';

const container = { width: 800, height: 600 };
const menu = { width: 200, height: 150 };

it('sits below-right of the click when it fits', () => {
  expect(menuPosition({ x: 100, y: 100 }, menu, container, 12)).toEqual({ left: 112, top: 112 });
});

it('flips left of the click near the right edge and above it near the bottom', () => {
  expect(menuPosition({ x: 700, y: 100 }, menu, container, 12)).toEqual({ left: 488, top: 112 });
  expect(menuPosition({ x: 100, y: 550 }, menu, container, 12)).toEqual({ left: 112, top: 388 });
  expect(menuPosition({ x: 790, y: 590 }, menu, container)).toEqual({ left: 590, top: 440 });
});

it('pushes in from the edges when it fits on neither side', () => {
  expect(menuPosition({ x: 150, y: 140 }, { width: 700, height: 500 }, container, 12))
    .toEqual({ left: 96, top: 96 });
  expect(menuPosition({ x: 10, y: 10 }, { width: 900, height: 700 }, container, 12))
    .toEqual({ left: 4, top: 4 });
});
