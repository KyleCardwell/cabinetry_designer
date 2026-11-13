import { describe, expect, it } from 'vitest';
import { captureSides } from '../capture.js';

const RUN = [
  { id: 'L', kind: 'end_panel', x: 0, z: 4, width: 0.75, height: 30.5, depth: 0.75 },
  { id: 'a', kind: 'cabinet', x: 0.75, z: 4, width: 18, height: 30.5, depth: 24 },
  { id: 'b', kind: 'cabinet', x: 18.75, z: 4, width: 18, height: 30.5, depth: 24 },
  { id: 'F', kind: 'filler', x: 36.75, z: 4, width: 3, height: 30.5, depth: 24 },
];
const UPPER = [{ id: 'u', kind: 'cabinet', x: 24, z: 54, width: 18, height: 30, depth: 12 }];
const TALL_PANEL = { id: 'tp', kind: 'end_panel', x: 23.25, z: 4, width: 0.75, height: 80, depth: 0.75 };
const TALL_BOX = { id: 't2', kind: 'cabinet', x: 42, z: 4, width: 24, height: 80, depth: 24 };

describe('captureSides', () => {
  it('37 uses neighbors in the run', () => {
    expect(captureSides(RUN, 'a')).toEqual({ left: true, right: false });
    expect(captureSides(RUN, 'b')).toEqual({ left: false, right: true });
    expect(captureSides(RUN, 'zz')).toEqual({ left: false, right: false });
  });

  it('38 uses touching pieces of other runs at a bare run edge', () => {
    expect(captureSides(UPPER, 'u', [TALL_PANEL, TALL_BOX])).toEqual({ left: true, right: true });
    expect(captureSides(UPPER, 'u', [TALL_PANEL, { ...TALL_BOX, depth: 12 }])).toEqual({ left: true, right: false });
    expect(captureSides(UPPER, 'u', [TALL_PANEL, { ...TALL_BOX, x: 43.5 }])).toEqual({ left: true, right: false });
    const basePanel = { id: 'bp', kind: 'end_panel', x: 23.25, z: 4, width: 0.75, height: 30.5, depth: 0.75 };
    expect(captureSides(UPPER, 'u', [basePanel])).toEqual({ left: false, right: false });
  });
});
