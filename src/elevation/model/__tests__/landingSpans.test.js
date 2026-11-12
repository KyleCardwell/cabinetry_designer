import { expect, it } from 'vitest';
import { opening, room, wall } from '../../../test/builders.js';
import { K } from '../../../test/fixtures/landingRoomK.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { landingSpans } from '../index.js';

it('Room K has the two back spans and no front spans', () => {
  expect(landingSpans(K, K.walls[2], 'back', DEFAULT_SETTINGS)).toEqual([
    { start: 0, end: 80.5, wallId: 'wall-2', endpoint: 'end', ref: 'left' },
    { start: 85, end: 124, wallId: 'wall-2', endpoint: 'end', ref: 'right' },
  ]);
  expect(landingSpans(K, K.walls[2], 'front', DEFAULT_SETTINGS)).toEqual([]);
});

it('excludes spaces between landings and spaces interrupted by openings or recesses', () => {
  const host = wall({ id: 'host', x1: 0, y1: 0, x2: 100, y2: 0, thickness: 4.5 });
  const subject = room({ walls: [host, ...[30, 60].map((x, index) => wall({
    id: `landed-${index}`, x1: x, y1: 0, x2: x, y2: 30, thickness: 4.5,
    connections: { start: null, end: null },
    landings: { start: { wallId: 'host', side: 'front', ref: 'left', to: 'near', offset: x }, end: null },
  }))] });
  expect(landingSpans(subject, host, 'front', DEFAULT_SETTINGS)).toEqual([
    { start: 0, end: 30, wallId: 'landed-0', endpoint: 'start', ref: 'left' },
    { start: 64.5, end: 100, wallId: 'landed-1', endpoint: 'start', ref: 'right' },
  ]);
  const blockedHost = { ...host,
    openings: [opening({ offset: 10, width: 10, casing: { width: 0, thickness: 0 } })],
    recesses: [{ id: 'recess', kind: 'recess', wallSide: 'front', offset: 75, offsetFrom: 'left', width: 10, depth: 2, bottom: 0, height: 30 }],
  };
  const blocked = { ...subject, walls: [blockedHost, ...subject.walls.slice(1)] };
  expect(landingSpans(blocked, blockedHost, 'front', DEFAULT_SETTINGS)).toEqual([]);
});
