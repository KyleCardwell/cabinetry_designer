import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { resizeOpening } from '../openings.js';
import { stretchedStart } from '../positions.js';

function door(overrides = {}) {
  return {
    id: 'door-1', kind: 'door', label: 'D1', measureMode: 'jamb', width: 36, height: 80, sillZ: 0,
    offset: 24, offsetFrom: 'left', offsetAnchor: 'edge', casing: { width: 3, thickness: 0.75 },
    ...overrides,
  };
}

const offsetAfter = (opening, width, grow) => resizeOpening(opening, width, grow, 144, DEFAULT_SETTINGS).offset;

describe('stretching', () => {
  it('55 stretchedStart keeps the left edge, the right edge or the center', () => {
    expect(stretchedStart(10, 30, 36, 'right')).toBe(10);
    expect(stretchedStart(10, 30, 36, 'left')).toBe(4);
    expect(stretchedStart(10, 30, 36, 'both')).toBe(7);
    expect(stretchedStart(10, 30, 24, 'both')).toBe(13);
  });

  it('56 resizeOpening from the left wall end', () => {
    expect(offsetAfter(door(), 40, 'right')).toBe(24);
    expect(offsetAfter(door(), 40, 'left')).toBe(20);
    expect(offsetAfter(door(), 40, 'both')).toBe(22);
    expect(resizeOpening(door(), 40, 'both', 144, DEFAULT_SETTINGS).width).toBe(40);
  });

  it('57 resizeOpening from the right wall end, casing mode and center anchor', () => {
    const fromRight = door({ offsetFrom: 'right' });
    expect(offsetAfter(fromRight, 40, 'left')).toBe(24);
    expect(offsetAfter(fromRight, 40, 'right')).toBe(20);
    expect(offsetAfter(fromRight, 40, 'both')).toBe(22);
    expect(offsetAfter(door({ measureMode: 'casing', width: 42, offset: 21 }), 48, 'both')).toBe(18);
    expect(offsetAfter(door({ offsetAnchor: 'center', offset: 42 }), 40, 'right')).toBe(44);
    expect(resizeOpening(door(), 0, 'right', 144, DEFAULT_SETTINGS)).toEqual(door());
  });
});
