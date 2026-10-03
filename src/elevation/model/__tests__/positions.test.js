import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import {
  openingGeometry,
  setOffsetAnchor,
} from '../openings.js';
import { positionReadouts, startFromReadout } from '../positions.js';

const door = {
  id: 'door-1',
  kind: 'door',
  label: 'D1',
  measureMode: 'jamb',
  width: 36,
  height: 80,
  sillZ: 0,
  offset: 24,
  offsetFrom: 'left',
  offsetAnchor: 'edge',
  casing: { width: 3, thickness: 0.75 },
};

describe('position readouts', () => {
  it('11. returns edge and center positions from both wall ends', () => {
    expect(positionReadouts(24, 36, 120)).toEqual({
      left: { edge: 24, center: 42 },
      right: { edge: 60, center: 78 },
    });
  });

  it('12. round-trips spans at, inside, and past both wall ends', () => {
    const spans = [
      { start: 0, width: 36, wallLength: 120 },
      { start: 84, width: 36, wallLength: 120 },
      { start: 24, width: 36, wallLength: 120 },
      { start: -12, width: 36, wallLength: 120 },
      { start: 96, width: 36, wallLength: 120 },
    ];

    for (const { start, width, wallLength } of spans) {
      const readouts = positionReadouts(start, width, wallLength);
      for (const from of ['left', 'right']) {
        for (const anchor of ['edge', 'center']) {
          expect(startFromReadout(
            from,
            anchor,
            readouts[from][anchor],
            width,
            wallLength,
          )).toBe(start);
        }
      }
    }
  });

  it('13. changes an opening offset anchor without changing its geometry', () => {
    const originalGeometry = openingGeometry(door, 120, DEFAULT_SETTINGS);
    const centered = setOffsetAnchor(door, 'center', 120, DEFAULT_SETTINGS);
    expect(centered).toMatchObject({ offsetAnchor: 'center', offset: 42 });
    expect(openingGeometry(centered, 120, DEFAULT_SETTINGS)).toEqual(originalGeometry);

    const edged = setOffsetAnchor(centered, 'edge', 120, DEFAULT_SETTINGS);
    expect(edged).toMatchObject({ offsetAnchor: 'edge', offset: 24 });
    expect(openingGeometry(edged, 120, DEFAULT_SETTINGS)).toEqual(originalGeometry);
  });

  it('14. returns nested jamb and casing offsets', () => {
    expect(openingGeometry(door, 120, DEFAULT_SETTINGS).offsets).toEqual({
      left: {
        jamb: { edge: 24, center: 42 },
        casing: { edge: 21, center: 42 },
      },
      right: {
        jamb: { edge: 60, center: 78 },
        casing: { edge: 57, center: 78 },
      },
    });
  });
});
