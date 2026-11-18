import { expect, it } from 'vitest';
import { placePartBadges } from '../badgePlacement.js';

it.each([
  {
    name: 'staggers coincident badges along their parts',
    badges: [
      { key: 'first', rect: { x: 0, z: 0, width: 30, height: 30 }, prefer: { x: 15, z: 15 } },
      { key: 'second', rect: { x: 0, z: 0, width: 30, height: 30 }, prefer: { x: 15, z: 15 } },
    ],
    expected: [{ x: 15, z: 15, leader: null }, { x: 15, z: 21, leader: null }],
  },
  {
    name: 'centres a wide badge on a narrow end panel',
    badges: [
      { key: 'cabinet', rect: { x: 0.75, z: 0, width: 24, height: 34.5 }, prefer: { x: 12.75, z: 17.25 } },
      { key: 'panel', rect: { x: 0, z: 0, width: 0.75, height: 34.5 }, prefer: { x: 0.375, z: 17.25 } },
    ],
    expected: [{ x: 12.75, z: 17.25, leader: null }, { x: 0.375, z: 17.25, leader: null }],
  },
  {
    name: 'staggers a frame vertically on its stile',
    badges: [{ key: 'frame', rect: { x: 0, z: 0, width: 30, height: 30 },
      prefer: { x: 0.75, z: 15 }, axis: 'vertical' }],
    taken: [{ x: 0.75, z: 15, width: 6, height: 4.5 }],
    expected: [{ x: 0.75, z: 21, leader: null }],
  },
  {
    name: 'moves a corner cabinet badge onto its uncovered face',
    badges: [{ key: 'corner', rect: { x: 0, z: 0, width: 36, height: 30 },
      prefer: { x: 18, z: 15 }, blockers: [{ x: 0, z: 0, width: 24, height: 30 }] }],
    expected: [{ x: 25.5, z: 15, leader: null }],
  },
  {
    name: 'rests at centre when no part in front blocks it',
    badges: [{ key: 'corner', rect: { x: 0, z: 0, width: 36, height: 30 }, prefer: { x: 18, z: 15 } }],
    expected: [{ x: 18, z: 15, leader: null }],
  },
  {
    name: 'leads from the box bottom to a fully covered part',
    badges: [{ key: 'covered', rect: { x: 0, z: 0, width: 30, height: 30 },
      prefer: { x: 15, z: 15 }, blockers: [{ x: 0, z: 0, width: 30, height: 30 }] }],
    expected: [{ x: 15, z: 33.75, leader: { x1: 15, z1: 31.5, x2: 15, z2: 15 } }],
  },
  {
    name: 'reserves the molding spot before placing part badges',
    badges: [
      { key: 'part', rect: { x: 0, z: 0, width: 30, height: 30 }, prefer: { x: 15, z: 15 } },
      { key: 'molding', rect: { x: 0, z: 13, width: 30, height: 4 },
        prefer: { x: 15, z: 15 }, axis: 'horizontal' },
    ],
    expected: [{ x: 15, z: 21, leader: null }, { x: 15, z: 15, leader: null }],
  },
])('$name (GC5)', ({ badges, taken = [], expected }) => {
  const inputs = badges.map((badge) => ({ text: badge.key, width: 6, height: 4.5,
    axis: 'free', blockers: [], ...badge }));
  const placed = placePartBadges(inputs, { gap: 1.5, taken });
  expect(placed.map(({ key }) => key)).toEqual(inputs.map(({ key }) => key));
  placed.forEach((badge, index) => expect(badge).toMatchObject(expected[index]));
});
