import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { runFrame } from '../styles.js';

describe('face frame run shape', () => {
  it('derives thickness and the upper door overhang drop for face frame runs', () => {
    const room = { style: { cabinetStyleId: 14 } };

    expect(runFrame(room, { cabinetTypeId: 2 }, DEFAULT_SETTINGS)).toEqual({
      thickness: 0.8125,
      drop: 0.75,
    });
    expect(runFrame(room, { cabinetTypeId: 1 }, DEFAULT_SETTINGS)).toEqual({
      thickness: 0.8125,
      drop: 0,
    });
  });

  it('has no frame for European runs', () => {
    expect(runFrame({}, { cabinetTypeId: 2 }, DEFAULT_SETTINGS)).toBeNull();
  });
});
