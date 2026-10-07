import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cabinetFaces, faceArea, resolveFaces } from '../faces.js';

const B18 = { x: 0, z: 4, width: 18, height: 30.5 };
const B30 = { x: 0, z: 4, width: 30, height: 30.5 };
const INSET = { top: 1.5, bottom: 1.5, left: 0.75, right: 0.75, horizontal: 1.5, vertical: 1.5, pair: 0, fit: 0, pairFit: 0 };
const PROFILED = { ...INSET, pair: 0.125, fit: 0.09375, pairFit: 0.0625 };
const PAIR = { type: 'pair_door', size: null };

describe('face fit and pair gap', () => {
  it('39 inset square: faces fill the opening, pair gap 0', () => {
    expect(resolveFaces(PAIR, faceArea(B30, INSET), INSET).faces).toEqual([
      { path: 'r', type: 'pair_door', half: 'left', x: 0.75, z: 5.5, width: 14.25, height: 27.5 },
      { path: 'r', type: 'pair_door', half: 'right', x: 15, z: 5.5, width: 14.25, height: 27.5 },
    ]);
  });

  it('40 inset profiled pair: 1/16 sides, 1/8 between, 3/32 top and bottom', () => {
    expect(resolveFaces(PAIR, faceArea(B30, PROFILED), PROFILED).faces).toEqual([
      { path: 'r', type: 'pair_door', half: 'left', x: 0.8125, z: 5.59375, width: 14.125, height: 27.3125 },
      { path: 'r', type: 'pair_door', half: 'right', x: 15.0625, z: 5.59375, width: 14.125, height: 27.3125 },
    ]);
  });

  it('41 inset profiled stack: sizes are slots, faces are 3/32 inside', () => {
    const face = { direction: 'vertical', size: null, children: [{ type: 'drawer_front', size: 6 }, { type: 'drawer_front', size: null }] };
    expect(resolveFaces(face, faceArea(B18, PROFILED), PROFILED).faces).toEqual([
      { path: 'r.0', type: 'drawer_front', x: 0.84375, z: 27.09375, width: 16.3125, height: 5.8125 },
      { path: 'r.1', type: 'drawer_front', x: 0.84375, z: 5.59375, width: 16.3125, height: 19.8125 },
    ]);
  });

  it('42 cabinetFaces takes reveal values', () => {
    expect(cabinetFaces({ id: 'a' }, B18, CABINET_TYPE_IDS.BASE, DEFAULT_SETTINGS, INSET).faces).toEqual([
      { path: 'r', type: 'door', x: 0.75, z: 5.5, width: 16.5, height: 27.5 },
    ]);
  });
});
