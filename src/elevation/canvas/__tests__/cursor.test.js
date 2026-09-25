import { describe, expect, it } from 'vitest';
import {
  elevationBaseCursor,
  planBaseCursor,
  resolveCursor,
} from '../cursor.js';

describe('canvas cursor helpers', () => {
  it('193. resolves cursor priority and canvas base cursors', () => {
    expect(resolveCursor({ base: 'crosshair' })).toBe('crosshair');
    expect(resolveCursor({ base: 'crosshair', hover: 'pointer' })).toBe('pointer');
    expect(resolveCursor({ base: 'crosshair', hover: 'pointer', hold: 'move' })).toBe('move');
    expect(resolveCursor({ base: 'default', hold: 'ew-resize' })).toBe('ew-resize');

    expect(elevationBaseCursor('draw', 'idle')).toBe('crosshair');
    expect(elevationBaseCursor('select', 'idle')).toBe('default');
    expect(elevationBaseCursor('draw', 'pan-ready')).toBe('grab');
    expect(elevationBaseCursor('select', 'panning')).toBe('grabbing');

    expect(planBaseCursor('wall', 'idle')).toBe('crosshair');
    expect(planBaseCursor('select', 'idle')).toBe('default');
    expect(planBaseCursor('wall', 'panning')).toBe('grabbing');
  });
});
