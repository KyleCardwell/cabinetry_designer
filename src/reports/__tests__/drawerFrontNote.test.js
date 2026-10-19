import { describe, expect, it } from 'vitest';
import { drawerFrontNote } from '../shippingList.js';

const fronts = [
  { type: 'drawer_front', path: 'btm', height: 12, z: 0, x: 0 },
  { type: 'drawer_front', path: 'top', height: 5.875, z: 24, x: 0 },
  { type: 'drawer_front', path: 'mid', height: 12, z: 12, x: 0 },
];
const depths = (top, mid, btm) => new Map([['top', top], ['mid', mid], ['btm', btm]]);

describe('IN10 step a drawer-front depths', () => {
  it('ends the height groups with the common depth (anchor 13)', () => {
    expect(drawerFrontNote(fronts, new Map(), depths(21, 21, 21)))
      .toBe('DF\'s (1 - 5 7/8", 2 - 12", 21" drws)');
  });

  it('tags exceptional depths and combines slide and depth tags (anchor 14)', () => {
    expect(drawerFrontNote(fronts, new Map(), depths(19, 21, 21)))
      .toBe('DF\'s (1 - 5 7/8" (19" deep), 2 - 12", 21" drws)');
    const names = new Map([['btm', 'Accuride 3832']]);
    const sizes = depths(21, 21, 22);
    const before = structuredClone({ fronts, names, sizes });
    expect(drawerFrontNote(fronts, names, sizes))
      .toBe('DF\'s (1 - 5 7/8", 1 - 12", 1 - 12" (Accuride 3832, 22" deep), 21" drws)');
    expect({ fronts, names, sizes }).toEqual(before);
  });

  it('uses singular for one front and preserves rounded groups without depths (anchor 15)', () => {
    expect(drawerFrontNote([fronts[1]], new Map(), new Map([['top', 18]])))
      .toBe('DF\'s (1 - 5 7/8", 18" drw)');
    const faces = [
      { type: 'drawer_front', path: 'bottom', height: 6.001, x: 0, z: 0 },
      { type: 'drawer_front', path: 'right', height: 6, x: 10, z: 10 },
      { type: 'drawer_front', path: 'left', height: 6, x: 0, z: 10 },
      { type: 'false_front', path: 'false', height: 6, z: 30 },
    ];
    const names = new Map([['left', 'Accuride 3832'], ['bottom', 'Accuride 3832']]);
    expect(drawerFrontNote(faces, names, new Map())).toBe('DF\'s (2 - 6" (Accuride 3832), 1 - 6")');
  });

  it('breaks common-depth ties top-down then left-right and ignores nonfronts and missing depths', () => {
    expect(drawerFrontNote(fronts, new Map(), depths(19, 21, null)))
      .toBe('DF\'s (1 - 5 7/8", 1 - 12" (21" deep), 1 - 12", 19" drws)');
    const faces = [
      { type: 'drawer_front', path: 'right', height: 6, x: 10, z: 10 },
      { type: 'drawer_front', path: 'left', height: 6, x: 0, z: 10 },
      { type: 'door', action: 'pullout', path: 'rot', height: 30, z: 30 },
      { type: 'door', action: 'pullout', path: 'hamper', height: 30, z: 30 },
      { type: 'false_front', path: 'false', height: 6, z: 60 },
    ];
    const sizes = new Map([['left', 18], ['right', 21], ['rot', 22], ['hamper', 22], ['false', 22]]);
    expect(drawerFrontNote(faces, new Map(), sizes)).toBe('DF\'s (1 - 6", 1 - 6" (21" deep), 18" drws)');
    expect(drawerFrontNote(fronts, new Map(), depths(null, null, null)))
      .toBe('DF\'s (1 - 5 7/8", 2 - 12")');
    expect(drawerFrontNote(faces.slice(2), new Map(), sizes)).toBeNull();
  });
});
